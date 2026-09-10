// ─────────────────────────────────────────────────────────────
// TOURNAMENT STANDINGS — points, NRR, configurable tie-breakers
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// Two things this fixes structurally:
//
//  1. Points are applied from a STRUCTURED MatchOutcome, not by substring
//     matching an English result sentence. The old approach awarded points
//     to both sides when team names overlapped, and recorded a loss for
//     both sides on an abandoned match.
//
//  2. Tie-break order is data, not code. Competitions legitimately rank on
//     different criteria, so the order is stored per tournament and applied
//     here — no single ordering is baked in.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  MatchOutcome,
  NRRInput,
  TieBreaker,
} from './types';
import { netRunRate } from './outcome';

export interface StandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  tied: number;
  noResult: number;
  points: number;
  /** Cumulative NRR accumulators, kept so NRR is exact across a season
   *  rather than an average of per-match rates. */
  nrrRunsFor: number;
  nrrOversFor: number;
  nrrRunsAgainst: number;
  nrrOversAgainst: number;
  nrr: number;
  /** Original seeding, used as the final deterministic tie-break. */
  seed?: number;
}

export const emptyStanding = (teamId: string, teamName: string, seed?: number): StandingRow => ({
  teamId,
  teamName,
  played: 0,
  won: 0,
  lost: 0,
  tied: 0,
  noResult: 0,
  points: 0,
  nrrRunsFor: 0,
  nrrOversFor: 0,
  nrrRunsAgainst: 0,
  nrrOversAgainst: 0,
  nrr: 0,
  ...(seed != null ? { seed } : {}),
});

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Points a team earns from one result, per the competition's scheme. */
export const pointsFor = (
  role: 'WINNER' | 'LOSER' | 'TIED' | 'NO_RESULT',
  outcome: MatchOutcome,
  rules: CompetitionRules
): number => {
  const p = rules.pointsRules;
  const bySuperOver = outcome.resultType === 'TIE_BROKEN_BY_SUPER_OVER';
  switch (role) {
    case 'WINNER':
      return bySuperOver ? p.superOverWin ?? p.win : p.win;
    case 'LOSER':
      return bySuperOver ? p.superOverLoss ?? p.loss : p.loss;
    case 'TIED':
      return p.tie;
    case 'NO_RESULT':
      return outcome.resultType === 'ABANDONED' ? p.abandoned : p.noResult;
    default:
      return 0;
  }
};

export interface ApplyMatchInput {
  outcome: MatchOutcome;
  /** NRR contributions for both sides. Omit for a no-result: a match with
   *  no result contributes nothing to run rate. */
  nrrInputs?: [NRRInput, NRRInput] | null;
  rules: CompetitionRules;
  team1: string;
  team2: string;
}

/**
 * Folds one completed match into a standings table.
 *
 * Returns a NEW array; rows for teams not involved are passed through
 * untouched. Matching is by exact team name, so a team must be named
 * consistently — overlapping names no longer cause cross-contamination
 * because there is no substring test anywhere in this path.
 */
export const applyMatchToStandings = (
  rows: StandingRow[],
  input: ApplyMatchInput
): StandingRow[] => {
  const { outcome, rules, team1, team2 } = input;

  // Nothing to record while a match is still live.
  if (outcome.resultType === 'IN_PROGRESS') return rows;

  const nrrByTeam = new Map<string, NRRInput>();
  // Annotated explicitly: `input.nrrInputs ?? []` widens the empty-array
  // branch to never[], which loses NRRInput on the union.
  const contributions: NRRInput[] = input.nrrInputs ?? [];
  contributions.forEach(n => nrrByTeam.set(n.teamName, n));

  const isNoResult =
    outcome.resultType === 'NO_RESULT' || outcome.resultType === 'ABANDONED';
  const isTie = outcome.resultType === 'TIE';

  return rows.map(row => {
    if (row.teamName !== team1 && row.teamName !== team2) return row;

    const next: StandingRow = { ...row, played: num(row.played) + 1 };

    if (isNoResult) {
      next.noResult = num(row.noResult) + 1;
      next.points = num(row.points) + pointsFor('NO_RESULT', outcome, rules);
      // Deliberately no NRR contribution.
      return next;
    }

    if (isTie) {
      next.tied = num(row.tied) + 1;
      next.points = num(row.points) + pointsFor('TIED', outcome, rules);
    } else {
      const isWinner = outcome.winnerTeam === row.teamName;
      if (isWinner) {
        next.won = num(row.won) + 1;
        next.points = num(row.points) + pointsFor('WINNER', outcome, rules);
      } else {
        next.lost = num(row.lost) + 1;
        next.points = num(row.points) + pointsFor('LOSER', outcome, rules);
      }
      // A Super Over decides the match but the underlying game was level;
      // competitions that count it as a tie for record purposes do so via
      // the points scheme, while the W/L columns reflect who progressed.
      if (outcome.resultType === 'TIE_BROKEN_BY_SUPER_OVER') {
        next.tied = num(row.tied) + 1;
      }
    }

    const contrib = nrrByTeam.get(row.teamName);
    if (contrib) {
      next.nrrRunsFor = num(row.nrrRunsFor) + contrib.runsFor;
      next.nrrOversFor = num(row.nrrOversFor) + contrib.oversFor;
      next.nrrRunsAgainst = num(row.nrrRunsAgainst) + contrib.runsAgainst;
      next.nrrOversAgainst = num(row.nrrOversAgainst) + contrib.oversAgainst;
      next.nrr = netRunRate(
        next.nrrRunsFor,
        next.nrrOversFor,
        next.nrrRunsAgainst,
        next.nrrOversAgainst
      );
    }

    return next;
  });
};

