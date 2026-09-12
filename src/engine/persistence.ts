// ─────────────────────────────────────────────────────────────
// PERSISTENCE BRIDGE — Firebase match node <-> engine state
// ─────────────────────────────────────────────────────────────
// PURE MODULE — this file deliberately does NOT import firebase either. It
// only transforms plain objects, so it stays unit-testable. The actual
// database calls live in src/utils/firebase.ts and pass data through here.
//
// Design constraints this satisfies:
//
//  1. `ballEvents` is the SOURCE OF TRUTH. Every derived number is folded
//     from it, never stored as the only copy.
//  2. The denormalised innings snapshot is still written, with the SAME
//     field names as before (runs / wickets / overs / balls / batsmanStats /
//     bowlerStats / extras / ballHistory). That is what lets Scorecard,
//     Live View and the stats screens keep working untouched.
//  3. Matches created before the engine existed load transparently: if
//     `ballEvents` is absent, the legacy string history is converted on read.
//     Nothing is rewritten until the scorer next scores a ball.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  InningsSetup,
  InningsState,
  Interruption,
  LegacyBall,
  MatchEvent,
  MatchOutcome,
  MatchStatus,
  DismissalType,
  Replacement,
  SuperOverState,
} from './types';
import { resolveRules } from './profiles';
import { reduceInnings, statKey } from './reduce';
import { fromLegacyHistory } from './legacy';
import { eventsForInnings, groupByInnings } from './history';
import { resolveMatchOutcome, targetFor, buildNRRInputs } from './outcome';
import {
  isSuperOverInningsComplete,
  isSuperOverKey,
  parseSuperOverKey,
  resolveSuperOverChain,
  rulesForSuperOver,
  superOverChasingTeam,
} from './superover';

/** Shape of the roster entries already stored on a match. */
export interface StoredPlayer {
  id: number;
  name?: string;
  globalPlayerId?: string | null;
  isCaptain?: boolean;
  isWicketKeeper?: boolean;
}

/** The `matches/{id}` node as it exists in the database. */
export interface StoredMatch {
  id?: string;
  team1?: string;
  team2?: string;
  team1Players?: StoredPlayer[];
  team2Players?: StoredPlayer[];
  totalOvers?: number;
  playersPerSide?: number;
  currentInnings?: 1 | 2;
  status?: string;
  winner?: string;
  innings1?: StoredInnings;
  innings2?: StoredInnings;

  // ── Added by the engine ──
  ballEvents?: MatchEvent[];
  matchStatus?: MatchStatus;
  statusReason?: string | null;
  rulesProfileId?: string | null;
  rulesOverrides?: Partial<CompetitionRules> | null;
  tieBreaker?: 'MATCH_TIE' | 'SUPER_OVER';
  superOvers?: StoredSuperOver[];
  replacements?: Replacement[];
  interruptions?: Interruption[];
  result?: MatchOutcome | null;
  awardedTo?: string | null;
  tossWinner?: string | null;
  [key: string]: unknown;
}

export interface StoredInnings {
  runs?: number;
  wickets?: number;
  overs?: number;
  balls?: number;
  strikerId?: number;
  nonStrikerId?: number;
  currentBowlerId?: number;
  batsmanStats?: Record<string, unknown>;
  bowlerStats?: Record<string, unknown>;
  fieldingStats?: Record<string, unknown>;
  extras?: Record<string, number>;
  ballHistory?: LegacyBall[];
  /** Written by the engine so replay never has to guess the opening pair. */
  openingStrikerId?: number;
  openingNonStrikerId?: number;
  openingBowlerId?: number;
  [key: string]: unknown;
}

export interface StoredSuperOver {
  index: number;
  battingFirstTeam: string;
}

// ── Rules ───────────────────────────────────────────────────

export const rulesForMatch = (raw: StoredMatch): CompetitionRules =>
  resolveRules({
    profileId: raw.rulesProfileId ?? null,
    totalOvers: raw.totalOvers ?? null,
    playersPerSide: raw.playersPerSide ?? null,
    overrides: {
      ...(raw.rulesOverrides ?? {}),
      // An explicit tie-breaker choice on the match wins over the profile.
      ...(raw.tieBreaker
        ? { superOverEnabled: raw.tieBreaker === 'SUPER_OVER' }
        : {}),
    },
  });

// ── Opening pair recovery ───────────────────────────────────

