// ─────────────────────────────────────────────────────────────
// CRICKET ENGINE — PUBLIC API
// ─────────────────────────────────────────────────────────────
// Screens and utilities should import from '../engine' only, never from an
// individual engine file. That keeps the surface small and makes it obvious
// in review when something reaches past the API into internals.
//
// The engine is pure: no module in this folder imports react-native or
// @react-native-firebase. Persistence lives in ./persistence.ts, which is
// the single boundary between engine state and the database.
// ─────────────────────────────────────────────────────────────

// Types
export * from './types';

// Rule profiles
export {
  PROFILES,
  ICC_T20,
  ICC_ODI,
  LOCAL_T20,
  LOCAL_T10,
  resolveRules,
  superOverRules,
  DEFAULT_PERFORMANCE_WEIGHTS,
  DEFAULT_POINTS,
  SUPER_OVER_POINTS,
  DEFAULT_TIE_BREAKERS,
  DEFAULT_PENALTY_REASONS,
} from './profiles';

// Classification: action -> event
export {
  deriveEvent,
  isDismissalAllowedNow,
  MAX_RUNS_PER_DELIVERY,
} from './derive';
export type {
  ScoringAction,
  RunsAction,
  WideAction,
  NoBallAction,
  ByeAction,
  WicketAction,
  PenaltyAction,
  RetirementAction,
  ReturnToBatAction,
  BowlerChangeAction,
  NewBatsmanAction,
  DeriveContext,
} from './derive';

// Fold: events -> state
export {
  reduceInnings,
  reduceInningsVerbose,
  statKey,
  fieldingKey,
  emptyBatsmanStats,
  emptyBowlerStats,
  oversDecimal,
  isAllOut,
  areOversComplete,
  isInningsComplete,
  availableBatters,
  returnableBatters,
  eligibleBowlers,
} from './reduce';
export type { ReduceResult } from './reduce';

// Corrections
export {
  appendEvent,
  undoLast,
  editEvent,
  deleteEvent,
  insertEventAt,
  resequence,
  nextSeq,
  listDeliveries,
  wasEdited,
  auditTrail,
  eventsForInnings,
  groupByInnings,
  vacantSlotAfter,
} from './history';
export type { UndoResult, EditAudit, DeliveryRef, AuditEntry } from './history';

// Result and rates
export {
  resolveMatchOutcome,
  resolveSuperOvers,
  isRegulationTie,
  targetFor,
  buildNRRInputs,
  netRunRate,
  runRate,
  requiredRunRate,
  strikeRate,
  economy,
  statusLabel,
  resultTypeLabel,
} from './outcome';
export type { OutcomeInput } from './outcome';

// Super Over
export {
  superOverInningsKey,
  isSuperOverKey,
  parseSuperOverKey,
  superOverBattingFirstTeam,
  createSuperOver,
  rulesForSuperOver,
  isSuperOverInningsComplete,
  resolveSuperOver,
  superOverChasingTeam,
  resolveSuperOverChain,
  nextSuperOver,
  regulationEventsOnly,
  superOverEventsOnly,
  superOverScoreLine,
  canStartSuperOver,
} from './superover';
export type { SuperOverResolution } from './superover';

// Standings
export {
  emptyStanding,
  pointsFor,
  applyMatchToStandings,
  buildHeadToHead,
  sortStandings,
  poolQualifiers,
  formatNRR,
} from './standings';
export type { StandingRow, HeadToHead, CompletedMatchRef, ApplyMatchInput } from './standings';

// Player of the Match suggestion
export {
  computePerformanceScores,
  suggestPlayerOfTheMatch,
  PERFORMANCE_SCORE_DISCLAIMER,
} from './performance';
export type {
  PerformanceCandidate,
  PerformanceInput,
  PerformanceBreakdown,
  RosterPlayer,
} from './performance';

// Substitutes and replacements
export {
  createReplacement,
  capabilitiesFor,
  replacementLabel,
  canBat,
  canBowl,
  canField,
  assertCanBat,
  assertCanBowl,
  buildPlayerStatuses,
  describeReplacement,
  replacedPlayers,
  activeReplacements,
} from './replacements';
export type {
  PlayerStatusRecord,
  EligibilityResult,
  CreateReplacementInput,
} from './replacements';

// Status machine, interruptions, DLS boundary
export {
  canTransition,
  allowedTransitions,
  assertTransition,
  isTerminal,
  isScoringAllowed,
  STOPPAGE_REASONS,
  suspendMatch,
  resumeMatch,
  concludeWithoutResult,
  applyRevision,
  effectiveOvers,
  effectiveTarget,
  hasRevisedTarget,
  registerDLSProvider,
  hasDLSProvider,
  computeDLS,
  parScoreLabel,
} from './interruptions';
export type {
  StoppageReason,
  SuspendInput,
  ReviseInput,
  DLSRequest,
  DLSResponse,
  DLSProvider,
} from './interruptions';

// Legacy migration
export {
  fromLegacyHistory,
  toLegacyResult,
  toLegacyBall,
  isLegacyNewBatsman,
  isLegacyRunOut,
  isLegacyWicket,
} from './legacy';
