// ─────────────────────────────────────────────────────────────
// CRICKET ENGINE — TYPES
// ─────────────────────────────────────────────────────────────
// PURE MODULE. Must never import react-native, @react-native-firebase,
// or any screen. That is what lets the whole rules engine be unit tested
// without native mocks, and what stops cricket rules leaking back into
// the UI layer.
// ─────────────────────────────────────────────────────────────

// ── Delivery classification ──────────────────────────────────

/** A no-ball and a wide are both illegal deliveries; only LEGAL advances the over. */
export type DeliveryType = 'LEGAL' | 'WIDE' | 'NO_BALL';

/**
 * How the runs off a delivery were actually scored. This exists because
 * "4 runs" and "a boundary four" are NOT the same event — 4 can be run,
 * or come off an overthrow. Without this the scorecard cannot honestly
 * report a batter's boundary count.
 */
export type RunType =
  | 'NONE'
  | 'RUNNING'
  | 'BOUNDARY_FOUR'
  | 'BOUNDARY_SIX'
  | 'OVERTHROW'
  | 'OTHER';

/** Who the runs off an illegal delivery belong to. */
export type RunAttribution = 'BATTER' | 'BYE' | 'LEG_BYE';

export type DismissalType =
  | 'BOWLED'
  | 'CAUGHT'
  | 'CAUGHT_AND_BOWLED'
  | 'LBW'
  | 'RUN_OUT'
  | 'STUMPED'
  | 'HIT_WICKET'
  | 'HIT_BALL_TWICE'
  | 'OBSTRUCTING_FIELD'
  | 'TIMED_OUT'
  | 'RETIRED_OUT'
  /** Only produced by the legacy-history adapter, where the old string
   *  encoding recorded a wicket without recording how. */
  | 'UNKNOWN';

/**
 * Retired Hurt and Retired Out are different in law and must never be
 * collapsed into one "Retired" value: Hurt is not a wicket and the player
 * may resume; Out is a wicket and they may not.
 */
export type RetirementType = 'RETIRED_HURT' | 'RETIRED_OUT';

export type PenaltyRecipient = 'BATTING' | 'FIELDING';

export type ReplacementType = 'FIELDER' | 'BATTING' | 'BOWLING' | 'CONCUSSION';

export type PlayerMatchStatus =
  | 'PLAYING_XI'
  | 'SUBSTITUTE'
  | 'CONCUSSION_REPLACEMENT'
  | 'RETIRED';

export type CreaseSlot = 'striker' | 'nonStriker';

/**
 * Which innings an event belongs to. Regulation innings keep the existing
 * Firebase keys so the stored shape stays backward compatible. Super overs
 * use a namespaced key so their events never mix into regulation stats.
 * Format: `so<n>_innings<1|2>` e.g. 'so1_innings1'.
 */
export type InningsKey = 'innings1' | 'innings2' | string;

// ── Match status state machine ───────────────────────────────
// Replaces the previous scheme where an abandonment reason was written
// into the `winner` field and then recovered by substring sniffing.

export type MatchStatus =
  | 'SCHEDULED'
  | 'IN_PROGRESS'
  | 'SUSPENDED'
  | 'RESUMED'
  | 'SUPER_OVER'
  | 'COMPLETED'
  | 'ABANDONED'
  | 'NO_RESULT'
  | 'AWARDED';

export type ResultType =
  | 'WIN_BY_RUNS'
  | 'WIN_BY_WICKETS'
  | 'TIE'
  | 'TIE_BROKEN_BY_SUPER_OVER'
  | 'NO_RESULT'
  | 'ABANDONED'
  | 'AWARDED'
  | 'IN_PROGRESS';

// ── Events ───────────────────────────────────────────────────

export interface EventAudit {
  /** The event as it stood before an edit. Present only on edited events. */
  editedFrom?: MatchEvent;
  editedBy?: string | null;
  editedAt?: number;
  editReason?: string | null;
}

export interface BaseEvent extends EventAudit {
  id: string;
  /** Monotonic ordering within an innings. The reducer folds in seq order. */
  seq: number;
  inningsKey: InningsKey;
  timestamp: number;
}