/**
 * Determines the opening striker / non-striker / bowler for replay.
 *
 * The legacy innings node stores the CURRENT batters, not the openers, so
 * for older matches the opening pair is recovered from the first real
 * delivery in the history — which recorded exactly that.
 */
export const deriveInningsSetup = (
  inn: StoredInnings | undefined,
  fallback: { strikerId: number; nonStrikerId: number; bowlerId: number }
): { strikerId: number; nonStrikerId: number; bowlerId: number } => {
  if (!inn) return fallback;

  if (
    inn.openingStrikerId != null &&
    inn.openingNonStrikerId != null &&
    inn.openingBowlerId != null
  ) {
    return {
      strikerId: inn.openingStrikerId,
      nonStrikerId: inn.openingNonStrikerId,
      bowlerId: inn.openingBowlerId,
    };
  }

  const first = (inn.ballHistory ?? []).find(
    b => b && b.type !== 'NEW_BATSMAN' && b.batsmanId != null
  );
  if (first) {
    return {
      strikerId: first.batsmanId as number,
      nonStrikerId: first.nonStrikerIdBefore ?? fallback.nonStrikerId,
      bowlerId: first.bowlerId ?? fallback.bowlerId,
    };
  }

  return {
    strikerId: inn.strikerId ?? fallback.strikerId,
    nonStrikerId: inn.nonStrikerId ?? fallback.nonStrikerId,
    bowlerId: inn.currentBowlerId ?? fallback.bowlerId,
  };
};

const setupFor = (
  raw: StoredMatch,
  which: 1 | 2,
  isSuperOver = false
): InningsSetup => {
  const inn = which === 1 ? raw.innings1 : raw.innings2;
  const battingPlayers = which === 1 ? raw.team1Players : raw.team2Players;
  const bowlingPlayers = which === 1 ? raw.team2Players : raw.team1Players;
  const base = deriveInningsSetup(inn, {
    strikerId: which === 1 ? 0 : -1,
    nonStrikerId: which === 1 ? 1 : -2,
    bowlerId: 0,
  });
  return {
    ...base,
    isSuperOver,
    battingPlayers: (battingPlayers ?? []).map(p => ({
      id: p.id,
      name: p.name,
      globalPlayerId: p.globalPlayerId ?? null,
    })),
    bowlingPlayers: (bowlingPlayers ?? []).map(p => ({
      id: p.id,
      name: p.name,
      globalPlayerId: p.globalPlayerId ?? null,
    })),
  };
};

// ── Load ────────────────────────────────────────────────────

export interface EngineMatch {
  raw: StoredMatch;
  rules: CompetitionRules;
  /** Every event across every innings, including Super Overs. */
  events: MatchEvent[];
  innings1: InningsState;
  innings2: InningsState | null;
  superOvers: SuperOverState[];
  replacements: Replacement[];
  interruptions: Interruption[];
  status: MatchStatus;
  outcome: MatchOutcome;
  /** True when this match was loaded by converting legacy string history. */
  migratedFromLegacy: boolean;
  /** Non-fatal replay problems, e.g. an edit that changed who was on strike. */
  warnings: Array<{ seq: number; message: string }>;
}

/**
 * The legacy "End / Abandon Match" picker (ScoringScreen) writes
 * `{ status: "completed", winner: reason }` for every one of these reasons,
 * reusing the same "completed" string a genuine result also uses. A real
 * win/tie always leaves `winner` as a result sentence instead.
 */
const LEGACY_ABANDON_REASONS = [
  'Match Abandoned',
  'Network Issue',
  'Bad Weather',
  'Pitch Issue',
  'Other Reason',
];

/** Maps the old free-text status onto the state machine. */
export const normaliseStatus = (raw: StoredMatch): MatchStatus => {
  if (raw.matchStatus) return raw.matchStatus;
  const s = String(raw.status ?? '').toLowerCase();
  if (s === 'completed') {
    return LEGACY_ABANDON_REASONS.includes(raw.winner ?? '') ? 'ABANDONED' : 'COMPLETED';
  }
  if (s === 'paused') return 'SUSPENDED';
  if (s === 'live') return 'IN_PROGRESS';
  return 'SCHEDULED';
};

/**
 * Builds full engine state from a stored match. This is the only function
 * that should be used to read a match for scoring or display.
 */
