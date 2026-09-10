// ─────────────────────────────────────────────────────────────
// MATCH STATUS STATE MACHINE + INTERRUPTIONS / REVISED TARGETS
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// Previously an abandonment reason was written into the `winner` field and
// its meaning recovered by substring sniffing, which meant "Bad Weather"
// was indistinguishable from a result. Here status is an explicit state
// with validated transitions, and the reason is separate data.
//
// Two deliberate non-features:
//
//  1. Weather does NOT imply a result. Suspending for rain moves the match
//     to SUSPENDED; an official must then explicitly choose RESUMED,
//     ABANDONED, NO_RESULT or COMPLETED. The engine never decides.
//
//  2. There is NO DLS formula here. DLS is a proprietary published method
//     and a hand-rolled approximation labelled "DLS" would be wrong and
//     misleading. Instead the model stores revised overs/targets supplied
//     by an official, and exposes a provider interface so a real
//     implementation can be plugged in later.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  EngineError,
  InningsKey,
  InningsState,
  Interruption,
  MatchStatus,
} from './types';

// ── State machine ───────────────────────────────────────────

const TRANSITIONS: Record<MatchStatus, MatchStatus[]> = {
  SCHEDULED: ['IN_PROGRESS', 'ABANDONED', 'NO_RESULT', 'AWARDED'],
  IN_PROGRESS: ['SUSPENDED', 'SUPER_OVER', 'COMPLETED', 'ABANDONED', 'NO_RESULT', 'AWARDED'],
  // A suspended match can resume, be called off, or be completed if enough
  // play happened to constitute a result.
  SUSPENDED: ['RESUMED', 'COMPLETED', 'ABANDONED', 'NO_RESULT', 'AWARDED'],
  RESUMED: ['SUSPENDED', 'SUPER_OVER', 'COMPLETED', 'ABANDONED', 'NO_RESULT', 'AWARDED'],
  SUPER_OVER: ['COMPLETED', 'ABANDONED', 'NO_RESULT', 'AWARDED'],
  // Terminal, except that an official can still award a match after the
  // fact (e.g. on appeal or a forfeit ruling).
  COMPLETED: ['AWARDED'],
  ABANDONED: [],
  NO_RESULT: [],
  AWARDED: [],
};

export const canTransition = (from: MatchStatus, to: MatchStatus): boolean =>
  (TRANSITIONS[from] ?? []).includes(to);

export const allowedTransitions = (from: MatchStatus): MatchStatus[] => TRANSITIONS[from] ?? [];

/** Validates a status change, throwing with a readable message if invalid. */
export const assertTransition = (from: MatchStatus, to: MatchStatus): void => {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new EngineError(
      'INVALID_TRANSITION',
      `A match cannot go from ${from} to ${to}`
    );
  }
};

export const isTerminal = (status: MatchStatus): boolean =>
  allowedTransitions(status).length === 0 || status === 'COMPLETED';

/** Whether scoring input should be accepted right now. */
export const isScoringAllowed = (status: MatchStatus): boolean =>
  status === 'IN_PROGRESS' || status === 'RESUMED' || status === 'SUPER_OVER';

// ── Stoppage reasons ────────────────────────────────────────
// Reasons are data, not status. Stopping for rain says nothing about the
// eventual result.

export const STOPPAGE_REASONS = [
  'Rain',
  'Bad Light',
  'Wet Ground',
  'Pitch Unfit',
  'Crowd Disturbance',
  'Injury',
  'Equipment Failure',
  'Network Issue',
  'Other',
] as const;

export type StoppageReason = (typeof STOPPAGE_REASONS)[number] | string;

export interface SuspendInput {
  status: MatchStatus;
  reason: StoppageReason;
  description?: string | null;
  inningsKey: InningsKey;
  innings: InningsState | null;
  rules: CompetitionRules;
  timestamp?: number;
  makeId?: (prefix: string) => string;
}

let counter = 0;
const defaultId = (p: string) => `${p}_${Date.now().toString(36)}_${(counter++).toString(36)}`;
export const __resetInterruptionCounter = () => {
  counter = 0;
};

/**
 * Suspends play and records where the match stood, so a later revised
 * target can be justified against the actual stoppage point.
 */
export const suspendMatch = (
  input: SuspendInput
): { status: MatchStatus; interruption: Interruption } => {
  assertTransition(input.status, 'SUSPENDED');
  const makeId = input.makeId ?? defaultId;
  const inn = input.innings;
  return {
    status: 'SUSPENDED',
    interruption: {
      id: makeId('intr'),
      inningsKey: input.inningsKey,
      reason: input.reason,
      description: input.description ?? null,
      oversCompletedAtStop: inn ? inn.overs + inn.balls / input.rules.ballsPerOver : 0,
      scoreAtStop: inn?.runs ?? 0,
      revisedOvers: null,
      revisedTarget: null,
      timestamp: input.timestamp ?? Date.now(),
      appliedBy: null,
    },
  };
};

/** Resumes a suspended match. */
export const resumeMatch = (status: MatchStatus): MatchStatus => {
  assertTransition(status, 'RESUMED');
  return 'RESUMED';
};

