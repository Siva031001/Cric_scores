// ─────────────────────────────────────────────────────────────
// MATCH OUTCOME + NRR INPUTS
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// The app previously encoded the result as an English sentence
// ("Rangers won by 5 runs") and then recovered its meaning by substring
// matching — `winner.includes(team1 + ' won')`. That is unsafe: two teams
// whose names overlap ("CSK" / "Super CSK") both match, awarding points to
// both sides; and an abandonment reason stored in the same field parses as
// a loss for everyone.
//
// Here the outcome is a STRUCTURED value. The sentence is generated from it
// for display and is never parsed back to recover meaning.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  InningsState,
  MatchOutcome,
  MatchStatus,
  NRRInput,
  ResultType,
  SuperOverState,
} from './types';
import { oversDecimal, isAllOut } from './reduce';

/** Runs needed to WIN (one more than the score to tie). */
export const targetFor = (firstInningsRuns: number): number => firstInningsRuns + 1;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export interface OutcomeInput {
  team1: string;
  team2: string;
  innings1: InningsState | null;
  innings2: InningsState | null;
  rules: CompetitionRules;
  status: MatchStatus;
  /** Set by an official after an interruption. Overrides the natural target. */
  revisedTarget?: number | null;
  revisedOvers?: number | null;
  superOvers?: SuperOverState[];
  /** For an AWARDED result the official names the winner directly. */
  awardedTo?: string | null;
}

/**
 * Determines the result of a match from its state. Never guesses: an
 * interrupted match stays IN_PROGRESS until an official records a status.
 */
export const resolveMatchOutcome = (input: OutcomeInput): MatchOutcome => {
  const { team1, team2, innings1, innings2, rules, status } = input;

  const none: MatchOutcome = {
    resultType: 'IN_PROGRESS',
    winnerTeam: null,
    loserTeam: null,
    margin: null,
    marginType: null,
    ballsRemaining: null,
    text: '',
    decidedBySuperOver: false,
    superOverIndex: null,
  };

  if (status === 'ABANDONED') {
    return { ...none, resultType: 'ABANDONED', text: 'Match abandoned' };
  }
  if (status === 'NO_RESULT') {
    return { ...none, resultType: 'NO_RESULT', text: 'No result' };
  }
  if (status === 'AWARDED') {
    const winner = input.awardedTo ?? null;
    return {
      ...none,
      resultType: 'AWARDED',
      winnerTeam: winner,
      loserTeam: winner ? (winner === team1 ? team2 : team1) : null,
      text: winner ? `${winner} awarded the match` : 'Match awarded',
    };
  }

  if (!innings1 || !innings2) return none;

  const runs1 = innings1.runs;
  const runs2 = innings2.runs;
  const target = input.revisedTarget ?? targetFor(runs1);
  const chaseOvers = input.revisedOvers ?? rules.totalOvers;

  const chaseDone =
    runs2 >= target ||
    isAllOut(innings2, rules) ||
    innings2.overs >= chaseOvers;

  if (!chaseDone) return none;

  // ── Chase succeeded ──
  if (runs2 >= target) {
    const wicketsRemaining = Math.max(0, rules.allOutWickets - innings2.wickets);
    const ballsBowled = innings2.overs * rules.ballsPerOver + innings2.balls;
    const ballsRemaining = Math.max(0, chaseOvers * rules.ballsPerOver - ballsBowled);
    return {
      resultType: 'WIN_BY_WICKETS',
      winnerTeam: team2,
      loserTeam: team1,
      margin: wicketsRemaining,
      marginType: 'WICKETS',
      ballsRemaining,
      text: `${team2} won by ${plural(wicketsRemaining, 'wicket')}`,
      decidedBySuperOver: false,
      superOverIndex: null,
    };
  }

  // ── Tie ──
  if (runs2 === runs1) {
    const decided = resolveSuperOvers(input.superOvers ?? [], team1, team2);
    if (decided) return decided;
    return {
      ...none,
      resultType: 'TIE',
      margin: 0,
      text: 'Match tied',
    };
  }

  // ── Defended ──
  const margin = runs1 - runs2;
  return {
    resultType: 'WIN_BY_RUNS',
    winnerTeam: team1,
    loserTeam: team2,
    margin,
    marginType: 'RUNS',
    ballsRemaining: null,
    text: `${team1} won by ${plural(margin, 'run')}`,
    decidedBySuperOver: false,
    superOverIndex: null,
  };
};

/**
 * Walks the Super Over chain. Multiple Super Overs are supported: each tie
 * rolls into the next, and the first decisive one settles the match.
 */
export const resolveSuperOvers = (
  superOvers: SuperOverState[],
  team1: string,
  team2: string
): MatchOutcome | null => {
  for (const so of superOvers) {
    if (!so.complete || !so.winnerTeam) continue;
    const loser = so.winnerTeam === team1 ? team2 : team1;
    return {
      resultType: 'TIE_BROKEN_BY_SUPER_OVER',
      winnerTeam: so.winnerTeam,
      loserTeam: loser,
      margin: null,
      marginType: null,
      ballsRemaining: null,
      text: `Match tied — ${so.winnerTeam} won the Super Over`,
      decidedBySuperOver: true,
      superOverIndex: so.index,
    };
  }
  return null;
};

