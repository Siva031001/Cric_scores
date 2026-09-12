// ─────────────────────────────────────────────────────────────
// INNINGS REDUCER — the single source of truth
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// Everything derived about an innings is computed here by folding the
// ordered event log. Nothing else in the codebase is permitted to mutate a
// score, a wicket count, an over count or a stat line.
//
// That is what makes undo and historical ball editing correct rather than
// approximate: both operations just change the event array and re-fold. No
// displayed total is ever patched in place.
//
//   MatchEvent[]  ->  reduceInnings()  ->  InningsState
//
// The output deliberately reuses the existing Firebase field names
// (runs / wickets / overs / balls / batsmanStats / bowlerStats / extras /
// ballHistory) so every current consumer keeps working unchanged. New
// information is added alongside; nothing is renamed or removed.
// ─────────────────────────────────────────────────────────────

import {
  BallEvent,
  CompetitionRules,
  CreaseSlot,
  DerivedBatsmanStats,
  DerivedBowlerStats,
  DerivedFieldingStats,
  InningsSetup,
  InningsState,
  LegacyBall,
  MatchEvent,
  Partnership,
  RetirementType,
  isBallEvent,
} from './types';
import { toLegacyBall } from './legacy';

/**
 * Stat maps are keyed `p<playerId>`, never the bare number.
 *
 * Firebase Realtime Database converts an object whose keys are sequential
 * integers from 0 into a JS ARRAY on read, filling gaps with null. Our stat
 * maps are naturally sparse (only players who actually batted get an entry),
 * so a numeric key turns them into arrays with null holes, and those nulls
 * then spread into `{}` downstream as corrupted partial stat objects.
 */
export const statKey = (id: number): string => 'p' + id;

export const emptyBatsmanStats = (playerId: number): DerivedBatsmanStats => ({
  playerId,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  dots: 0,
  isOut: false,
  dismissalType: null,
  fielderName: null,
  bowlerId: null,
  globalPlayerId: null,
  retired: null,
  canReturn: false,
});

export const emptyBowlerStats = (playerId: number): DerivedBowlerStats => ({
  playerId,
  overs: 0,
  balls: 0,
  runs: 0,
  wickets: 0,
  wides: 0,
  noBalls: 0,
  maidens: 0,
  dots: 0,
  globalPlayerId: null,
});

const emptyFielding = (displayName: string): DerivedFieldingStats => ({
  catches: 0,
  stumpings: 0,
  runOuts: 0,
  globalPlayerId: null,
  fielderId: null,
  displayName,
});

/**
 * Sanitises a player name for use as a Firebase key. RTDB forbids
 * . # $ [ ] / in key names.
 */