export interface WicketInfo {
  type: DismissalType;
  /** The batter who is out — NOT necessarily the striker (run-outs). */
  playerOutId: number;
  fielderId?: number | null;
  fielderName?: string | null;
  /** False for run-outs, retired out, obstructing the field, timed out. */
  creditBowler: boolean;
  /** False for Retired Hurt. Everything else is a wicket down. */
  countsAsWicket: boolean;
}

export interface BallEvent extends BaseEvent {
  kind: 'BALL';
  /** Over/ball as they stood BEFORE this delivery. */
  over: number;
  ball: number;

  strikerId: number;
  nonStrikerId: number;
  bowlerId: number;

  deliveryType: DeliveryType;
  legalDelivery: boolean;
  /** A no-ball is faced by the batter; a wide is not. */
  batterFacedBall: boolean;

  /** Runs credited to the batter's personal score. */
  batterRuns: number;

  extras: {
    wide: number;
    noBall: number;
    bye: number;
    legBye: number;
    penalty: number;
  };

  /** batterRuns + every extra. The single authoritative delivery total. */
  totalRuns: number;

  /**
   * Runs the batters physically completed by running. Drives strike
   * rotation. Stored explicitly rather than re-derived from totalRuns,
   * because totalRuns is lossy: a wide worth 3 (1 penalty + 2 run) rotates
   * strike on an even count, while a boundary four does not rotate at all.
   */
  crossingRuns: number;

  runType: RunType;
  /** 0 when not a boundary. Only this increments a batter's 4s/6s. */
  boundary: 0 | 4 | 6;
  overthrowRuns: number;

  /** Short-run bookkeeping. creditedRuns = attemptedRuns - shortRuns. */
  attemptedRuns?: number;
  shortRuns?: number;

  freeHitBefore: boolean;
  freeHitAfter: boolean;

  wicket?: WicketInfo;
}

export interface NewBatsmanEvent extends BaseEvent {
  kind: 'NEW_BATSMAN';
  playerId: number;
  /** Which crease the incoming batter occupies. The legacy format did not
   *  record this, which is why undo used to put non-striker replacements
   *  at the wrong end. */
  slot: CreaseSlot;
}

export interface BowlerChangeEvent extends BaseEvent {
  kind: 'BOWLER_CHANGE';
  bowlerId: number;
}

export interface RetirementEvent extends BaseEvent {
  kind: 'RETIREMENT';
  playerId: number;
  retirementType: RetirementType;
  reason?: string | null;
}

export interface ReturnToBatEvent extends BaseEvent {
  kind: 'RETURN_TO_BAT';
  playerId: number;
  slot: CreaseSlot;
}

/** A penalty awarded between deliveries (not attached to a ball). */
export interface PenaltyEvent extends BaseEvent {
  kind: 'PENALTY';
  runs: number;
  awardedTo: PenaltyRecipient;
  reason: string;
}

export interface ReplacementEvent extends BaseEvent {
  kind: 'REPLACEMENT';
  originalPlayerId: number;
  replacementPlayerId: number;
  replacementType: ReplacementType;
  reason?: string | null;
  approved: boolean;
}

export interface InterruptionEvent extends BaseEvent {
  kind: 'INTERRUPTION';
  reason: string;
  description?: string | null;
  revisedOvers?: number | null;
  revisedTarget?: number | null;
  /** Set by an official. The engine never invents a DLS number. */
  appliedBy?: string | null;
}

export type MatchEvent =
  | BallEvent
  | NewBatsmanEvent
  | BowlerChangeEvent
  | RetirementEvent
  | ReturnToBatEvent
  | PenaltyEvent
  | ReplacementEvent
  | InterruptionEvent;

export const isBallEvent = (e: MatchEvent): e is BallEvent => e.kind === 'BALL';

// ── Derived state (output of the reducer) ────────────────────
// Field names deliberately match the existing Firebase innings shape so
// every current consumer (Scorecard, Live View, stats screens) keeps
// working unchanged. New information is added, nothing is renamed.

