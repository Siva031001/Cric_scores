// ─────────────────────────────────────────────────────────────
// PERFORMANCE SCORE — Player of the Match SUGGESTION
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// IMPORTANT, and the reason this module is named "performance" rather than
// "manOfMatch": the ranking below is an APPLICATION HEURISTIC invented for
// this product. It is not an ICC rule and must never be presented as one.
// No governing body defines a numeric Player-of-the-Match formula.
//
// So the contract is:
//   - the engine SUGGESTS a ranked shortlist with a visible score
//   - the weights are configurable per competition
//   - the scorer or official always makes the final call and can pick
//     anyone, or skip the award entirely
//
// The default weights reproduce the app's previous behaviour exactly, so
// matches already awarded do not silently re-rank after this refactor.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  InningsState,
  PerformanceScoreWeights,
} from './types';
import { statKey } from './reduce';
import { economy as economyOf, strikeRate } from './outcome';

export interface RosterPlayer {
  id: number;
  name: string;
  globalPlayerId?: string | null;
}

export interface PerformanceBreakdown {
  batting: number;
  bowling: number;
  fielding: number;
}

export interface PerformanceCandidate {
  /** Stable identity across innings and teams. */
  key: string;
  playerId: number;
  globalPlayerId: string | null;
  name: string;
  teamName: string;
  score: number;
  battingLine: string;
  bowlingLine: string;
  fieldingLine: string;
  breakdown: PerformanceBreakdown;
}

export interface PerformanceInput {
  team1: string;
  team2: string;
  team1Players: RosterPlayer[];
  team2Players: RosterPlayer[];
  innings1: InningsState | null;
  innings2: InningsState | null;
  rules: CompetitionRules;
  /** Super Over innings, included only when the competition counts them. */
  superOverInnings?: Array<{ state: InningsState; battingTeam: string }>;
}

const identityKey = (
  globalPlayerId: string | null | undefined,
  playerId: number,
  teamName: string
): string => globalPlayerId ?? `local:${playerId}:${teamName}`;

/**
 * Ranks every player who contributed, highest score first.
 * Scores accumulate across both innings, so an all-round match shows up.
 */
