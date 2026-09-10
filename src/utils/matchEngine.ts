// ─────────────────────────────────────────────────────────────
// MATCH ENGINE SERVICE — the only writer of match scoring state
// ─────────────────────────────────────────────────────────────
// This is the single place where the pure engine meets the database.
// Screens call these functions; they never build events or touch derived
// numbers themselves.
//
// Every operation follows the same shape:
//
//   read match -> loadMatch() -> deriveEvent() -> reduce -> ONE atomic write
//
// The write always includes both the event log and every affected snapshot,
// so a reader can never observe a snapshot that disagrees with the events
// it was derived from.
// ─────────────────────────────────────────────────────────────

import database from '@react-native-firebase/database';
import {
  EngineError,
  InningsState,
  MatchEvent,
  MatchOutcome,
  MatchStatus,
  Replacement,
  ReplacementType,
  RetirementType,
  SuperOverState,
  ScoringAction,
  CreaseSlot,
  Interruption,
  StoppageReason,
  deriveEvent,
  appendEvent,
  undoLast,
  editEvent,
  deleteEvent,
  reduceInnings,
  reduceInningsVerbose,
  eventsForInnings,
  groupByInnings,
  resolveMatchOutcome,
  isRegulationTie,
  buildNRRInputs,
  createSuperOver,
  nextSuperOver,
  superOverBattingFirstTeam,
  superOverInningsKey,
  resolveSuperOverChain,
  rulesForSuperOver,
  createReplacement,
  assertCanBat,
  assertCanBowl,
  suspendMatch,
  resumeMatch,
  concludeWithoutResult,
  applyRevision,
  assertTransition,
  isScoringAllowed,
  targetFor,
} from '../engine';
import { completeTournamentMatch } from './firebase';
import {
  EngineMatch,
  StoredMatch,
  activeInningsKey,
  buildInningsWrite,
  buildMatchWrite,
  buildTournamentResult,
  currentTarget,
  loadMatch,
} from '../engine/persistence';

const matchRef = (matchId: string) => database().ref('matches/' + matchId);

/** Reads a match and builds full engine state from it. */
export const readEngineMatch = async (matchId: string): Promise<EngineMatch> => {
  const snap = await matchRef(matchId).once('value');
  const raw = snap.val() as StoredMatch | null;
  if (!raw) throw new EngineError('NOT_FOUND', 'Match not found');
  return loadMatch(raw);
};

/** Builds engine state from an already-loaded match node (no extra read). */
export const toEngineMatch = (raw: StoredMatch): EngineMatch => loadMatch(raw);

// ── Internal helpers ────────────────────────────────────────

interface FoldedInnings {
  innings1: InningsState;
  innings2: InningsState | null;
  superOvers: SuperOverState[];
}

/** Re-folds every innings from a new event list. */
const refoldAll = (m: EngineMatch, events: MatchEvent[]): FoldedInnings => {
  const grouped = groupByInnings(events);
  const rebuilt = loadMatch({ ...m.raw, ballEvents: events });
  return {
    innings1: rebuilt.innings1,
    innings2: rebuilt.innings2,
    superOvers: rebuilt.superOvers,
  };
};

/** The innings state currently being scored. */
const activeState = (m: EngineMatch): InningsState => {
  const key = activeInningsKey(m);
  if (key === 'innings2' && m.innings2) return m.innings2;
  if (key.startsWith('so')) {
    const chain = resolveSuperOverChain(m.superOvers, m.raw.team1 ?? '', m.raw.team2 ?? '', m.rules);
    const so = m.superOvers.find(s => s.index === chain.activeIndex);
    const which = so && so.innings1 && !so.innings2 ? 2 : 1;
    const s = which === 1 ? so?.innings1 : so?.innings2;
    if (s) return s;
    // First ball of a Super Over innings that has no events yet.
    return reduceInnings([], { strikerId: 0, nonStrikerId: 1, bowlerId: 0, isSuperOver: true }, rulesForSuperOver(m.rules));
  }
  return m.innings1;
};