export const loadMatch = (raw: StoredMatch): EngineMatch => {
  const rules = rulesForMatch(raw);
  const status = normaliseStatus(raw);

  let events: MatchEvent[];
  let migratedFromLegacy = false;

  if (Array.isArray(raw.ballEvents) && raw.ballEvents.length > 0) {
    events = raw.ballEvents;
  } else {
    // Legacy match: convert both innings' string history into events.
    migratedFromLegacy = true;
    const dis1 = dismissalMap(raw.innings1);
    const dis2 = dismissalMap(raw.innings2);
    const e1 = fromLegacyHistory(raw.innings1?.ballHistory, {
      inningsKey: 'innings1',
      dismissalByPlayerId: dis1,
      startSeq: 0,
    });
    const e2 = fromLegacyHistory(raw.innings2?.ballHistory, {
      inningsKey: 'innings2',
      dismissalByPlayerId: dis2,
      startSeq: e1.length,
    });
    events = [...e1, ...e2];
  }

  const grouped = groupByInnings(events);
  const warnings: EngineMatch['warnings'] = [];

  const innings1 = reduceInnings(grouped.innings1 ?? [], setupFor(raw, 1), rules);
  const hasInn2 =
    (grouped.innings2 ?? []).length > 0 ||
    (raw.currentInnings ?? 1) >= 2 ||
    (raw.innings2?.ballHistory ?? []).length > 0;
  const innings2 = hasInn2
    ? reduceInnings(grouped.innings2 ?? [], setupFor(raw, 2), rules)
    : null;

  // ── Super Overs ──
  const soRules = rulesForSuperOver(rules);
  const superOvers: SuperOverState[] = (raw.superOvers ?? []).map(meta => {
    const k1 = `so${meta.index}_innings1`;
    const k2 = `so${meta.index}_innings2`;
    const battingFirstIsTeam1 = meta.battingFirstTeam === raw.team1;
    const mkSetup = (which: 1 | 2): InningsSetup => {
      const battingIsTeam1 = which === 1 ? battingFirstIsTeam1 : !battingFirstIsTeam1;
      const bat = battingIsTeam1 ? raw.team1Players : raw.team2Players;
      const bowl = battingIsTeam1 ? raw.team2Players : raw.team1Players;
      const evs = grouped[which === 1 ? k1 : k2] ?? [];
      const firstBall = evs.find(e => e.kind === 'BALL') as
        | { strikerId: number; nonStrikerId: number; bowlerId: number }
        | undefined;
      return {
        strikerId: firstBall?.strikerId ?? 0,
        nonStrikerId: firstBall?.nonStrikerId ?? 1,
        bowlerId: firstBall?.bowlerId ?? 0,
        isSuperOver: true,
        battingPlayers: (bat ?? []).map(p => ({ id: p.id, name: p.name, globalPlayerId: p.globalPlayerId ?? null })),
        bowlingPlayers: (bowl ?? []).map(p => ({ id: p.id, name: p.name, globalPlayerId: p.globalPlayerId ?? null })),
      };
    };
    const s1 = (grouped[k1] ?? []).length > 0 ? reduceInnings(grouped[k1], mkSetup(1), soRules) : null;
    const s2 = (grouped[k2] ?? []).length > 0 ? reduceInnings(grouped[k2], mkSetup(2), soRules) : null;
    return {
      index: meta.index,
      battingFirstTeam: meta.battingFirstTeam,
      innings1: s1,
      innings2: s2,
      complete: false,
      tied: false,
      winnerTeam: null,
    };
  });

  const team1 = raw.team1 ?? 'Team 1';
  const team2 = raw.team2 ?? 'Team 2';

  // Resolve each Super Over so the outcome layer can read winner/tied flags.
  const resolvedSuperOvers = superOvers.map(so => {
    const chasing = superOverChasingTeam(so, team1, team2);
    if (!so.innings1 || !so.innings2) return so;
    const target = so.innings1.runs + 1;
    const done =
      so.innings2.runs >= target ||
      so.innings2.wickets >= soRules.allOutWickets ||
      so.innings2.overs >= soRules.totalOvers;
    if (!done) return so;
    if (so.innings2.runs >= target) return { ...so, complete: true, tied: false, winnerTeam: chasing };
    if (so.innings2.runs === so.innings1.runs) return { ...so, complete: true, tied: true, winnerTeam: null };
    return { ...so, complete: true, tied: false, winnerTeam: so.battingFirstTeam };
  });

  const interruptions = raw.interruptions ?? [];
  const revisedTarget =
    interruptions.filter(i => i.revisedTarget != null).slice(-1)[0]?.revisedTarget ?? null;
  const revisedOvers =
    interruptions.filter(i => i.revisedOvers != null).slice(-1)[0]?.revisedOvers ?? null;

  const outcome = resolveMatchOutcome({
    team1,
    team2,
    innings1,
    innings2,
    rules,
    status,
    revisedTarget,
    revisedOvers,
    superOvers: resolvedSuperOvers,
    awardedTo: raw.awardedTo ?? null,
  });

  return {
    raw,
    rules,
    events,
    innings1,
    innings2,
    superOvers: resolvedSuperOvers,
    replacements: raw.replacements ?? [],
    interruptions,
    status,
    outcome,
    migratedFromLegacy,
    warnings,
  };
};