/**
 * Records the official's determination for a match that cannot continue.
 *
 * ABANDONED — play stopped and the match is off, no result.
 * NO_RESULT — a distinct outcome: the match counted but produced no winner
 *             (typically too few overs bowled to constitute a result).
 * These are kept separate because competitions may allocate points
 * differently for each.
 */
export const concludeWithoutResult = (
  status: MatchStatus,
  to: 'ABANDONED' | 'NO_RESULT'
): MatchStatus => {
  assertTransition(status, to);
  return to;
};

// ── Revised overs / targets ─────────────────────────────────

export interface ReviseInput {
  interruption: Interruption;
  revisedOvers: number | null;
  revisedTarget: number | null;
  appliedBy: string;
  rules: CompetitionRules;
}

/**
 * Applies an officially-determined revision to an interruption record.
 *
 * The values come from outside the engine — a published DLS table, a
 * competition formula, or the match referee's ruling. `appliedBy` is
 * mandatory so the record shows who authorised it.
 */
export const applyRevision = (input: ReviseInput): Interruption => {
  const { revisedOvers, revisedTarget, rules } = input;

  if (revisedOvers == null && revisedTarget == null) {
    throw new EngineError('NOTHING_TO_APPLY', 'Provide a revised overs figure, a revised target, or both');
  }
  if (!input.appliedBy) {
    throw new EngineError('MISSING_OFFICIAL', 'A revised target must record who applied it');
  }
  if (revisedOvers != null) {
    if (!Number.isInteger(revisedOvers) || revisedOvers <= 0) {
      throw new EngineError('INVALID_OVERS', 'Revised overs must be a positive whole number');
    }
    if (revisedOvers > rules.totalOvers) {
      throw new EngineError(
        'INVALID_OVERS',
        `Revised overs (${revisedOvers}) cannot exceed the original ${rules.totalOvers}`
      );
    }
  }
  if (revisedTarget != null) {
    if (!Number.isInteger(revisedTarget) || revisedTarget <= 0) {
      throw new EngineError('INVALID_TARGET', 'Revised target must be a positive whole number');
    }
  }

  return {
    ...input.interruption,
    revisedOvers: revisedOvers ?? input.interruption.revisedOvers ?? null,
    revisedTarget: revisedTarget ?? input.interruption.revisedTarget ?? null,
    appliedBy: input.appliedBy,
  };
};

/** The overs quota actually in force, after the latest revision. */
export const effectiveOvers = (
  interruptions: Interruption[],
  rules: CompetitionRules,
  inningsKey?: InningsKey
): number => {
  const relevant = interruptions
    .filter(i => (inningsKey ? i.inningsKey === inningsKey : true))
    .filter(i => i.revisedOvers != null);
  if (relevant.length === 0) return rules.totalOvers;
  return relevant[relevant.length - 1].revisedOvers as number;
};

/** The target actually in force, or null if never revised. */
export const effectiveTarget = (
  interruptions: Interruption[],
  inningsKey?: InningsKey
): number | null => {
  const relevant = interruptions
    .filter(i => (inningsKey ? i.inningsKey === inningsKey : true))
    .filter(i => i.revisedTarget != null);
  if (relevant.length === 0) return null;
  return relevant[relevant.length - 1].revisedTarget as number;
};

/** Whether any revision is in force — drives the "DLS" badge in the UI. */
export const hasRevisedTarget = (interruptions: Interruption[]): boolean =>
  interruptions.some(i => i.revisedTarget != null || i.revisedOvers != null);

// ── Pluggable DLS provider ──────────────────────────────────

export interface DLSRequest {
  team1Runs: number;
  team1Wickets: number;
  team1OversFaced: number;
  team2Runs: number;
  team2Wickets: number;
  team2OversFaced: number;
  originalOvers: number;
  oversLostToStoppage: number;
  rules: CompetitionRules;
}

export interface DLSResponse {
  revisedTarget: number;
  revisedOvers: number;
  parScore: number;
  /** Identifies the implementation, so a scorecard can state its provenance. */
  method: string;
}

/**
 * Contract for a real DLS implementation, to be supplied later by a library
 * or service. Intentionally NOT implemented here — see the header note.
 */
export interface DLSProvider {
  readonly method: string;
  compute(request: DLSRequest): DLSResponse;
}

let provider: DLSProvider | null = null;

export const registerDLSProvider = (p: DLSProvider | null): void => {
  provider = p;
};

export const hasDLSProvider = (): boolean => provider != null;

/**
 * Computes a revised target if — and only if — a real provider has been
 * registered. Otherwise it fails loudly so the UI falls back to the manual
 * official-input workflow rather than displaying a fabricated number.
 */
export const computeDLS = (request: DLSRequest): DLSResponse => {
  if (!provider) {
    throw new EngineError(
      'NO_DLS_PROVIDER',
      'No DLS engine is configured. Enter the revised overs and target from the official DLS table.'
    );
  }
  return provider.compute(request);
};

/** Par score display helper — only meaningful with a real provider. */
export const parScoreLabel = (res: DLSResponse): string =>
  `Par ${res.parScore} · Target ${res.revisedTarget} from ${res.revisedOvers} ov (${res.method})`;
