// ─────────────────────────────────────────────────────────────
// LEGACY BALL-HISTORY ADAPTER
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// Every match scored before the engine existed stores its deliveries as a
// single opaque string per ball ("WD2", "NB3", "2W(RO)", "PEN5"). This
// module is the only place in the codebase that is allowed to know that
// encoding. It converts both ways:
//
//   fromLegacyHistory()  old string history -> structured MatchEvent[]
//   toLegacyResult()     structured BallEvent -> old string token
//
// The forward direction lets existing matches replay through the new
// reducer. The reverse direction lets the engine keep writing the old
// `ballHistory` array to Firebase, so any consumer not yet migrated
// carries on working untouched.
//
// Fidelity note: the legacy encoding is lossy. It cannot express run
// attribution on a no-ball, boundary-vs-overthrow, short runs, penalty
// recipient, or how a batter was dismissed (that lived on batsmanStats).
// Converted events therefore reproduce the OLD behaviour exactly rather
// than guessing at information that was never recorded — see the notes on
// each branch below.
// ─────────────────────────────────────────────────────────────

import {
  BallEvent,
  LegacyBall,
  MatchEvent,
  DismissalType,
  RunType,
  InningsKey,
} from './types';

let autoId = 0;
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(autoId++).toString(36)}`;

/** Reset the id counter. Test-only; keeps generated ids deterministic. */
export const __resetIdCounter = () => {
  autoId = 0;
};

const num = (s: string): number => {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
};

const boundaryFor = (runs: number): 0 | 4 | 6 => (runs === 4 ? 4 : runs === 6 ? 6 : 0);

const runTypeFor = (runs: number): RunType => {
  if (runs === 0) return 'NONE';
  if (runs === 4) return 'BOUNDARY_FOUR';
  if (runs === 6) return 'BOUNDARY_SIX';
  return 'RUNNING';
};

const emptyExtras = () => ({ wide: 0, noBall: 0, bye: 0, legBye: 0, penalty: 0 });

/** True for the `{ type: 'NEW_BATSMAN' }` marker entries. */
export const isLegacyNewBatsman = (b: LegacyBall): boolean => b?.type === 'NEW_BATSMAN';

/** True for a legacy run-out token: "W(RO)" or "<n>W(RO)". */
export const isLegacyRunOut = (result: string): boolean =>
  result === 'W(RO)' || /^\d+W\(RO\)$/.test(result);

/** True for any legacy wicket token. */
export const isLegacyWicket = (result: string): boolean =>
  result === 'W' || result.startsWith('W(') || /^\d+W\(/.test(result);

// ── Forward: legacy -> events ───────────────────────────────

interface ConvertCtx {
  inningsKey: InningsKey;
  /** Dismissal types recovered from batsmanStats, keyed by player id.
   *  The legacy history never stored how a batter was out. */
  dismissalByPlayerId?: Record<number, DismissalType>;
  startSeq?: number;
  timestamp?: number;
}

/**
 * Converts one legacy history entry into a MatchEvent.
 * Returns null for entries that carry no recoverable information.
 */
const convertEntry = (
  entry: LegacyBall,
  seq: number,
  ctx: ConvertCtx
): MatchEvent | null => {
  const { inningsKey } = ctx;
  const timestamp = ctx.timestamp ?? 0;

  if (isLegacyNewBatsman(entry)) {
    return {
      kind: 'NEW_BATSMAN',
      id: nextId('legacy_nb'),
      seq,
      inningsKey,
      timestamp,
      playerId: entry.newBatsmanId ?? -1,
      // The legacy marker never recorded which crease was filled, and the
      // old undo path always restored the incoming batter as striker.
      // Reproducing that keeps converted matches identical to before.
      slot: 'striker',
    };
  }

  const result = entry.result;
  if (typeof result !== 'string' || result.length === 0) return null;

  const strikerId = entry.batsmanId ?? 0;
  const nonStrikerId = entry.nonStrikerIdBefore ?? 0;
  const bowlerId = entry.bowlerId ?? 0;

  const shell = {
    kind: 'BALL' as const,
    id: nextId('legacy_ball'),
    seq,
    inningsKey,
    timestamp,
    over: entry.over ?? 0,
    ball: entry.ball ?? 0,
    strikerId,
    nonStrikerId,
    bowlerId,
    freeHitBefore: false,
    freeHitAfter: false,
    overthrowRuns: 0,
    extras: emptyExtras(),
  };

  // ── Penalty ──
  // The legacy encoding put penalties in ballHistory even though they are
  // not deliveries. Emitting a PenaltyEvent preserves the runs without
  // wrongly consuming a ball (the old code did not advance the over here
  // either, so this matches).
  if (result.startsWith('PEN')) {
    return {
      kind: 'PENALTY',
      id: nextId('legacy_pen'),
      seq,
      inningsKey,
      timestamp,
      runs: num(result.slice(3)) || 5,
      awardedTo: 'BATTING',
      reason: 'Unspecified (migrated)',
    };
  }

  // ── Run out ──
  // Legacy stored the DISMISSED batter in batsmanId (inverted vs every
  // other entry) and credited the completed runs to the striker.
  if (isLegacyRunOut(result)) {
    const m = result.match(/^(\d+)W\(RO\)$/);
    const runsCompleted = m ? num(m[1]) : 0;
    return {
      ...shell,
      deliveryType: 'LEGAL',
      legalDelivery: true,
      batterFacedBall: true,
      batterRuns: runsCompleted,
      totalRuns: runsCompleted,
      crossingRuns: runsCompleted,
      runType: runsCompleted > 0 ? 'RUNNING' : 'NONE',
      boundary: 0,
      wicket: {
        type: 'RUN_OUT',
        playerOutId: strikerId,
        fielderName: entry.fielderName ?? null,
        fielderId: null,
        creditBowler: false,
        countsAsWicket: true,
      },
    };
  }

  // ── Other wickets ──
  if (isLegacyWicket(result)) {
    return {
      ...shell,
      deliveryType: 'LEGAL',
      legalDelivery: true,
      batterFacedBall: true,
      batterRuns: 0,
      totalRuns: 0,
      crossingRuns: 0,
      runType: 'NONE',
      boundary: 0,
      wicket: {
        type: ctx.dismissalByPlayerId?.[strikerId] ?? 'UNKNOWN',
        playerOutId: strikerId,
        fielderName: entry.fielderName ?? null,
        fielderId: null,
        // The old engine credited the bowler for every "W" token,
        // including Retired. Preserved so migrated figures do not shift.
        creditBowler: true,
        countsAsWicket: true,
      },
    };
  }

  // ── Wide ──
  // Legacy semantics: total = 1 penalty + n extra, all of it recorded as
  // wide extras, batter faces no ball, bowler charged the lot.
  if (result.startsWith('WD')) {
    const extra = result === 'WD' ? 0 : num(result.slice(2));
    const total = 1 + extra;
    return {
      ...shell,
      deliveryType: 'WIDE',
      legalDelivery: false,
      batterFacedBall: false,
      batterRuns: 0,
      extras: { ...emptyExtras(), wide: total },
      totalRuns: total,
      crossingRuns: extra,
      runType: extra > 0 ? 'RUNNING' : 'NONE',
      boundary: 0,
    };
  }

  // ── No ball ──
  // Legacy always credited the extra runs to the batter and counted 4/6 as
  // boundaries. That is exactly what the new engine's BATTER attribution
  // does, so migrated no-balls are faithful.
  if (result.startsWith('NB')) {
    const extra = result === 'NB' ? 0 : num(result.slice(2));
    const total = 1 + extra;
    const bnd = boundaryFor(extra);
    return {
      ...shell,
      deliveryType: 'NO_BALL',
      legalDelivery: false,
      batterFacedBall: true,
      batterRuns: extra,
      extras: { ...emptyExtras(), noBall: 1 },
      totalRuns: total,
      crossingRuns: bnd ? 0 : extra,
      runType: runTypeFor(extra),
      boundary: bnd,
      freeHitAfter: true,
    };
  }

  // ── Leg bye ── (checked before bye: "LB" also starts with... no, but
  // "LB" must be matched before the bare "B" branch below)
  if (result.startsWith('LB')) {
    const runs = num(result.slice(2));
    return {
      ...shell,
      deliveryType: 'LEGAL',
      legalDelivery: true,
      batterFacedBall: true,
      batterRuns: 0,
      extras: { ...emptyExtras(), legBye: runs },
      totalRuns: runs,
      crossingRuns: runs,
      runType: runs > 0 ? 'RUNNING' : 'NONE',
      boundary: 0,
    };
  }

  // ── Bye ──
  if (result.startsWith('B')) {
    const runs = num(result.slice(1));
    return {
      ...shell,
      deliveryType: 'LEGAL',
      legalDelivery: true,
      batterFacedBall: true,
      batterRuns: 0,
      extras: { ...emptyExtras(), bye: runs },
      totalRuns: runs,
      crossingRuns: runs,
      runType: runs > 0 ? 'RUNNING' : 'NONE',
      boundary: 0,
    };
  }

  // ── Plain runs ──
  if (/^\d+$/.test(result)) {
    const runs = num(result);
    const bnd = boundaryFor(runs);
    return {
      ...shell,
      deliveryType: 'LEGAL',
      legalDelivery: true,
      batterFacedBall: true,
      batterRuns: runs,
      totalRuns: runs,
      crossingRuns: bnd ? 0 : runs,
      runType: runTypeFor(runs),
      boundary: bnd,
    };
  }

  // Unrecognised token. The old engine silently consumed a legal ball and
  // recorded nothing, which is how run-out tokens used to lose their runs.
  // Emitting a scoreless legal delivery reproduces that ball count without
  // inventing runs that were never stored.
  return {
    ...shell,
    deliveryType: 'LEGAL',
    legalDelivery: true,
    batterFacedBall: true,
    batterRuns: 0,
    totalRuns: 0,
    crossingRuns: 0,
    runType: 'NONE',
    boundary: 0,
  };
};

/**
 * Converts a legacy `ballHistory` array into an ordered MatchEvent list.
 * Safe to call on an already-empty or missing history.
 */
export const fromLegacyHistory = (
  history: LegacyBall[] | null | undefined,
  ctx: ConvertCtx
): MatchEvent[] => {
  const entries = Array.isArray(history) ? history : [];
  const out: MatchEvent[] = [];
  let seq = ctx.startSeq ?? 0;
  for (const entry of entries) {
    const ev = convertEntry(entry, seq, ctx);
    if (ev) {
      out.push(ev);
      seq += 1;
    }
  }
  return out;
};

// ── Reverse: events -> legacy token ─────────────────────────

/**
 * Re-encodes a BallEvent as the legacy result token, so the engine can keep
 * populating `innings.ballHistory` for consumers that have not migrated.
 *
 * Deliveries the old format cannot express degrade to their closest legacy
 * equivalent (a 5 becomes "5", which the old engine could store but not
 * score). The structured event remains the source of truth either way.
 */
export const toLegacyResult = (e: BallEvent): string => {
  if (e.wicket) {
    if (e.wicket.type === 'RUN_OUT') {
      const r = e.batterRuns + e.extras.bye + e.extras.legBye;
      return r > 0 ? `${r}W(RO)` : 'W(RO)';
    }
    return 'W';
  }

  if (e.deliveryType === 'WIDE') {
    const total = e.extras.wide + e.extras.bye + e.extras.legBye;
    const extra = Math.max(0, total - 1);
    return extra > 0 ? `WD${extra}` : 'WD';
  }

  if (e.deliveryType === 'NO_BALL') {
    const extra = e.batterRuns + e.extras.bye + e.extras.legBye;
    return extra > 0 ? `NB${extra}` : 'NB';
  }

  if (e.extras.legBye > 0) return `LB${e.extras.legBye}`;
  if (e.extras.bye > 0) return `B${e.extras.bye}`;

  return String(e.batterRuns);
};

/** Rebuilds one legacy history entry from a BallEvent. */
export const toLegacyBall = (e: BallEvent): LegacyBall => ({
  result: toLegacyResult(e),
  over: e.over,
  ball: e.ball,
  // Legacy inverted this for run-outs, storing the dismissed batter.
  batsmanId: e.wicket?.type === 'RUN_OUT' ? e.wicket.playerOutId : e.strikerId,
  nonStrikerIdBefore: e.nonStrikerId,
  bowlerId: e.bowlerId,
  ...(e.wicket?.fielderName ? { fielderName: e.wicket.fielderName } : {}),
});