export interface DerivedBatsmanStats {
  playerId: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  dots: number;
  isOut: boolean;
  dismissalType?: DismissalType | null;
  fielderName?: string | null;
  bowlerId?: number | null;
  globalPlayerId?: string | null;
  /** Set for both retirement kinds; null once the player returns. */
  retired?: RetirementType | null;
  /** True only while retired hurt — such a batter may resume. */
  canReturn?: boolean;
}

export interface DerivedBowlerStats {
  playerId: number;
  overs: number;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
  maidens: number;
  dots: number;
  globalPlayerId?: string | null;
}

export interface DerivedFieldingStats {
  catches: number;
  stumpings: number;
  runOuts: number;
  globalPlayerId?: string | null;
  /** The fielder's local Player.id, when known. Lets consumers match on a
   *  stable id instead of displayName (which is free text and can collide
   *  or drift from the roster's actual name). */
  fielderId?: number | null;
  displayName: string;
}

export interface Partnership {
  batterAId: number;
  batterBId: number;
  runs: number;
  balls: number;
  unbeaten: boolean;
}

/** Legacy ball-history entry, regenerated from events for backward compat. */
export interface LegacyBall {
  result?: string;
  over?: number;
  ball?: number;
  batsmanId?: number;
  nonStrikerIdBefore?: number;
  bowlerId?: number;
  fielderName?: string;
  type?: 'NEW_BATSMAN';
  newBatsmanId?: number;
}

export interface InningsState {
  runs: number;
  wickets: number;
  overs: number;
  balls: number;

  strikerId: number;
  nonStrikerId: number;
  currentBowlerId: number;

  /** Keyed `p<playerId>` — see statKey(). Never numeric, or Firebase
   *  silently converts the map into a sparse array with null holes. */
  batsmanStats: Record<string, DerivedBatsmanStats>;
  bowlerStats: Record<string, DerivedBowlerStats>;
  fieldingStats: Record<string, DerivedFieldingStats>;

  extras: {
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
    penalty: number;
  };

  /** Regenerated legacy view. Derived output, never an input. */
  ballHistory: LegacyBall[];

  // ── Added by the engine ──
  /** Persisted, so it survives a Firebase round trip and undo replay. */
  freeHit: boolean;
  legalBalls: number;
  totalDeliveries: number;
  partnerships: Partnership[];
  wormPoints: Array<{ over: number; runs: number }>;
  retired: Array<{ playerId: number; type: RetirementType; returned: boolean }>;
  /** Penalty runs conceded to the OPPOSING side (awardedTo: 'FIELDING'). */
  penaltyRunsAgainst: number;
  isSuperOver: boolean;
  battingOrder: number[];

  /**
   * Which crease is empty and needs an incoming batter, or null. Set after
   * a wicket or retirement and cleared by NEW_BATSMAN / RETURN_TO_BAT.
   * Knowing the specific end is what puts a non-striker run-out replacement
   * at the correct crease.
   */
  awaitingBatsmanSlot: CreaseSlot | null;
  /** True once an over completes, until a BOWLER_CHANGE is recorded. */
  awaitingBowler: boolean;
}

export interface InningsSetup {
  strikerId: number;
  nonStrikerId: number;
  bowlerId: number;
  isSuperOver?: boolean;
  /** Roster maps used to stamp globalPlayerId onto derived stats. */
  battingPlayers?: Array<{ id: number; name?: string; globalPlayerId?: string | null }>;
  bowlingPlayers?: Array<{ id: number; name?: string; globalPlayerId?: string | null }>;
}

// ── Competition rules ───────────────────────────────────────
// Nothing below is hard-coded as "the" law, because playing conditions
// legitimately differ between competitions.

export type TieBreaker =
  | 'POINTS'
  | 'WINS'
  | 'NRR'
  | 'HEAD_TO_HEAD'
  | 'SEEDING'
  | 'FEWEST_LOSSES';

