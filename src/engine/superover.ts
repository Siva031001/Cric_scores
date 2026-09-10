// ─────────────────────────────────────────────────────────────
// SUPER OVER
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// A Super Over is modelled as a pair of ordinary innings folded by the same
// reducer, under a namespaced innings key (`so1_innings1`). That gives it
// every rule the main engine already enforces — legal deliveries, wides,
// no-balls, free hits, strike rotation — without a second scoring engine.
//
// The namespacing is also what keeps Super Over runs, wickets, balls and
// overs OUT of regulation player statistics and out of NRR, which is
// required: a Super Over must not distort a season-long run rate.
//
// Ties chain. If a Super Over is itself tied, another begins, until the
// competition's rules produce a winner.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  EngineError,
  InningsKey,
  InningsState,
  MatchEvent,
  SuperOverState,
} from './types';
import { isAllOut } from './reduce';
import { superOverRules } from './profiles';

/** Innings key for a Super Over half. Index is 1-based. */
export const superOverInningsKey = (index: number, which: 1 | 2): InningsKey =>
  `so${index}_innings${which}`;

/** True when a key belongs to any Super Over rather than regulation play. */
export const isSuperOverKey = (key: InningsKey): boolean => /^so\d+_innings[12]$/.test(key);

export const parseSuperOverKey = (
  key: InningsKey
): { index: number; which: 1 | 2 } | null => {
  const m = /^so(\d+)_innings([12])$/.exec(key);
  if (!m) return null;
  return { index: parseInt(m[1], 10), which: parseInt(m[2], 10) as 1 | 2 };
};

/**
 * Decides which side bats first in a Super Over, according to the
 * competition's configured rule rather than a hard-coded assumption.
 */
export const superOverBattingFirstTeam = (opts: {
  rules: CompetitionRules;
  /** Team that batted first in the regulation match. */
  matchBattingFirstTeam: string;
  /** Team that batted second in the regulation match. */
  matchChasingTeam: string;
  /** Required when the rule is TOSS — the scorer records the toss winner. */
  tossWinner?: string | null;
}): string => {
  const { rules, matchBattingFirstTeam, matchChasingTeam, tossWinner } = opts;
  switch (rules.superOverBattingFirst) {
    case 'SAME_AS_MATCH':
      return matchBattingFirstTeam;
    case 'TOSS':
      if (!tossWinner) {
        throw new EngineError(
          'MISSING_TOSS',
          'This competition decides the Super Over batting order by toss — record the toss winner'
        );
      }
      return tossWinner;
    case 'CHASING_TEAM':
    default:
      return matchChasingTeam;
  }
};

/** Creates an empty Super Over record. */
export const createSuperOver = (
  index: number,
  battingFirstTeam: string
): SuperOverState => ({
  index,
  battingFirstTeam,
  innings1: null,
  innings2: null,
  complete: false,
  tied: false,
  winnerTeam: null,
});

/** Rules that govern the Super Over itself, derived from the match rules. */
export const rulesForSuperOver = (parent: CompetitionRules): CompetitionRules =>
  superOverRules(parent);

/**
 * A Super Over innings ends on its over limit, its (much lower) wicket
 * limit, or — for the side batting second — on passing the target.
 */
export const isSuperOverInningsComplete = (
  state: InningsState | null,
  rules: CompetitionRules,
  target?: number | null
): boolean => {
  if (!state) return false;
  const so = rulesForSuperOver(rules);
  if (state.wickets >= so.allOutWickets) return true;
  if (state.overs >= so.totalOvers) return true;
  if (target != null && state.runs >= target) return true;
  return false;
};

export interface SuperOverResolution {
  complete: boolean;
  tied: boolean;
  winnerTeam: string | null;
}

/**
 * Resolves one Super Over from its two innings.
 * `chasingTeam` is whichever side did not bat first in THIS Super Over.
 */