export const fieldingKey = (name: string): string =>
  (name || 'Unknown').replace(/[.#$/[\]]/g, '_').trim() || 'Unknown';

const createInitialState = (setup: InningsSetup, rules: CompetitionRules): InningsState => ({
  runs: 0,
  wickets: 0,
  overs: 0,
  balls: 0,
  strikerId: setup.strikerId,
  nonStrikerId: setup.nonStrikerId,
  currentBowlerId: setup.bowlerId,
  batsmanStats: {
    [statKey(setup.strikerId)]: emptyBatsmanStats(setup.strikerId),
    [statKey(setup.nonStrikerId)]: emptyBatsmanStats(setup.nonStrikerId),
  },
  bowlerStats: {
    [statKey(setup.bowlerId)]: emptyBowlerStats(setup.bowlerId),
  },
  fieldingStats: {},
  extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
  ballHistory: [],
  freeHit: false,
  legalBalls: 0,
  totalDeliveries: 0,
  partnerships: [],
  wormPoints: [{ over: 0, runs: 0 }],
  retired: [],
  penaltyRunsAgainst: 0,
  isSuperOver: !!setup.isSuperOver,
  battingOrder: [setup.strikerId, setup.nonStrikerId],
  awaitingBatsmanSlot: null,
  awaitingBowler: false,
});

// ── Fold ────────────────────────────────────────────────────

export interface ReduceResult {
  state: InningsState;
  /** Events that could not be applied, with the reason. Never thrown —
   *  a corrupt historical event must not make a match unopenable. */
  warnings: Array<{ seq: number; message: string }>;
}

export const reduceInningsVerbose = (
  events: MatchEvent[],
  setup: InningsSetup,
  rules: CompetitionRules
): ReduceResult => {
  const state = createInitialState(setup, rules);
  const warnings: ReduceResult['warnings'] = [];

  const gidBat = new Map<number, string | null>();
  const gidBowl = new Map<number, string | null>();
  (setup.battingPlayers ?? []).forEach(p => gidBat.set(p.id, p.globalPlayerId ?? null));
  (setup.bowlingPlayers ?? []).forEach(p => gidBowl.set(p.id, p.globalPlayerId ?? null));
  const nameOf = new Map<number, string>();
  [...(setup.battingPlayers ?? []), ...(setup.bowlingPlayers ?? [])].forEach(p => {
    if (p.name) nameOf.set(p.id, p.name);
  });

  const ensureBat = (id: number): DerivedBatsmanStats => {
    const k = statKey(id);
    if (!state.batsmanStats[k]) {
      state.batsmanStats[k] = emptyBatsmanStats(id);
      if (!state.battingOrder.includes(id)) state.battingOrder.push(id);
    }
    const s = state.batsmanStats[k];
    if (gidBat.has(id)) s.globalPlayerId = gidBat.get(id) ?? null;
    return s;
  };

  const ensureBowl = (id: number): DerivedBowlerStats => {
    const k = statKey(id);
    if (!state.bowlerStats[k]) state.bowlerStats[k] = emptyBowlerStats(id);
    const s = state.bowlerStats[k];
    if (gidBowl.has(id)) s.globalPlayerId = gidBowl.get(id) ?? null;
    return s;
  };

  // Per-bowler legal ball tally. Overs/balls are derived from this rather
  // than incremented off the innings counter, so a bowler who bowls a
  // partial over cannot desync from the team ball count.
  const bowlerLegalBalls = new Map<number, number>();

  // Maiden tracking. A maiden is an over from which the BOWLER concedes no
  // runs; byes and leg byes are not charged to the bowler so they do not
  // break one.
  let overBowlerId = setup.bowlerId;
  let overLegalBalls = 0;
  let overRunsConceded = 0;

  let cumRuns = 0;

  let pair: { a: number; b: number; runs: number; balls: number } | null = {
    a: setup.strikerId,
    b: setup.nonStrikerId,
    runs: 0,
    balls: 0,
  };
  let pendingSurvivor: number | null = null;

  const closePair = (unbeaten: boolean) => {
    if (!pair) return;
    state.partnerships.push({
      batterAId: pair.a,
      batterBId: pair.b,
      runs: pair.runs,
      balls: pair.balls,
      unbeaten,
    });
    pair = null;
  };

  const swapEnds = () => {
    const t = state.strikerId;
    state.strikerId = state.nonStrikerId;
    state.nonStrikerId = t;
  };

  const ordered = [...events].sort((a, b) => a.seq - b.seq);

  for (const ev of ordered) {
    if (isBallEvent(ev)) {
      applyBall(ev);
      continue;
    }

    switch (ev.kind) {
      case 'NEW_BATSMAN': {
        const bs = ensureBat(ev.playerId);
        bs.retired = null;
        bs.canReturn = false;
        if (ev.slot === 'nonStriker') state.nonStrikerId = ev.playerId;
        else state.strikerId = ev.playerId;
        state.awaitingBatsmanSlot = null;
        // Open the next partnership with whoever survived the wicket.
        if (pendingSurvivor != null) {
          pair = { a: pendingSurvivor, b: ev.playerId, runs: 0, balls: 0 };
          pendingSurvivor = null;
        } else if (!pair) {
          pair = { a: state.strikerId, b: state.nonStrikerId, runs: 0, balls: 0 };
        }
        break;
      }

      case 'BOWLER_CHANGE': {
        ensureBowl(ev.bowlerId);
        state.currentBowlerId = ev.bowlerId;
        state.awaitingBowler = false;
        overBowlerId = ev.bowlerId;
        break;
      }

      case 'RETIREMENT': {
        applyRetirement(ev.playerId, ev.retirementType);
        break;
      }

      case 'RETURN_TO_BAT': {
        const bs = ensureBat(ev.playerId);
        if (bs.retired !== 'RETIRED_HURT') {
          warnings.push({
            seq: ev.seq,
            message: `Player ${ev.playerId} cannot return: not retired hurt`,
          });
          break;
        }
        bs.retired = null;
        bs.canReturn = false;
        const rec = state.retired.find(r => r.playerId === ev.playerId);
        if (rec) rec.returned = true;
        if (ev.slot === 'nonStriker') state.nonStrikerId = ev.playerId;
        else state.strikerId = ev.playerId;
        state.awaitingBatsmanSlot = null;
        if (pendingSurvivor != null) {
          pair = { a: pendingSurvivor, b: ev.playerId, runs: 0, balls: 0 };
          pendingSurvivor = null;
        }
        break;
      }

      case 'PENALTY': {
        // Penalty runs are never charged to a bowler. Awarded against the
        // batting side they go to the opposition, so they are tracked
        // separately rather than added to this innings' total.
        if (ev.awardedTo === 'BATTING') {
          state.runs += ev.runs;
          state.extras.penalty += ev.runs;
          cumRuns += ev.runs;
          if (pair) pair.runs += ev.runs;
        } else {
          state.penaltyRunsAgainst += ev.runs;
        }
        break;
      }

      case 'REPLACEMENT':
      case 'INTERRUPTION':
        // Recorded at match level; no effect on this innings' arithmetic.
        break;

      default:
        warnings.push({ seq: (ev as MatchEvent).seq, message: 'Unknown event kind' });
    }
  }

  // Flush the unfinished partnership.
  if (pair && (pair.runs > 0 || pair.balls > 0 || state.partnerships.length === 0)) {
    closePair(true);
  }

  // Final worm point at the innings' actual position, so the series ends
  // exactly where the scoreboard does.
  const finalOver = state.overs + state.balls / rules.ballsPerOver;
  const last = state.wormPoints[state.wormPoints.length - 1];
  if (!last || last.over !== finalOver) {
    state.wormPoints.push({ over: finalOver, runs: state.runs });
  }

  return { state, warnings };

  // ── Event appliers ──

  function applyRetirement(playerId: number, type: RetirementType) {
    const bs = ensureBat(playerId);
    bs.retired = type;

    if (type === 'RETIRED_HURT') {
      // Not a wicket. The batter keeps every run and may resume later.
      bs.isOut = false;
      bs.canReturn = true;
      bs.dismissalType = null;
    } else {
      // Retired out IS a wicket, but no bowler earned it.
      bs.isOut = true;
      bs.canReturn = false;
      bs.dismissalType = 'RETIRED_OUT';
      state.wickets += 1;
      if (rules.creditBowlerForRetiredOut) {
        ensureBowl(state.currentBowlerId).wickets += 1;
      }
      closePair(false);
      pendingSurvivor = playerId === state.strikerId ? state.nonStrikerId : state.strikerId;
    }

    if (!state.retired.some(r => r.playerId === playerId && !r.returned)) {
      state.retired.push({ playerId, type, returned: false });
    }

    if (type === 'RETIRED_HURT') {
      closePair(false);
      pendingSurvivor = playerId === state.strikerId ? state.nonStrikerId : state.strikerId;
    }

    state.awaitingBatsmanSlot = playerId === state.nonStrikerId ? 'nonStriker' : 'striker';
  }

  function applyBall(e: BallEvent) {
    const bat = ensureBat(e.strikerId);
    ensureBat(e.nonStrikerId);
    const bowl = ensureBowl(e.bowlerId);

    // An event records who was ACTUALLY on strike when it was bowled, so
    // replay trusts it rather than re-deriving. If an earlier ball was later
    // edited in a way that changes crossing parity, the recorded ends stop
    // matching the replayed ends — that is a real inconsistency the scorer
    // needs to resolve, so it is surfaced rather than silently absorbed.
    if (state.strikerId !== e.strikerId && state.awaitingBatsmanSlot == null) {
      warnings.push({
        seq: e.seq,
        message:
          `Recorded striker (${e.strikerId}) differs from replayed striker ` +
          `(${state.strikerId}). An earlier edit changed who was on strike — ` +
          `review the deliveries after this point.`,
      });
    }

    state.strikerId = e.strikerId;
    state.nonStrikerId = e.nonStrikerId;
    state.currentBowlerId = e.bowlerId;

    if (overBowlerId !== e.bowlerId && overLegalBalls === 0) overBowlerId = e.bowlerId;

    // ── Team total ──
    state.runs += e.totalRuns;
    cumRuns += e.totalRuns;
    state.totalDeliveries += 1;

    // ── Extras ──
    state.extras.wides += e.extras.wide;
    state.extras.noBalls += e.extras.noBall;
    state.extras.byes += e.extras.bye;
    state.extras.legByes += e.extras.legBye;
    state.extras.penalty += e.extras.penalty;

    // ── Batter ──
    if (e.batterFacedBall) bat.balls += 1;
    bat.runs += e.batterRuns;
    if (e.boundary === 4) bat.fours += 1;
    if (e.boundary === 6) bat.sixes += 1;
    // A dot is a legal delivery yielding nothing. Wicket balls are excluded
    // to preserve the app's established dot figures.
    if (e.legalDelivery && e.totalRuns === 0 && !e.wicket) {
      bat.dots += 1;
      bowl.dots += 1;
    }

    // ── Bowler ──
    // Byes, leg byes and penalties are NOT charged to the bowler.
    const chargedRuns = e.batterRuns + e.extras.wide + e.extras.noBall;
    bowl.runs += chargedRuns;
    if (e.deliveryType === 'WIDE') bowl.wides += 1;
    if (e.deliveryType === 'NO_BALL') bowl.noBalls += 1;
    overRunsConceded += chargedRuns;

    if (e.legalDelivery) {
      const n = (bowlerLegalBalls.get(e.bowlerId) ?? 0) + 1;
      bowlerLegalBalls.set(e.bowlerId, n);
      bowl.overs = Math.floor(n / rules.ballsPerOver);
      bowl.balls = n % rules.ballsPerOver;
    }

    // ── Wicket ──
    let overCompleted = false;

    // The closing ball still belongs to the partnership: runs completed
    // before a run-out count toward it, and the delivery itself is a ball
    // faced. Credited BEFORE the pair is closed, otherwise both are lost.
    if (pair) {
      pair.runs += e.totalRuns;
      if (e.legalDelivery) pair.balls += 1;
    }

    if (e.wicket) {
      const w = e.wicket;
      if (w.countsAsWicket) state.wickets += 1;
      if (w.creditBowler) bowl.wickets += 1;

      const outBat = ensureBat(w.playerOutId);
      outBat.isOut = w.countsAsWicket;
      outBat.dismissalType = w.type;
      outBat.fielderName = w.fielderName ?? null;
      outBat.bowlerId = e.bowlerId;

      // ── Fielding credit ──
      // Keyed by sanitised name because the legacy schema stored fielders by
      // display name, and existing matches must keep aggregating.
      if (w.fielderName && w.fielderName !== 'Skip') {
        const fk = fieldingKey(w.fielderName);
        if (!state.fieldingStats[fk]) {
          state.fieldingStats[fk] = emptyFielding(w.fielderName);
        }
        const fs = state.fieldingStats[fk];
        if (w.fielderId != null && gidBowl.has(w.fielderId)) {
          fs.globalPlayerId = gidBowl.get(w.fielderId) ?? null;
        }
        if (w.fielderId != null) {
          fs.fielderId = w.fielderId;
        }
        if (w.type === 'STUMPED') fs.stumpings += 1;
        else if (w.type === 'RUN_OUT') fs.runOuts += 1;
        else if (w.type === 'CAUGHT' || w.type === 'CAUGHT_AND_BOWLED') fs.catches += 1;
      }

      closePair(false);
      pendingSurvivor =
        w.playerOutId === e.strikerId ? e.nonStrikerId : e.strikerId;
    }

    // ── Over / ball counters ──
    if (e.legalDelivery) {
      state.legalBalls += 1;
      state.balls += 1;
      overLegalBalls += 1;
      if (state.balls >= rules.ballsPerOver) {
        state.balls = 0;
        state.overs += 1;
        overCompleted = true;
      }
    }

    // ── Strike rotation ──
    // Driven by runs the batters physically completed. A boundary four is
    // 4 runs but no crossings, which is why crossingRuns is stored on the
    // event rather than re-derived from the total.
    if (e.crossingRuns % 2 !== 0) swapEnds();

    if (overCompleted) {
      swapEnds();
      if (overRunsConceded === 0) {
        ensureBowl(overBowlerId).maidens += 1;
      }
      state.wormPoints.push({ over: state.overs, runs: cumRuns });
      overLegalBalls = 0;
      overRunsConceded = 0;
      state.awaitingBowler = true;
    }

    // ── Vacant crease ──
    // Computed after rotation so the correct end is flagged, which is what
    // makes a non-striker run-out put the incoming batter in the right slot.
    if (e.wicket?.countsAsWicket) {
      state.awaitingBatsmanSlot =
        state.nonStrikerId === e.wicket.playerOutId ? 'nonStriker' : 'striker';
    }

    // ── Free hit ──
    // Set by a no-ball, consumed by the next LEGAL delivery. A wide does
    // not consume it.
    if (e.deliveryType === 'NO_BALL') {
      state.freeHit = rules.freeHitAfterNoBall;
    } else if (e.legalDelivery) {
      state.freeHit = false;
    }

    // ── Legacy view ──
    state.ballHistory.push(toLegacyBall(e, rules.widePenaltyRuns));
  }
};

/** Convenience wrapper — the reduced state without the warning channel. */
export const reduceInnings = (
  events: MatchEvent[],
  setup: InningsSetup,
  rules: CompetitionRules
): InningsState => reduceInningsVerbose(events, setup, rules).state;

// ── Helpers used by the UI and by outcome calculation ───────

export const oversDecimal = (state: InningsState, rules: CompetitionRules): number =>
  state.overs + state.balls / rules.ballsPerOver;

export const isAllOut = (state: InningsState, rules: CompetitionRules): boolean =>
  state.wickets >= rules.allOutWickets;

export const areOversComplete = (state: InningsState, rules: CompetitionRules): boolean =>
  state.overs >= rules.totalOvers;

/**
 * An innings ends when the side is all out, the overs run out, or (chasing)
 * the target is passed. `target` is the number of runs needed to WIN.
 */
export const isInningsComplete = (
  state: InningsState,
  rules: CompetitionRules,
  target?: number | null
): boolean => {
  if (isAllOut(state, rules)) return true;
  if (areOversComplete(state, rules)) return true;
  if (target != null && state.runs >= target) return true;
  return false;
};

/** Batters still available to come in. Retired-hurt players are eligible. */
export const availableBatters = (
  state: InningsState,
  rosterIds: number[]
): number[] =>
  rosterIds.filter(id => {
    const bs = state.batsmanStats[statKey(id)];
    if (!bs) return true;
    if (bs.isOut) return false;
    if (bs.retired === 'RETIRED_HURT') return false; // must use Return to Bat
    if (bs.retired === 'RETIRED_OUT') return false;
    return id !== state.strikerId && id !== state.nonStrikerId;
  });

/** Retired-hurt players who may resume. */
export const returnableBatters = (state: InningsState): number[] =>
  state.retired.filter(r => r.type === 'RETIRED_HURT' && !r.returned).map(r => r.playerId);

/** Bowlers who have not used up their quota, if the profile sets one. */
export const eligibleBowlers = (
  state: InningsState,
  rosterIds: number[],
  rules: CompetitionRules
): number[] =>
  rosterIds.filter(id => {
    if (id === state.currentBowlerId) return false; // no consecutive overs
    if (rules.maxOversPerBowler == null) return true;
    const bs = state.bowlerStats[statKey(id)];
    if (!bs) return true;
    const used = bs.overs + (bs.balls > 0 ? 1 : 0);
    return used < rules.maxOversPerBowler;
  });