export interface PointsRules {
  win: number;
  tie: number;
  loss: number;
  noResult: number;
  abandoned: number;
  /** Awarded on a Super Over win where the competition treats the
   *  underlying match as a tie but still splits the points. */
  superOverWin?: number;
  superOverLoss?: number;
}

export interface CompetitionRules {
  profileId: string;
  label: string;
  format: 'T10' | 'T20' | 'ODI' | 'CUSTOM';

  totalOvers: number;
  playersPerSide: number;
  ballsPerOver: number;
  maxOversPerBowler: number | null;

  /** Wickets that end an innings. Normally playersPerSide - 1. */
  allOutWickets: number;

  /** Runs automatically added for the illegal delivery itself. */
  widePenaltyRuns: number;
  noBallPenaltyRuns: number;
  freeHitAfterNoBall: boolean;

  superOverEnabled: boolean;
  superOverOvers: number;
  superOverMaxWickets: number;
  /**
   * Which side bats first in a Super Over. Playing conditions differ, so
   * this is configured rather than assumed:
   *  - CHASING_TEAM: the side that batted second in the match bats first
   *  - SAME_AS_MATCH: the same side that opened the match bats first
   *  - TOSS: decided by a fresh toss, recorded by the scorer
   */
  superOverBattingFirst: 'CHASING_TEAM' | 'SAME_AS_MATCH' | 'TOSS';
  /** Keep Super Over runs out of batting/bowling careers unless a
   *  competition explicitly counts them. */
  superOverCountsInStats: boolean;
  superOverCountsInNRR: boolean;

  dlsEnabled: boolean;

  timedOutEnabled: boolean;
  retiredOutEnabled: boolean;
  concussionReplacementEnabled: boolean;
  shortRunEnabled: boolean;
  penaltyRunsEnabled: boolean;
  penaltyReasons: string[];

  /** Some conditions credit the bowler for a retired-out. Most do not. */
  creditBowlerForRetiredOut: boolean;

  tieBreakerRules: TieBreaker[];
  pointsRules: PointsRules;

  performanceScoreWeights: PerformanceScoreWeights;
}

/**
 * Weights for the app's own Player-of-the-Match suggestion. This is an
 * application heuristic, NOT an ICC rule, and is presented to the scorer
 * as a suggestion they can override.
 */
export interface PerformanceScoreWeights {
  runPerRun: number;
  perFour: number;
  perSix: number;
  fiftyBonus: number;
  centuryBonus: number;
  notOutBonus: number;
  perWicket: number;
  economyUnder6Bonus: number;
  economyUnder8Bonus: number;
  perMaiden: number;
  perCatch: number;
  perStumping: number;
  perRunOut: number;
}

// ── Match-level aggregate ───────────────────────────────────

export interface MatchOutcome {
  resultType: ResultType;
  winnerTeam: string | null;
  loserTeam: string | null;
  margin: number | null;
  marginType: 'RUNS' | 'WICKETS' | null;
  ballsRemaining: number | null;
  /** Human-readable, generated from the structured fields above —
   *  never parsed back to recover meaning. */
  text: string;
  decidedBySuperOver: boolean;
  superOverIndex: number | null;
}

export interface NRRInput {
  teamName: string;
  runsFor: number;
  oversFor: number;
  runsAgainst: number;
  oversAgainst: number;
}

export interface SuperOverState {
  index: number;
  battingFirstTeam: string;
  innings1: InningsState | null;
  innings2: InningsState | null;
  complete: boolean;
  tied: boolean;
  winnerTeam: string | null;
}

export interface Interruption {
  id: string;
  inningsKey: InningsKey;
  reason: string;
  description?: string | null;
  revisedOvers?: number | null;
  revisedTarget?: number | null;
  oversCompletedAtStop: number;
  scoreAtStop: number;
  timestamp: number;
  appliedBy?: string | null;
}

export interface Replacement {
  id: string;
  originalPlayerId: number;
  replacementPlayerId: number;
  replacementType: ReplacementType;
  reason?: string | null;
  approved: boolean;
  timestamp: number;
  teamName: string;
}

// ── Errors ──────────────────────────────────────────────────

export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}