/** True when the regulation match finished level and needs a tie-break. */
export const isRegulationTie = (
  innings1: InningsState | null,
  innings2: InningsState | null,
  rules: CompetitionRules,
  revisedTarget?: number | null
): boolean => {
  if (!innings1 || !innings2) return false;
  const target = revisedTarget ?? targetFor(innings1.runs);
  const chaseDone =
    innings2.runs >= target || isAllOut(innings2, rules) || innings2.overs >= rules.totalOvers;
  return chaseDone && innings2.runs === innings1.runs;
};

// ── Net Run Rate ────────────────────────────────────────────

/**
 * Builds the NRR contribution for both sides of one completed match.
 *
 * Two rules matter and both were previously wrong or hard-coded:
 *
 *  1. All-out rule — a side dismissed inside its full quota is charged the
 *     FULL quota of overs, not the overs it actually faced. The old code
 *     tested `wickets >= 10`, so an 8-a-side match (all out at 7) never
 *     triggered it.
 *  2. Super Over runs and overs are excluded unless the competition
 *     explicitly counts them, because a Super Over would otherwise distort
 *     a season-long run rate.
 */
export const buildNRRInputs = (input: {
  team1: string;
  team2: string;
  innings1: InningsState;
  innings2: InningsState;
  rules: CompetitionRules;
  /** Overs quota actually applicable, after any DLS revision. */
  oversQuota?: number | null;
}): [NRRInput, NRRInput] => {
  const { team1, team2, innings1, innings2, rules } = input;
  const quota = input.oversQuota ?? rules.totalOvers;

  const faced1 = oversDecimal(innings1, rules);
  const faced2 = oversDecimal(innings2, rules);

  const denom1 = isAllOut(innings1, rules) ? quota : faced1;
  const denom2 = isAllOut(innings2, rules) ? quota : faced2;

  return [
    {
      teamName: team1,
      runsFor: innings1.runs,
      oversFor: denom1,
      runsAgainst: innings2.runs,
      oversAgainst: denom2,
    },
    {
      teamName: team2,
      runsFor: innings2.runs,
      oversFor: denom2,
      runsAgainst: innings1.runs,
      oversAgainst: denom1,
    },
  ];
};

/** NRR from cumulative season totals. */
export const netRunRate = (
  runsFor: number,
  oversFor: number,
  runsAgainst: number,
  oversAgainst: number
): number => {
  const forRate = oversFor > 0 ? runsFor / oversFor : 0;
  const againstRate = oversAgainst > 0 ? runsAgainst / oversAgainst : 0;
  return forRate - againstRate;
};

// ── Display helpers ─────────────────────────────────────────

export const runRate = (runs: number, overs: number, balls: number, ballsPerOver = 6): string => {
  const total = overs + balls / ballsPerOver;
  if (total <= 0) return '0.00';
  return (runs / total).toFixed(2);
};

/**
 * Required run rate for a chase. Returns null — not a sentinel string —
 * when it does not apply, so callers can distinguish "match over" from
 * "no data" instead of both rendering as '---'.
 */
export const requiredRunRate = (
  target: number,
  runs: number,
  totalOvers: number,
  overs: number,
  balls: number,
  ballsPerOver = 6
): number | null => {
  const oversLeft = totalOvers - overs - balls / ballsPerOver;
  if (oversLeft <= 0) return null;
  const needed = target - runs;
  if (needed <= 0) return null;
  return needed / oversLeft;
};

export const strikeRate = (runs: number, balls: number): string =>
  balls <= 0 ? '0.00' : ((runs / balls) * 100).toFixed(1);

export const economy = (runs: number, overs: number, balls: number, ballsPerOver = 6): string => {
  const total = overs + balls / ballsPerOver;
  if (total <= 0) return '0.00';
  return (runs / total).toFixed(2);
};

/** Human-readable status label, generated from the state machine value. */
export const statusLabel = (status: MatchStatus): string => {
  switch (status) {
    case 'SCHEDULED': return 'Scheduled';
    case 'IN_PROGRESS': return 'Live';
    case 'SUSPENDED': return 'Suspended';
    case 'RESUMED': return 'Live';
    case 'SUPER_OVER': return 'Super Over';
    case 'COMPLETED': return 'Completed';
    case 'ABANDONED': return 'Abandoned';
    case 'NO_RESULT': return 'No Result';
    case 'AWARDED': return 'Awarded';
    default: return String(status);
  }
};

export const resultTypeLabel = (t: ResultType): string => {
  switch (t) {
    case 'WIN_BY_RUNS': return 'Win by runs';
    case 'WIN_BY_WICKETS': return 'Win by wickets';
    case 'TIE': return 'Tie';
    case 'TIE_BROKEN_BY_SUPER_OVER': return 'Tie — decided by Super Over';
    case 'NO_RESULT': return 'No result';
    case 'ABANDONED': return 'Abandoned';
    case 'AWARDED': return 'Awarded';
    case 'IN_PROGRESS': return 'In progress';
    default: return String(t);
  }
};
