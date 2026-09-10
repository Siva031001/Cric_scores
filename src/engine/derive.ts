// ─────────────────────────────────────────────────────────────
// DERIVE — scoring action -> validated BallEvent / MatchEvent
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// This is the classification layer. The UI expresses WHAT the scorer tapped
// (a ScoringAction); this module decides what that means in cricket terms —
// legal or not, whose runs, which extras column, does the batter face it,
// does strike rotate, is the bowler charged — and emits an immutable event.
//
//   ScoringAction  ->  validate  ->  MatchEvent  ->  reducer
//
// No screen is permitted to build a MatchEvent by hand. Anything that
// bypasses this function bypasses validation, which is precisely how the
// old run-out path drifted away from the rest of the engine.
// ─────────────────────────────────────────────────────────────

import {
  BallEvent,
  CompetitionRules,
  CreaseSlot,
  DismissalType,
  EngineError,
  InningsKey,
  InningsState,
  MatchEvent,
  PenaltyRecipient,
  RetirementType,
  RunAttribution,
  RunType,
} from './types';

/**
 * Sanity ceiling for a single delivery. Deliberately generous — the brief
 * requires that 5, 7, 8+ are all scoreable, so this exists only to catch
 * fat-finger input like 500, not to encode a cricket rule.
 */
export const MAX_RUNS_PER_DELIVERY = 20;

// ── Actions ─────────────────────────────────────────────────

export interface RunsAction {
  type: 'RUNS';
  /** Total runs credited off the bat. Any non-negative integer. */
  runs: number;
  runType?: RunType;
  /** Set only for a genuine boundary. Drives the 4s/6s columns. */
  boundary?: 0 | 4 | 6;
  overthrowRuns?: number;
  /** Short-run bookkeeping: credited = attemptedRuns - shortRuns. */
  attemptedRuns?: number;
  shortRuns?: number;
}

export interface WideAction {
  type: 'WIDE';
  /** TOTAL runs resulting from the wide, INCLUDING the automatic penalty. */
  totalRuns: number;
  /**
   * Where the runs beyond the penalty belong. Defaults to 'WIDE_ALL', which
   * books the entire amount as wide extras per the product spec. 'BYE' /
   * 'LEG_BYE' are supported for competitions that split them out.
   */
  attribution?: 'WIDE_ALL' | 'BYE' | 'LEG_BYE';
}

export interface NoBallAction {
  type: 'NO_BALL';
  /** TOTAL runs from the delivery, INCLUDING the automatic penalty. */
  totalRuns: number;
  /** Who earned the runs beyond the penalty. Required — the engine will not
   *  guess, because crediting byes to the batter corrupts strike rate. */
  attribution: RunAttribution;
  runType?: RunType;
  boundary?: 0 | 4 | 6;
  overthrowRuns?: number;
}

export interface ByeAction {
  type: 'BYE' | 'LEG_BYE';
  runs: number;
  attemptedRuns?: number;
  shortRuns?: number;
}

export interface WicketAction {
  type: 'WICKET';
  dismissal: DismissalType;
  /** Defaults to the striker. Must be supplied for a non-striker run-out. */
  playerOutId?: number;
  fielderId?: number | null;
  fielderName?: string | null;
  /** Runs completed before the dismissal (run-outs). */
  runsCompleted?: number;
}

export interface PenaltyAction {
  type: 'PENALTY';
  runs: number;
  awardedTo: PenaltyRecipient;
  reason: string;
}

export interface RetirementAction {
  type: 'RETIREMENT';
  playerId: number;
  retirementType: RetirementType;
  reason?: string | null;
}

export interface ReturnToBatAction {
  type: 'RETURN_TO_BAT';
  playerId: number;
  slot: CreaseSlot;
}

export interface BowlerChangeAction {
  type: 'BOWLER_CHANGE';
  bowlerId: number;
}

export interface NewBatsmanAction {
  type: 'NEW_BATSMAN';
  playerId: number;
  slot?: CreaseSlot;
}