/**
 * Recovers dismissal types from stored batsmanStats for legacy conversion.
 *
 * The legacy ball history recorded only that a wicket fell, never how — the
 * dismissal type lived on the batter's stat entry. Feeding that back in is
 * what stops every migrated wicket showing as "UNKNOWN".
 */
const dismissalMap = (
  inn: StoredInnings | undefined
): Record<number, DismissalType> | undefined => {
  if (!inn?.batsmanStats) return undefined;
  const map: Record<number, DismissalType> = {};
  for (const v of Object.values(inn.batsmanStats)) {
    const bs = v as { playerId?: number; dismissalType?: string };
    if (bs?.playerId == null || !bs.dismissalType) continue;
    const normalised = LEGACY_DISMISSALS[bs.dismissalType];
    if (normalised) map[bs.playerId] = normalised;
  }
  return Object.keys(map).length > 0 ? map : undefined;
};

/** Old human-readable dismissal labels -> engine enum values. */
const LEGACY_DISMISSALS: Record<string, DismissalType> = {
  Bowled: 'BOWLED',
  Caught: 'CAUGHT',
  LBW: 'LBW',
  'Run Out': 'RUN_OUT',
  Stumped: 'STUMPED',
  'Hit Wicket': 'HIT_WICKET',
  // The old UI offered a single "Retired" with no hurt/out distinction and
  // never persisted it, so anything stored as Retired is treated as retired
  // out — it had already been counted as a wicket at the time.
  Retired: 'RETIRED_OUT',
};

// ── Write ───────────────────────────────────────────────────

/**
 * Builds the innings node to store.
 *
 * Field names match the pre-engine schema exactly, so untouched consumers
 * keep reading it. The derived values are recomputed from events every time,
 * so this snapshot can never drift from the source of truth.
 */
export const buildInningsWrite = (state: InningsState, setup?: InningsSetup) => ({
  runs: state.runs,
  wickets: state.wickets,
  overs: state.overs,
  balls: state.balls,
  strikerId: state.strikerId,
  nonStrikerId: state.nonStrikerId,
  currentBowlerId: state.currentBowlerId,
  batsmanStats: state.batsmanStats,
  bowlerStats: state.bowlerStats,
  fieldingStats: state.fieldingStats,
  extras: state.extras,
  ballHistory: state.ballHistory,

  // ── New, additive ──
  freeHit: state.freeHit,
  legalBalls: state.legalBalls,
  partnerships: state.partnerships,
  wormPoints: state.wormPoints,
  retired: state.retired,
  penaltyRunsAgainst: state.penaltyRunsAgainst,
  awaitingBatsmanSlot: state.awaitingBatsmanSlot,
  awaitingBowler: state.awaitingBowler,
  ...(setup
    ? {
        openingStrikerId: setup.strikerId,
        openingNonStrikerId: setup.nonStrikerId,
        openingBowlerId: setup.bowlerId,
      }
    : {}),
});

/**
 * Builds the full multi-field update for a scoring action.
 *
 * Writes the event log AND every affected snapshot in ONE update, so a
 * reader can never observe a snapshot that disagrees with the events.
 */