/** Recomputes the outcome and status after a change. */
const resolveAfter = (
  m: EngineMatch,
  folded: FoldedInnings
): { outcome: MatchOutcome; status: MatchStatus } => {
  const team1 = m.raw.team1 ?? 'Team 1';
  const team2 = m.raw.team2 ?? 'Team 2';
  const revisedTarget =
    m.interruptions.filter(i => i.revisedTarget != null).slice(-1)[0]?.revisedTarget ?? null;
  const revisedOvers =
    m.interruptions.filter(i => i.revisedOvers != null).slice(-1)[0]?.revisedOvers ?? null;

  const outcome = resolveMatchOutcome({
    team1,
    team2,
    innings1: folded.innings1,
    innings2: folded.innings2,
    rules: m.rules,
    status: m.status === 'SUSPENDED' ? 'IN_PROGRESS' : m.status,
    revisedTarget,
    revisedOvers,
    superOvers: folded.superOvers,
    awardedTo: m.raw.awardedTo ?? null,
  });

  let status: MatchStatus = m.status;
  if (outcome.resultType === 'IN_PROGRESS') {
    if (status === 'SCHEDULED') status = 'IN_PROGRESS';
  } else if (outcome.resultType === 'TIE') {
    // A tie only becomes a completed match if the competition has no
    // Super Over. Otherwise the match moves to the tie-break.
    status = m.rules.superOverEnabled ? 'SUPER_OVER' : 'COMPLETED';
  } else if (
    outcome.resultType === 'WIN_BY_RUNS' ||
    outcome.resultType === 'WIN_BY_WICKETS' ||
    outcome.resultType === 'TIE_BROKEN_BY_SUPER_OVER'
  ) {
    status = 'COMPLETED';
  }
  return { outcome, status };
};

/**
 * Hands a finished match to its tournament: standings, fixture status, pool
 * standings and knockout progression.
 *
 * Passes the STRUCTURED outcome, so the tournament layer never re-derives a
 * result from text. Called from every terminal path — a completed chase, an
 * abandonment, a no result and an awarded match all have to update the table.
 * The old code only did this for a completed chase, so abandoned tournament
 * fixtures silently never reached the standings at all.
 *
 * A failure here is logged, not thrown: standings must never roll back a
 * delivery that was legitimately scored.
 */
const syncTournament = async (
  matchId: string,
  m: EngineMatch,
  outcome: MatchOutcome,
  status: MatchStatus,
  innings1: InningsState,
  innings2: InningsState | null
): Promise<void> => {
  const tournamentId = m.raw.tournamentId;
  const tournamentMatchId = m.raw.tournamentMatchId;
  const finished =
    status === 'COMPLETED' ||
    status === 'ABANDONED' ||
    status === 'NO_RESULT' ||
    status === 'AWARDED';

  if (!finished || !tournamentId || !tournamentMatchId) return;

  try {
    // A no result or abandonment contributes nothing to run rate.
    const countsForNRR =
      outcome.resultType !== 'NO_RESULT' &&
      outcome.resultType !== 'ABANDONED' &&
      innings2 != null;

    const oversQuota =
      m.interruptions.filter(i => i.revisedOvers != null).slice(-1)[0]?.revisedOvers ??
      m.rules.totalOvers;

    await completeTournamentMatch(String(tournamentId), String(tournamentMatchId), {
      outcome,
      nrrInputs:
        countsForNRR && innings2
          ? buildNRRInputs({
              team1: m.raw.team1 ?? 'Team 1',
              team2: m.raw.team2 ?? 'Team 2',
              innings1,
              innings2,
              rules: m.rules,
              oversQuota,
            })
          : null,
      rules: m.rules,
      team1: m.raw.team1 ?? 'Team 1',
      team2: m.raw.team2 ?? 'Team 2',
      matchId: m.raw.id ?? matchId,
    });
  } catch (e) {
    console.error('Tournament standings update failed:', e);
  }
};