export type ScoringAction =
  | RunsAction
  | WideAction
  | NoBallAction
  | ByeAction
  | WicketAction
  | PenaltyAction
  | RetirementAction
  | ReturnToBatAction
  | BowlerChangeAction
  | NewBatsmanAction;

export interface DeriveContext {
  inningsKey: InningsKey;
  seq: number;
  timestamp: number;
  /** Injectable so tests get deterministic ids. */
  makeId?: (prefix: string) => string;
}

// ── Validation helpers ──────────────────────────────────────

const assertInt = (v: unknown, name: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new EngineError('INVALID_NUMBER', `${name} must be a number`);
  }
  if (!Number.isInteger(v)) {
    throw new EngineError('INVALID_NUMBER', `${name} must be a whole number, got ${v}`);
  }
  return v;
};

const assertRunRange = (v: number, name: string, min = 0): number => {
  if (v < min) throw new EngineError('INVALID_RUNS', `${name} cannot be less than ${min}`);
  if (v > MAX_RUNS_PER_DELIVERY) {
    throw new EngineError(
      'INVALID_RUNS',
      `${name} of ${v} exceeds the ${MAX_RUNS_PER_DELIVERY}-run limit for one delivery`
    );
  }
  return v;
};

/** Dismissals a bowler is credited with. */
const BOWLER_CREDITED: ReadonlySet<DismissalType> = new Set<DismissalType>([
  'BOWLED',
  'CAUGHT',
  'CAUGHT_AND_BOWLED',
  'LBW',
  'STUMPED',
  'HIT_WICKET',
  'UNKNOWN',
]);

/** Dismissals still possible when the batter is on a free hit. */
const FREE_HIT_ALLOWED: ReadonlySet<DismissalType> = new Set<DismissalType>([
  'RUN_OUT',
  'OBSTRUCTING_FIELD',
  'HIT_BALL_TWICE',
]);

const DISMISSALS_NEEDING_FIELDER: ReadonlySet<DismissalType> = new Set<DismissalType>([
  'CAUGHT',
  'STUMPED',
  'RUN_OUT',
]);

const inferRunType = (runs: number, boundary: 0 | 4 | 6, overthrow: number): RunType => {
  if (boundary === 4) return 'BOUNDARY_FOUR';
  if (boundary === 6) return 'BOUNDARY_SIX';
  if (overthrow > 0) return 'OVERTHROW';
  if (runs === 0) return 'NONE';
  return 'RUNNING';
};

let counter = 0;
const defaultMakeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

export const __resetDeriveCounter = () => {
  counter = 0;
};

// ── Main entry point ────────────────────────────────────────

/**
 * Turns a scorer action into a validated, immutable MatchEvent.
 * Throws EngineError with a user-presentable message on invalid input.
 */