export const buildMatchWrite = (m: {
  events: MatchEvent[];
  innings1: InningsState;
  innings2: InningsState | null;
  raw: StoredMatch;
  status?: MatchStatus;
  outcome?: MatchOutcome | null;
  superOvers?: SuperOverState[];
  replacements?: Replacement[];
  interruptions?: Interruption[];
}): Record<string, unknown> => {
  const out: Record<string, unknown> = {
    ballEvents: m.events,
    innings1: buildInningsWrite(m.innings1),
  };

  if (m.innings2) out.innings2 = buildInningsWrite(m.innings2);

  if (m.status) {
    out.matchStatus = m.status;
    // Keep the legacy `status` string in step so existing filters and
    // badges across the app carry on working.
    out.status =
      m.status === 'COMPLETED' || m.status === 'ABANDONED' || m.status === 'NO_RESULT' || m.status === 'AWARDED'
        ? 'completed'
        : m.status === 'SUSPENDED'
        ? 'paused'
        : 'live';
  }

  if (m.outcome) {
    out.result = m.outcome;
    // Legacy `winner` sentence, still written for backward compatibility.
    // Nothing in the engine parses it back — see outcome.ts.
    out.winner = m.outcome.text;
  }

  if (m.superOvers) {
    out.superOvers = m.superOvers.map(so => ({
      index: so.index,
      battingFirstTeam: so.battingFirstTeam,
    }));
  }
  if (m.replacements) out.replacements = m.replacements;
  if (m.interruptions) out.interruptions = m.interruptions;

  return out;
};

/** Super Over innings snapshots, stored under their namespaced keys. */
export const buildSuperOverWrite = (
  superOvers: SuperOverState[]
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const so of superOvers) {
    if (so.innings1) out[`superOverInnings/so${so.index}_innings1`] = buildInningsWrite(so.innings1);
    if (so.innings2) out[`superOverInnings/so${so.index}_innings2`] = buildInningsWrite(so.innings2);
  }
  return out;
};

// ── Tournament hand-off ─────────────────────────────────────

/**
 * Everything a tournament needs from a finished match, computed once here
 * so the tournament layer never re-derives a result from a sentence.
 */
export const buildTournamentResult = (m: EngineMatch) => {
  const team1 = m.raw.team1 ?? 'Team 1';
  const team2 = m.raw.team2 ?? 'Team 2';

  const countsForNRR =
    m.outcome.resultType !== 'NO_RESULT' &&
    m.outcome.resultType !== 'ABANDONED' &&
    m.outcome.resultType !== 'IN_PROGRESS' &&
    m.innings2 != null;

  const oversQuota =
    m.interruptions.filter(i => i.revisedOvers != null).slice(-1)[0]?.revisedOvers ??
    m.rules.totalOvers;

  return {
    team1,
    team2,
    outcome: m.outcome,
    // Super Over runs and overs are excluded from NRR unless the
    // competition explicitly counts them.
    nrrInputs:
      countsForNRR && m.innings2
        ? buildNRRInputs({
            team1,
            team2,
            innings1: m.innings1,
            innings2: m.innings2,
            rules: m.rules,
            oversQuota,
          })
        : null,
    rules: m.rules,
    matchId: m.raw.id ?? null,
  };
};

/** Chase target in force, after any official revision. */
export const currentTarget = (m: EngineMatch): number | null => {
  if (!m.innings1) return null;
  const revised = m.interruptions.filter(i => i.revisedTarget != null).slice(-1)[0]?.revisedTarget;
  return revised ?? targetFor(m.innings1.runs);
};

/** Events for the innings currently being scored. */
export const activeInningsEvents = (m: EngineMatch): MatchEvent[] => {
  const chain = resolveSuperOverChain(m.superOvers, m.raw.team1 ?? '', m.raw.team2 ?? '', m.rules);
  if (chain.activeIndex != null) {
    const so = m.superOvers.find(s => s.index === chain.activeIndex);
    const which = so && isSuperOverInningsComplete(so.innings1, m.rules) ? 2 : 1;
    return eventsForInnings(m.events, `so${chain.activeIndex}_innings${which}`);
  }
  const key = (m.raw.currentInnings ?? 1) === 2 ? 'innings2' : 'innings1';
  return eventsForInnings(m.events, key);
};

/** Innings key currently being scored. */
export const activeInningsKey = (m: EngineMatch): string => {
  const chain = resolveSuperOverChain(m.superOvers, m.raw.team1 ?? '', m.raw.team2 ?? '', m.rules);
  if (chain.activeIndex != null) {
    const so = m.superOvers.find(s => s.index === chain.activeIndex);
    const which = so && isSuperOverInningsComplete(so.innings1, m.rules) ? 2 : 1;
    return `so${chain.activeIndex}_innings${which}`;
  }
  return (m.raw.currentInnings ?? 1) === 2 ? 'innings2' : 'innings1';
};

export { isSuperOverKey, parseSuperOverKey, statKey };