export const resolveSuperOver = (
  so: SuperOverState,
  chasingTeam: string,
  rules: CompetitionRules
): SuperOverResolution => {
  const { innings1, innings2 } = so;
  if (!innings1 || !innings2) return { complete: false, tied: false, winnerTeam: null };

  const target = innings1.runs + 1;
  if (!isSuperOverInningsComplete(innings2, rules, target)) {
    return { complete: false, tied: false, winnerTeam: null };
  }

  if (innings2.runs >= target) {
    return { complete: true, tied: false, winnerTeam: chasingTeam };
  }
  if (innings2.runs === innings1.runs) {
    return { complete: true, tied: true, winnerTeam: null };
  }
  return { complete: true, tied: false, winnerTeam: so.battingFirstTeam };
};

/** The team chasing in a given Super Over. */
export const superOverChasingTeam = (
  so: SuperOverState,
  team1: string,
  team2: string
): string => (so.battingFirstTeam === team1 ? team2 : team1);

/**
 * Walks the whole Super Over chain and reports where the match stands.
 * `needsAnother` is true when the latest Super Over finished level.
 */
export const resolveSuperOverChain = (
  superOvers: SuperOverState[],
  team1: string,
  team2: string,
  rules: CompetitionRules
): {
  winnerTeam: string | null;
  decidedAtIndex: number | null;
  needsAnother: boolean;
  activeIndex: number | null;
} => {
  if (superOvers.length === 0) {
    return { winnerTeam: null, decidedAtIndex: null, needsAnother: false, activeIndex: null };
  }

  const ordered = [...superOvers].sort((a, b) => a.index - b.index);

  for (const so of ordered) {
    const chasing = superOverChasingTeam(so, team1, team2);
    const res = resolveSuperOver(so, chasing, rules);

    if (!res.complete) {
      // Still in progress — this is the live Super Over.
      return {
        winnerTeam: null,
        decidedAtIndex: null,
        needsAnother: false,
        activeIndex: so.index,
      };
    }
    if (!res.tied) {
      return {
        winnerTeam: res.winnerTeam,
        decidedAtIndex: so.index,
        needsAnother: false,
        activeIndex: null,
      };
    }
    // Tied — fall through to the next Super Over in the chain.
  }

  // Every Super Over so far ended level, so another is required.
  const last = ordered[ordered.length - 1];
  return {
    winnerTeam: null,
    decidedAtIndex: null,
    needsAnother: true,
    activeIndex: last.index,
  };
};

/**
 * Builds the next Super Over in a chain. In a repeat Super Over the sides
 * swap who bats first, which is the common playing condition.
 */
export const nextSuperOver = (
  superOvers: SuperOverState[],
  team1: string,
  team2: string
): SuperOverState => {
  if (superOvers.length === 0) {
    throw new EngineError('NO_CHAIN', 'Cannot continue a Super Over chain that has not started');
  }
  const last = [...superOvers].sort((a, b) => a.index - b.index)[superOvers.length - 1];
  const swapped = last.battingFirstTeam === team1 ? team2 : team1;
  return createSuperOver(last.index + 1, swapped);
};

/**
 * Filters a flat event log down to regulation play only.
 * Used when computing career statistics and NRR so Super Over deliveries
 * are excluded unless the competition counts them.
 */
export const regulationEventsOnly = (events: MatchEvent[]): MatchEvent[] =>
  events.filter(e => !isSuperOverKey(e.inningsKey));

export const superOverEventsOnly = (events: MatchEvent[]): MatchEvent[] =>
  events.filter(e => isSuperOverKey(e.inningsKey));

/** Short summary line for display, e.g. "7/0 (0.4)". */
export const superOverScoreLine = (
  state: InningsState | null,
  rules: CompetitionRules
): string => {
  if (!state) return '—';
  return `${state.runs}/${state.wickets} (${state.overs}.${state.balls})`;
};

/** Whether a Super Over should be offered at all. */
export const canStartSuperOver = (rules: CompetitionRules): boolean => rules.superOverEnabled;

/** Guard: a Super Over innings must not exceed its wicket limit. */
export const assertSuperOverLegal = (state: InningsState, rules: CompetitionRules): void => {
  const so = rulesForSuperOver(rules);
  if (state.wickets > so.allOutWickets) {
    throw new EngineError(
      'SUPER_OVER_WICKETS',
      `A Super Over innings ends after ${so.allOutWickets} wickets`
    );
  }
  if (isAllOut(state, so) && state.overs < so.totalOvers) {
    // Legal state, just noting the innings is over — not an error.
  }
};