/** Writes events plus every affected snapshot in one atomic update. */
const commit = async (
  matchId: string,
  m: EngineMatch,
  events: MatchEvent[],
  extra: Record<string, unknown> = {}
): Promise<{ folded: FoldedInnings; outcome: MatchOutcome; status: MatchStatus }> => {
  const folded = refoldAll(m, events);
  const { outcome, status } = resolveAfter(m, folded);

  const payload: Record<string, unknown> = {
    ...buildMatchWrite({
      events,
      innings1: folded.innings1,
      innings2: folded.innings2,
      raw: m.raw,
      status,
      outcome: outcome.resultType === 'IN_PROGRESS' ? null : outcome,
      superOvers: folded.superOvers,
    }),
    ...extra,
  };

  // Super Over snapshots live under their own node so they never overwrite
  // regulation innings.
  for (const so of folded.superOvers) {
    if (so.innings1) payload[`superOverInnings/so${so.index}_innings1`] = buildInningsWrite(so.innings1);
    if (so.innings2) payload[`superOverInnings/so${so.index}_innings2`] = buildInningsWrite(so.innings2);
  }

  await matchRef(matchId).update(payload);
  await syncTournament(matchId, m, outcome, status, folded.innings1, folded.innings2);
  return { folded, outcome, status };
};

// ── Scoring ─────────────────────────────────────────────────

export interface ApplyResult {
  outcome: MatchOutcome;
  status: MatchStatus;
  innings: InningsState;
  warnings: Array<{ seq: number; message: string }>;
  /** True when the match just finished as a result of this action. */
  matchComplete: boolean;
  /** True when a Super Over is now required. */
  superOverRequired: boolean;
}

/**
 * Applies one scoring action. This replaces the whole of the old inline
 * scoring path — legality, extras, strike rotation, wickets, over
 * completion, free hit and match completion are all decided by the engine.
 */
export const applyScoringAction = async (
  matchId: string,
  action: ScoringAction,
  opts: { raw?: StoredMatch } = {}
): Promise<ApplyResult> => {
  const m = opts.raw ? toEngineMatch(opts.raw) : await readEngineMatch(matchId);

  if (!isScoringAllowed(m.status)) {
    throw new EngineError(
      'NOT_SCORING',
      `This match is ${m.status.toLowerCase().replace(/_/g, ' ')} and cannot be scored`
    );
  }

  const key = activeInningsKey(m);
  const state = activeState(m);
  const inningsEvents = eventsForInnings(m.events, key);

  // Eligibility checks that depend on replacements.
  if (action.type === 'NEW_BATSMAN') assertCanBat(action.playerId, m.replacements);
  if (action.type === 'BOWLER_CHANGE') assertCanBowl(action.bowlerId, m.replacements);

  const event = deriveEvent(action, state, m.rules, {
    inningsKey: key,
    seq: m.events.length,
    timestamp: Date.now(),
  });

  const events = appendEvent(m.events, event);
  const { folded, outcome, status } = await commit(matchId, m, events);

  const newState =
    key === 'innings2' && folded.innings2 ? folded.innings2 : folded.innings1;
  const { warnings } = reduceInningsVerbose(
    eventsForInnings(events, key),
    { strikerId: state.strikerId, nonStrikerId: state.nonStrikerId, bowlerId: state.currentBowlerId },
    m.rules
  );

  return {
    outcome,
    status,
    innings: newState,
    warnings,
    matchComplete: status === 'COMPLETED',
    superOverRequired: status === 'SUPER_OVER',
  };
};

/** Undoes the last scoring action, reversing bookkeeping with it. */
export const undoLastAction = async (matchId: string): Promise<ApplyResult> => {
  const m = await readEngineMatch(matchId);
  const { events, removed } = undoLast(m.events);
  if (removed.length === 0) {
    throw new EngineError('NOTHING_TO_UNDO', 'There is nothing to undo');
  }

  // Undo can revive a completed match, so the status is recomputed rather
  // than left at COMPLETED.
  const revived: EngineMatch = {
    ...m,
    status: m.status === 'COMPLETED' || m.status === 'SUPER_OVER' ? 'IN_PROGRESS' : m.status,
  };
  const { folded, outcome, status } = await commit(matchId, revived, events);

  const key = activeInningsKey(revived);
  return {
    outcome,
    status,
    innings: key === 'innings2' && folded.innings2 ? folded.innings2 : folded.innings1,
    warnings: [],
    matchComplete: status === 'COMPLETED',
    superOverRequired: status === 'SUPER_OVER',
  };
};