export const computePerformanceScores = (input: PerformanceInput): PerformanceCandidate[] => {
  const w = input.rules.performanceScoreWeights;
  const acc = new Map<string, PerformanceCandidate>();

  const upsert = (
    key: string,
    playerId: number,
    globalPlayerId: string | null,
    name: string,
    teamName: string
  ): PerformanceCandidate => {
    const existing = acc.get(key);
    if (existing) return existing;
    const fresh: PerformanceCandidate = {
      key,
      playerId,
      globalPlayerId,
      name,
      teamName,
      score: 0,
      battingLine: '-',
      bowlingLine: '-',
      fieldingLine: '-',
      breakdown: { batting: 0, bowling: 0, fielding: 0 },
    };
    acc.set(key, fresh);
    return fresh;
  };

  const processInnings = (
    inn: InningsState | null,
    battingPlayers: RosterPlayer[],
    bowlingPlayers: RosterPlayer[],
    battingTeam: string,
    bowlingTeam: string
  ) => {
    if (!inn) return;

    // ── Batting ──
    for (const player of battingPlayers) {
      const bs = inn.batsmanStats[statKey(player.id)];
      if (!bs || bs.balls === 0) continue;

      const runs = bs.runs ?? 0;
      const balls = bs.balls ?? 0;
      const fours = bs.fours ?? 0;
      const sixes = bs.sixes ?? 0;
      const notOut = !bs.isOut;

      const score =
        runs * w.runPerRun +
        fours * w.perFour +
        sixes * w.perSix +
        (runs >= 100 ? w.centuryBonus : runs >= 50 ? w.fiftyBonus : 0) +
        (notOut ? w.notOutBonus : 0);

      const key = identityKey(bs.globalPlayerId ?? player.globalPlayerId, player.id, battingTeam);
      const c = upsert(key, player.id, bs.globalPlayerId ?? player.globalPlayerId ?? null, player.name, battingTeam);
      c.score += score;
      c.breakdown.batting += score;
      // Retired hurt reads as not out but is worth distinguishing on the card.
      const suffix = bs.retired === 'RETIRED_HURT' ? '*' : notOut ? '*' : '';
      c.battingLine = `${runs}(${balls}) SR:${strikeRate(runs, balls)} 4s:${fours} 6s:${sixes}${suffix}`;
    }

    // ── Bowling ──
    for (const player of bowlingPlayers) {
      const bw = inn.bowlerStats[statKey(player.id)];
      if (!bw) continue;
      if ((bw.overs ?? 0) === 0 && (bw.balls ?? 0) === 0) continue;

      const wickets = bw.wickets ?? 0;
      const maidens = bw.maidens ?? 0;
      const totalOvers = (bw.overs ?? 0) + (bw.balls ?? 0) / input.rules.ballsPerOver;
      const eco = totalOvers > 0 ? (bw.runs ?? 0) / totalOvers : Number.POSITIVE_INFINITY;

      const score =
        wickets * w.perWicket +
        (eco < 6 ? w.economyUnder6Bonus : eco < 8 ? w.economyUnder8Bonus : 0) +
        maidens * w.perMaiden;

      const key = identityKey(bw.globalPlayerId ?? player.globalPlayerId, player.id, bowlingTeam);
      const c = upsert(key, player.id, bw.globalPlayerId ?? player.globalPlayerId ?? null, player.name, bowlingTeam);
      c.score += score;
      c.breakdown.bowling += score;
      c.bowlingLine = `${bw.overs}.${bw.balls} ov, ${bw.runs} runs, ${wickets} wkts, Eco:${economyOf(
        bw.runs ?? 0,
        bw.overs ?? 0,
        bw.balls ?? 0,
        input.rules.ballsPerOver
      )}`;
    }

    // ── Fielding ──
    // Fielding stats are keyed by sanitised display name (legacy schema), so
    // the roster is matched on name.
    for (const fs of Object.values(inn.fieldingStats ?? {})) {
      if (!fs) continue;
      const player = bowlingPlayers.find(p => p.name === fs.displayName);
      if (!player) continue;

      const catches = fs.catches ?? 0;
      const stumpings = fs.stumpings ?? 0;
      const runOuts = fs.runOuts ?? 0;
      const score = catches * w.perCatch + stumpings * w.perStumping + runOuts * w.perRunOut;
      if (score === 0) continue;

      const key = identityKey(fs.globalPlayerId ?? player.globalPlayerId, player.id, bowlingTeam);
      const c = upsert(key, player.id, fs.globalPlayerId ?? player.globalPlayerId ?? null, player.name, bowlingTeam);
      c.score += score;
      c.breakdown.fielding += score;

      const parts: string[] = [];
      if (catches > 0) parts.push(`${catches} ct`);
      if (stumpings > 0) parts.push(`${stumpings} st`);
      if (runOuts > 0) parts.push(`${runOuts} ro`);
      if (parts.length > 0) c.fieldingLine = parts.join(', ');
    }
  };

  processInnings(input.innings1, input.team1Players, input.team2Players, input.team1, input.team2);
  processInnings(input.innings2, input.team2Players, input.team1Players, input.team2, input.team1);

  // Super Over contributions only when the competition counts them.
  if (input.rules.superOverCountsInStats) {
    for (const so of input.superOverInnings ?? []) {
      const battingIsTeam1 = so.battingTeam === input.team1;
      processInnings(
        so.state,
        battingIsTeam1 ? input.team1Players : input.team2Players,
        battingIsTeam1 ? input.team2Players : input.team1Players,
        battingIsTeam1 ? input.team1 : input.team2,
        battingIsTeam1 ? input.team2 : input.team1
      );
    }
  }

  return [...acc.values()].sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
};

/**
 * The shortlist shown to the scorer. Defaults to 3 so a losing-side
 * standout is visible alongside the winners — the scorer can still choose
 * anyone from the full ranking.
 */
export const suggestPlayerOfTheMatch = (
  input: PerformanceInput,
  shortlistSize = 3
): PerformanceCandidate[] => computePerformanceScores(input).slice(0, Math.max(1, shortlistSize));

/**
 * Wording for the UI. Deliberately explicit that this is a suggestion,
 * so the interface cannot imply the app is applying an official rule.
 */
export const PERFORMANCE_SCORE_DISCLAIMER =
  'Suggested from an in-app performance score. Not an official ICC calculation — the scorer decides.';