// ── Head to head ────────────────────────────────────────────

export type HeadToHead = Record<string, Record<string, number>>;

export interface CompletedMatchRef {
  team1: string;
  team2: string;
  outcome: MatchOutcome;
}

/** Wins of A over B, from the structured outcomes. */
export const buildHeadToHead = (matches: CompletedMatchRef[]): HeadToHead => {
  const h2h: HeadToHead = {};
  const bump = (a: string, b: string) => {
    if (!h2h[a]) h2h[a] = {};
    h2h[a][b] = (h2h[a][b] ?? 0) + 1;
  };
  for (const m of matches) {
    const w = m.outcome.winnerTeam;
    if (!w) continue;
    const l = m.outcome.loserTeam ?? (w === m.team1 ? m.team2 : m.team1);
    bump(w, l);
  }
  return h2h;
};

const headToHeadCompare = (a: StandingRow, b: StandingRow, h2h: HeadToHead): number => {
  const aOverB = h2h[a.teamName]?.[b.teamName] ?? 0;
  const bOverA = h2h[b.teamName]?.[a.teamName] ?? 0;
  return bOverA - aOverB; // more wins ranks higher (ascending comparator)
};

// ── Sorting ─────────────────────────────────────────────────

const comparatorFor =
  (rule: TieBreaker, h2h: HeadToHead) =>
  (a: StandingRow, b: StandingRow): number => {
    switch (rule) {
      case 'POINTS':
        return num(b.points) - num(a.points);
      case 'WINS':
        return num(b.won) - num(a.won);
      case 'FEWEST_LOSSES':
        return num(a.lost) - num(b.lost);
      case 'NRR':
        return num(b.nrr) - num(a.nrr);
      case 'HEAD_TO_HEAD':
        return headToHeadCompare(a, b, h2h);
      case 'SEEDING':
        // Lower seed number ranks higher. Unseeded rows sort last.
        return (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER);
      default:
        return 0;
    }
  };

/**
 * Sorts a standings table using the competition's configured tie-break
 * order, applying each criterion only when the previous ones are level.
 *
 * A final name comparison makes the sort total, so the table never reorders
 * unpredictably between renders when two rows are genuinely identical.
 */
export const sortStandings = (
  rows: StandingRow[],
  tieBreakers: TieBreaker[],
  h2h: HeadToHead = {}
): StandingRow[] => {
  const rules = tieBreakers.length > 0 ? tieBreakers : ['POINTS' as TieBreaker];
  const comparators = rules.map(r => comparatorFor(r, h2h));
  return [...rows].sort((a, b) => {
    for (const cmp of comparators) {
      const d = cmp(a, b);
      if (d !== 0) return d;
    }
    return a.teamName.localeCompare(b.teamName);
  });
};

/** Top N qualifiers from a pool, ranked by the configured tie-breakers. */
export const poolQualifiers = (
  rows: StandingRow[],
  qualifyCount: number,
  tieBreakers: TieBreaker[],
  h2h: HeadToHead = {},
  poolName?: string
): Array<StandingRow & { poolRank: number; poolName?: string }> => {
  const sorted = sortStandings(rows, tieBreakers, h2h);
  const take = qualifyCount > 0 ? qualifyCount : sorted.length;
  return sorted.slice(0, take).map((r, i) => ({
    ...r,
    poolRank: i + 1,
    ...(poolName ? { poolName } : {}),
  }));
};

/** Formats NRR the way a points table shows it: +0.42 / -1.05 / 0.00. */
export const formatNRR = (nrr: number): string => {
  const v = num(nrr);
  if (v === 0) return '0.00';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
};