/**
 * Rewrites a historical delivery and replays the innings from scratch.
 * Nothing is patched in place — the whole match is recomputed.
 */
export const editDelivery = async (
  matchId: string,
  seq: number,
  action: ScoringAction,
  audit: { editedBy?: string | null; reason?: string | null } = {}
): Promise<ApplyResult & { replayWarnings: Array<{ seq: number; message: string }> }> => {
  const m = await readEngineMatch(matchId);
  const target = m.events.find(e => e.seq === seq);
  if (!target) throw new EngineError('NOT_FOUND', 'That delivery is no longer in the match');

  // Derive the replacement against the state as it stood BEFORE the target,
  // so over/ball/striker on the new event match its position in the innings.
  const key = target.inningsKey;
  const sourceInnings = key === 'innings2' && m.innings2 ? m.innings2 : m.innings1;
  const inningsEvents = eventsForInnings(m.events, key);
  const firstBall = inningsEvents.find(e => e.kind === 'BALL') as
    | { bowlerId: number }
    | undefined;

  // The OPENING pair for this innings, not the current one — replay has to
  // start where the innings started. Using innings1's order for an innings2
  // edit would replay the wrong batters.
  const editSetup = {
    strikerId: sourceInnings.battingOrder[0] ?? 0,
    nonStrikerId: sourceInnings.battingOrder[1] ?? 1,
    bowlerId: firstBall?.bowlerId ?? sourceInnings.currentBowlerId,
  };

  const before = inningsEvents.filter(e => e.seq < seq);
  const stateBefore = reduceInnings(before, editSetup, m.rules);

  const replacement = deriveEvent(action, stateBefore, m.rules, {
    inningsKey: key,
    seq,
    timestamp: Date.now(),
  });

  const events = editEvent(m.events, seq, replacement, {
    editedBy: audit.editedBy ?? null,
    reason: audit.reason ?? null,
    editedAt: Date.now(),
  });

  const revived: EngineMatch = { ...m, status: 'IN_PROGRESS' };
  const { folded, outcome, status } = await commit(matchId, revived, events);
  const { warnings } = reduceInningsVerbose(eventsForInnings(events, key), editSetup, m.rules);

  return {
    outcome,
    status,
    innings: key === 'innings2' && folded.innings2 ? folded.innings2 : folded.innings1,
    warnings,
    replayWarnings: warnings,
    matchComplete: status === 'COMPLETED',
    superOverRequired: status === 'SUPER_OVER',
  };
};

/** Removes a delivery that was logged but never bowled. */
export const deleteDelivery = async (matchId: string, seq: number): Promise<ApplyResult> => {
  const m = await readEngineMatch(matchId);
  const events = deleteEvent(m.events, seq);
  const revived: EngineMatch = { ...m, status: 'IN_PROGRESS' };
  const { folded, outcome, status } = await commit(matchId, revived, events);
  return {
    outcome,
    status,
    innings: folded.innings2 ?? folded.innings1,
    warnings: [],
    matchComplete: status === 'COMPLETED',
    superOverRequired: status === 'SUPER_OVER',
  };
};

// ── Retirement ──────────────────────────────────────────────

export const recordRetirement = async (
  matchId: string,
  playerId: number,
  retirementType: RetirementType,
  reason?: string | null
): Promise<ApplyResult> =>
  applyScoringAction(matchId, { type: 'RETIREMENT', playerId, retirementType, reason });

export const recordReturnToBat = async (
  matchId: string,
  playerId: number,
  slot: CreaseSlot
): Promise<ApplyResult> =>
  applyScoringAction(matchId, { type: 'RETURN_TO_BAT', playerId, slot });