export const deriveEvent = (
  action: ScoringAction,
  state: InningsState,
  rules: CompetitionRules,
  ctx: DeriveContext
): MatchEvent => {
  const makeId = ctx.makeId ?? defaultMakeId;
  const base = {
    id: makeId(action.type.toLowerCase()),
    seq: ctx.seq,
    inningsKey: ctx.inningsKey,
    timestamp: ctx.timestamp,
  };

  // ── Non-delivery events ──

  if (action.type === 'PENALTY') {
    if (!rules.penaltyRunsEnabled) {
      throw new EngineError('DISABLED', 'Penalty runs are disabled for this competition');
    }
    const runs = assertRunRange(assertInt(action.runs, 'Penalty runs'), 'Penalty runs', 1);
    if (!action.reason) {
      throw new EngineError('MISSING_REASON', 'A penalty must record a reason');
    }
    return { ...base, kind: 'PENALTY', runs, awardedTo: action.awardedTo, reason: action.reason };
  }

  if (action.type === 'RETIREMENT') {
    if (action.retirementType === 'RETIRED_OUT' && !rules.retiredOutEnabled) {
      throw new EngineError('DISABLED', 'Retired Out is not enabled for this competition');
    }
    return {
      ...base,
      kind: 'RETIREMENT',
      playerId: action.playerId,
      retirementType: action.retirementType,
      reason: action.reason ?? null,
    };
  }

  if (action.type === 'RETURN_TO_BAT') {
    return { ...base, kind: 'RETURN_TO_BAT', playerId: action.playerId, slot: action.slot };
  }

  if (action.type === 'BOWLER_CHANGE') {
    return { ...base, kind: 'BOWLER_CHANGE', bowlerId: action.bowlerId };
  }

  if (action.type === 'NEW_BATSMAN') {
    return {
      ...base,
      kind: 'NEW_BATSMAN',
      playerId: action.playerId,
      // Default to whichever crease the engine says is empty.
      slot: action.slot ?? state.awaitingBatsmanSlot ?? 'striker',
    };
  }

  // ── Deliveries ──

  const ballShell = {
    ...base,
    kind: 'BALL' as const,
    over: state.overs,
    ball: state.balls,
    strikerId: state.strikerId,
    nonStrikerId: state.nonStrikerId,
    bowlerId: state.currentBowlerId,
    freeHitBefore: state.freeHit,
    extras: { wide: 0, noBall: 0, bye: 0, legBye: 0, penalty: 0 },
    overthrowRuns: 0,
    boundary: 0 as 0 | 4 | 6,
  };

  switch (action.type) {
    // ── Runs off the bat, including 5 and 7+ ──
    case 'RUNS': {
      let runs: number;
      let attempted: number | undefined;
      let short: number | undefined;

      if (action.shortRuns != null || action.attemptedRuns != null) {
        if (!rules.shortRunEnabled) {
          throw new EngineError('DISABLED', 'Short runs are disabled for this competition');
        }
        attempted = assertRunRange(assertInt(action.attemptedRuns ?? 0, 'Attempted runs'), 'Attempted runs');
        short = assertInt(action.shortRuns ?? 0, 'Short runs');
        if (short < 0) throw new EngineError('INVALID_RUNS', 'Short runs cannot be negative');
        if (short > attempted) {
          throw new EngineError(
            'INVALID_RUNS',
            `Short runs (${short}) cannot exceed attempted runs (${attempted})`
          );
        }
        runs = attempted - short;
      } else {
        runs = assertRunRange(assertInt(action.runs, 'Runs'), 'Runs');
      }

      const overthrow = assertInt(action.overthrowRuns ?? 0, 'Overthrow runs');
      // A boundary is only a boundary if the caller says so. This is what
      // stops a 4 that was run (or came off an overthrow) from wrongly
      // inflating the batter's boundary count.
      const boundary: 0 | 4 | 6 = action.boundary ?? 0;
      if (boundary !== 0 && boundary !== runs) {
        throw new EngineError(
          'INVALID_BOUNDARY',
          `A boundary of ${boundary} cannot be recorded on a ${runs}-run delivery`
        );
      }

      const event: BallEvent = {
        ...ballShell,
        deliveryType: 'LEGAL',
        legalDelivery: true,
        batterFacedBall: true,
        batterRuns: runs,
        totalRuns: runs,
        crossingRuns: boundary ? 0 : runs,
        runType: action.runType ?? inferRunType(runs, boundary, overthrow),
        boundary,
        overthrowRuns: overthrow,
        freeHitAfter: false,
        ...(attempted != null ? { attemptedRuns: attempted } : {}),
        ...(short != null ? { shortRuns: short } : {}),
      };
      return event;
    }

    // ── Wide: scorer enters the TOTAL ──
    case 'WIDE': {
      const total = assertRunRange(assertInt(action.totalRuns, 'Wide runs'), 'Wide runs', rules.widePenaltyRuns);
      const beyondPenalty = total - rules.widePenaltyRuns;
      const attribution = action.attribution ?? 'WIDE_ALL';

      let wide = total;
      let bye = 0;
      let legBye = 0;
      if (attribution === 'BYE') {
        wide = rules.widePenaltyRuns;
        bye = beyondPenalty;
      } else if (attribution === 'LEG_BYE') {
        wide = rules.widePenaltyRuns;
        legBye = beyondPenalty;
      }

      const event: BallEvent = {
        ...ballShell,
        deliveryType: 'WIDE',
        legalDelivery: false,
        // A wide is not a ball faced by the batter.
        batterFacedBall: false,
        batterRuns: 0,
        extras: { wide, noBall: 0, bye, legBye, penalty: 0 },
        totalRuns: total,
        crossingRuns: beyondPenalty,
        runType: beyondPenalty > 0 ? 'RUNNING' : 'NONE',
        boundary: 0,
        // A wide does not consume a free hit.
        freeHitAfter: state.freeHit,
      };
      return event;
    }

    // ── No ball: scorer enters the TOTAL, then attributes the remainder ──
    case 'NO_BALL': {
      const total = assertRunRange(
        assertInt(action.totalRuns, 'No ball runs'),
        'No ball runs',
        rules.noBallPenaltyRuns
      );
      const beyondPenalty = total - rules.noBallPenaltyRuns;

      let batterRuns = 0;
      let bye = 0;
      let legBye = 0;
      switch (action.attribution) {
        case 'BATTER':
          batterRuns = beyondPenalty;
          break;
        case 'BYE':
          bye = beyondPenalty;
          break;
        case 'LEG_BYE':
          legBye = beyondPenalty;
          break;
        default:
          throw new EngineError(
            'MISSING_ATTRIBUTION',
            'No-ball runs must be attributed to the batter, byes or leg byes'
          );
      }

      const boundary: 0 | 4 | 6 = action.boundary ?? 0;
      if (boundary !== 0 && action.attribution !== 'BATTER') {
        throw new EngineError('INVALID_BOUNDARY', 'Only runs off the bat can be a boundary');
      }
      if (boundary !== 0 && boundary !== batterRuns) {
        throw new EngineError(
          'INVALID_BOUNDARY',
          `A boundary of ${boundary} cannot be recorded when the batter scored ${batterRuns}`
        );
      }

      const overthrow = assertInt(action.overthrowRuns ?? 0, 'Overthrow runs');

      const event: BallEvent = {
        ...ballShell,
        deliveryType: 'NO_BALL',
        legalDelivery: false,
        // The batter DOES face a no ball, so it counts toward balls faced.
        batterFacedBall: true,
        batterRuns,
        extras: { wide: 0, noBall: rules.noBallPenaltyRuns, bye, legBye, penalty: 0 },
        totalRuns: total,
        crossingRuns: boundary ? 0 : beyondPenalty,
        runType: action.runType ?? inferRunType(batterRuns, boundary, overthrow),
        boundary,
        overthrowRuns: overthrow,
        freeHitAfter: rules.freeHitAfterNoBall,
      };
      return event;
    }

    // ── Byes and leg byes ──
    case 'BYE':
    case 'LEG_BYE': {
      let runs: number;
      let attempted: number | undefined;
      let short: number | undefined;
      if (action.shortRuns != null || action.attemptedRuns != null) {
        attempted = assertRunRange(assertInt(action.attemptedRuns ?? 0, 'Attempted runs'), 'Attempted runs');
        short = assertInt(action.shortRuns ?? 0, 'Short runs');
        if (short > attempted) {
          throw new EngineError('INVALID_RUNS', 'Short runs cannot exceed attempted runs');
        }
        runs = attempted - short;
      } else {
        runs = assertRunRange(assertInt(action.runs, 'Runs'), 'Runs');
      }

      const isLegBye = action.type === 'LEG_BYE';
      const event: BallEvent = {
        ...ballShell,
        deliveryType: 'LEGAL',
        legalDelivery: true,
        batterFacedBall: true,
        // Byes and leg byes are never the batter's runs, and are never
        // charged to the bowler.
        batterRuns: 0,
        extras: {
          wide: 0,
          noBall: 0,
          bye: isLegBye ? 0 : runs,
          legBye: isLegBye ? runs : 0,
          penalty: 0,
        },
        totalRuns: runs,
        crossingRuns: runs,
        runType: runs > 0 ? 'RUNNING' : 'NONE',
        boundary: 0,
        freeHitAfter: false,
        ...(attempted != null ? { attemptedRuns: attempted } : {}),
        ...(short != null ? { shortRuns: short } : {}),
      };
      return event;
    }

    // ── Wickets ──
    case 'WICKET': {
      const dismissal = action.dismissal;

      if (dismissal === 'TIMED_OUT' && !rules.timedOutEnabled) {
        throw new EngineError('DISABLED', 'Timed Out is not enabled for this competition');
      }
      if (dismissal === 'RETIRED_OUT') {
        throw new EngineError(
          'WRONG_ACTION',
          'Retired Out must be recorded as a retirement, not a delivery'
        );
      }
      if (state.freeHit && !FREE_HIT_ALLOWED.has(dismissal)) {
        throw new EngineError(
          'FREE_HIT',
          `A batter cannot be given ${dismissal.toLowerCase().replace(/_/g, ' ')} on a free hit`
        );
      }
      if (DISMISSALS_NEEDING_FIELDER.has(dismissal) && !action.fielderName) {
        // Not fatal in law — the scorer may not know — but the fielder is
        // required for the dismissal line to read correctly, so surface it.
        // 'Skip' is the sentinel the UI sends when deliberately unknown.
        throw new EngineError(
          'MISSING_FIELDER',
          `A ${dismissal.toLowerCase().replace(/_/g, ' ')} needs a fielder (or Skip)`
        );
      }

      const runsCompleted = assertRunRange(
        assertInt(action.runsCompleted ?? 0, 'Runs completed'),
        'Runs completed'
      );
      if (runsCompleted > 0 && dismissal !== 'RUN_OUT') {
        throw new EngineError(
          'INVALID_RUNS',
          'Completed runs can only be recorded alongside a run out'
        );
      }

      const playerOutId = action.playerOutId ?? state.strikerId;
      if (playerOutId !== state.strikerId && playerOutId !== state.nonStrikerId) {
        throw new EngineError('INVALID_PLAYER', 'The dismissed batter must be at the crease');
      }
      if (playerOutId === state.nonStrikerId && dismissal !== 'RUN_OUT') {
        throw new EngineError(
          'INVALID_PLAYER',
          'Only a run out can dismiss the non-striker'
        );
      }

      const event: BallEvent = {
        ...ballShell,
        deliveryType: 'LEGAL',
        legalDelivery: true,
        batterFacedBall: true,
        // Runs completed before a run out belong to the batter who faced it.
        batterRuns: runsCompleted,
        totalRuns: runsCompleted,
        crossingRuns: runsCompleted,
        runType: runsCompleted > 0 ? 'RUNNING' : 'NONE',
        boundary: 0,
        freeHitAfter: false,
        wicket: {
          type: dismissal,
          playerOutId,
          fielderId: action.fielderId ?? null,
          fielderName: action.fielderName ?? null,
          creditBowler: BOWLER_CREDITED.has(dismissal),
          countsAsWicket: true,
        },
      };
      return event;
    }

    default: {
      const exhaustive: never = action;
      throw new EngineError('UNKNOWN_ACTION', `Unsupported action ${JSON.stringify(exhaustive)}`);
    }
  }
};

/**
 * Convenience guard for the UI: is this delivery legal for the free-hit
 * state, before the scorer commits it?
 */
export const isDismissalAllowedNow = (
  dismissal: DismissalType,
  state: InningsState
): boolean => (state.freeHit ? FREE_HIT_ALLOWED.has(dismissal) : true);