// ── Innings transition ──────────────────────────────────────

/**
 * Opens the second innings. The opening pair is stored explicitly so replay
 * never has to infer it from the first delivery.
 */
export const startSecondInnings = async (
  matchId: string,
  openers: { strikerId: number; nonStrikerId: number; bowlerId: number }
): Promise<void> => {
  const m = await readEngineMatch(matchId);
  if (openers.strikerId === openers.nonStrikerId) {
    throw new EngineError('SAME_PLAYER', 'The two openers must be different players');
  }
  assertCanBat(openers.strikerId, m.replacements);
  assertCanBat(openers.nonStrikerId, m.replacements);
  assertCanBowl(openers.bowlerId, m.replacements);

  const fresh = reduceInnings([], { ...openers, isSuperOver: false }, m.rules);
  await matchRef(matchId).update({
    currentInnings: 2,
    innings2: buildInningsWrite(fresh, { ...openers }),
    matchStatus: 'IN_PROGRESS',
    status: 'live',
  });
};

// ── Super Over ──────────────────────────────────────────────

/**
 * Starts a Super Over after a tied match, or the next one in a chain after
 * a tied Super Over.
 */
export const startSuperOver = async (
  matchId: string,
  opts: { tossWinner?: string | null } = {}
): Promise<{ index: number; battingFirstTeam: string }> => {
  const m = await readEngineMatch(matchId);
  const team1 = m.raw.team1 ?? 'Team 1';
  const team2 = m.raw.team2 ?? 'Team 2';

  if (!m.rules.superOverEnabled) {
    throw new EngineError(
      'NO_SUPER_OVER',
      'This competition settles a tie as a tied match, not with a Super Over'
    );
  }

  let created: SuperOverState;
  if (m.superOvers.length === 0) {
    if (!isRegulationTie(m.innings1, m.innings2, m.rules)) {
      throw new EngineError('NOT_TIED', 'A Super Over only applies when the match is tied');
    }
    const battingFirst = superOverBattingFirstTeam({
      rules: m.rules,
      matchBattingFirstTeam: team1,
      matchChasingTeam: team2,
      tossWinner: opts.tossWinner ?? null,
    });
    created = createSuperOver(1, battingFirst);
  } else {
    const chain = resolveSuperOverChain(m.superOvers, team1, team2, m.rules);
    if (!chain.needsAnother) {
      throw new EngineError('NOT_TIED', 'The current Super Over has not finished level');
    }
    created = nextSuperOver(m.superOvers, team1, team2);
  }

  const stored = [
    ...(m.raw.superOvers ?? []),
    { index: created.index, battingFirstTeam: created.battingFirstTeam },
  ];
  await matchRef(matchId).update({
    superOvers: stored,
    matchStatus: 'SUPER_OVER',
    status: 'live',
  });
  return { index: created.index, battingFirstTeam: created.battingFirstTeam };
};

/** Records the opening pair for one half of a Super Over. */
export const startSuperOverInnings = async (
  matchId: string,
  index: number,
  which: 1 | 2,
  openers: { strikerId: number; nonStrikerId: number; bowlerId: number }
): Promise<void> => {
  const m = await readEngineMatch(matchId);
  const soRules = rulesForSuperOver(m.rules);
  const fresh = reduceInnings([], { ...openers, isSuperOver: true }, soRules);
  await matchRef(matchId).update({
    [`superOverInnings/${superOverInningsKey(index, which)}`]: buildInningsWrite(fresh, {
      ...openers,
      isSuperOver: true,
    }),
  });
};

// ── Replacements ────────────────────────────────────────────

export const recordReplacement = async (
  matchId: string,
  input: {
    originalPlayerId: number;
    replacementPlayerId: number;
    replacementType: ReplacementType;
    teamName: string;
    reason?: string | null;
    approved?: boolean;
  }
): Promise<Replacement> => {
  const m = await readEngineMatch(matchId);
  const created = createReplacement({
    ...input,
    rules: m.rules,
    existing: m.replacements,
  });
  await matchRef(matchId).update({
    replacements: [...m.replacements, created],
  });
  return created;
};

// ── Status changes ──────────────────────────────────────────

export const suspendMatchForStoppage = async (
  matchId: string,
  reason: StoppageReason,
  description?: string | null
): Promise<Interruption> => {
  const m = await readEngineMatch(matchId);
  const key = activeInningsKey(m);
  const { status, interruption } = suspendMatch({
    status: m.status,
    reason,
    description: description ?? null,
    inningsKey: key,
    innings: key === 'innings2' ? m.innings2 : m.innings1,
    rules: m.rules,
  });
  await matchRef(matchId).update({
    matchStatus: status,
    status: 'paused',
    statusReason: reason,
    interruptions: [...m.interruptions, interruption],
  });
  return interruption;
};

export const resumeSuspendedMatch = async (matchId: string): Promise<void> => {
  const m = await readEngineMatch(matchId);
  const status = resumeMatch(m.status);
  await matchRef(matchId).update({ matchStatus: status, status: 'live', statusReason: null });
};

/**
 * Records the official's determination for a match that cannot finish.
 * Abandonment and no-result are kept distinct because competitions may
 * allocate points differently for each.
 */
export const concludeMatchWithoutResult = async (
  matchId: string,
  to: 'ABANDONED' | 'NO_RESULT',
  reason?: string | null
): Promise<MatchOutcome> => {
  const m = await readEngineMatch(matchId);
  const status = concludeWithoutResult(m.status, to);
  const outcome = resolveMatchOutcome({
    team1: m.raw.team1 ?? 'Team 1',
    team2: m.raw.team2 ?? 'Team 2',
    innings1: m.innings1,
    innings2: m.innings2,
    rules: m.rules,
    status,
  });
  await matchRef(matchId).update({
    matchStatus: status,
    status: 'completed',
    statusReason: reason ?? null,
    result: outcome,
    winner: outcome.text,
  });
  // An abandoned or no-result tournament fixture still has to reach the
  // standings — points differ per competition, and `played` must increment.
  await syncTournament(matchId, m, outcome, status, m.innings1, m.innings2);
  return outcome;
};

export const awardMatch = async (matchId: string, teamName: string, reason?: string | null) => {
  const m = await readEngineMatch(matchId);
  assertTransition(m.status, 'AWARDED');
  const outcome = resolveMatchOutcome({
    team1: m.raw.team1 ?? 'Team 1',
    team2: m.raw.team2 ?? 'Team 2',
    innings1: m.innings1,
    innings2: m.innings2,
    rules: m.rules,
    status: 'AWARDED',
    awardedTo: teamName,
  });
  await matchRef(matchId).update({
    matchStatus: 'AWARDED',
    status: 'completed',
    awardedTo: teamName,
    statusReason: reason ?? null,
    result: outcome,
    winner: outcome.text,
  });
  await syncTournament(matchId, m, outcome, 'AWARDED', m.innings1, m.innings2);
  return outcome;
};

/** Applies an officially-determined revised target / overs. */
export const applyRevisedTarget = async (
  matchId: string,
  input: { revisedOvers: number | null; revisedTarget: number | null; appliedBy: string }
): Promise<Interruption> => {
  const m = await readEngineMatch(matchId);
  const latest = m.interruptions[m.interruptions.length - 1];
  if (!latest) {
    throw new EngineError(
      'NO_INTERRUPTION',
      'Record the stoppage first, then apply the revised target against it'
    );
  }
  const revised = applyRevision({
    interruption: latest,
    revisedOvers: input.revisedOvers,
    revisedTarget: input.revisedTarget,
    appliedBy: input.appliedBy,
    rules: m.rules,
  });
  const all = [...m.interruptions.slice(0, -1), revised];
  await matchRef(matchId).update({ interruptions: all });
  return revised;
};

// ── Read helpers for screens ────────────────────────────────

export const getCurrentTarget = (m: EngineMatch): number | null => currentTarget(m);

export const getTournamentPayload = (m: EngineMatch) => buildTournamentResult(m);

export { targetFor };
