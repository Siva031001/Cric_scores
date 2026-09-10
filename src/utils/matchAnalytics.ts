// ─────────────────────────────────────────────────────────────
// LIVE VIEWER ANALYTICS
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// These values are now READ from the engine rather than recomputed here.
//
// This file previously contained its own copy of the ball-result parser —
// one of three in the codebase, and out of step with the other two. It did
// not recognise a run-out token ("2W(RO)"), so `getCurrentPartnership`
// silently ran straight through the last wicket and merged earlier
// partnerships into the current one, and `getWormData` dropped the runs
// completed on such a ball entirely. It also had no penalty branch, so
// penalty runs vanished from the worm graph while still consuming a ball.
//
// There is exactly one parser now, in the engine's legacy adapter, and it is
// only used to migrate old matches.
// ─────────────────────────────────────────────────────────────

import {
  CompetitionRules,
  InningsState,
  Partnership,
  fromLegacyHistory,
  reduceInnings,
  resolveRules,
} from '../engine';
import { deriveInningsSetup } from '../engine/persistence';

/**
 * Returns engine state for a stored innings.
 *
 * Matches scored by the engine already carry `partnerships` and `wormPoints`
 * on the innings node, so nothing needs recomputing. Older matches are
 * converted from their legacy string history and folded on the fly — the same
 * code path the rest of the app uses, so the numbers agree.
 */
const engineInnings = (
  inn: any,
  match: any,
  rules?: CompetitionRules
): InningsState | null => {
  if (!inn) return null;

  // Engine-written innings: use it as-is.
  if (Array.isArray(inn.partnerships) && Array.isArray(inn.wormPoints)) {
    return inn as InningsState;
  }

  const r =
    rules ??
    resolveRules({
      totalOvers: match?.totalOvers ?? null,
      playersPerSide: match?.playersPerSide ?? null,
      profileId: match?.rulesProfileId ?? null,
    });

  const setup = deriveInningsSetup(inn, {
    strikerId: inn.strikerId ?? 0,
    nonStrikerId: inn.nonStrikerId ?? 1,
    bowlerId: inn.currentBowlerId ?? 0,
  });

  const events = fromLegacyHistory(inn.ballHistory, { inningsKey: 'innings1' });
  return reduceInnings(events, setup, r);
};

const rulesFor = (match: any): CompetitionRules =>
  resolveRules({
    totalOvers: match?.totalOvers ?? null,
    playersPerSide: match?.playersPerSide ?? null,
    profileId: match?.rulesProfileId ?? null,
  });

/**
 * Recent deliveries, most recent first.
 * NEW_BATSMAN markers are not deliveries and are excluded.
 */
export const getBallByBall = (inn: any, limit = 30) => {
  const history = (inn?.ballHistory ?? []).filter(
    (b: any) => b?.type !== 'NEW_BATSMAN' && b?.over !== undefined
  );
  return history.slice(-limit).reverse();
};

/**
 * The current, unfinished partnership.
 *
 * Read from the engine's partnership list rather than walked backwards
 * through ball strings, so it correctly stops at the last wicket however
 * that wicket was recorded.
 */
export const getCurrentPartnership = (inn: any, match?: any): { runs: number; balls: number } => {
  const state = engineInnings(inn, match);
  if (!state) return { runs: 0, balls: 0 };

  const partnerships: Partnership[] = state.partnerships ?? [];
  const open = partnerships.filter(p => p.unbeaten).slice(-1)[0];
  if (open) return { runs: open.runs, balls: open.balls };

  // Every partnership has closed (the last event was a wicket), so the
  // incoming pair has not faced a ball yet.
  return { runs: 0, balls: 0 };
};

/**
 * Cumulative runs per completed over, for both innings.
 *
 * The engine emits a point at each over boundary using the running total at
 * that moment. The previous implementation pushed its point AFTER already
 * adding the first ball of the NEXT over, so every plotted point sat one
 * ball ahead of its label.
 */
export const getWormData = (match: any) => {
  const rules = rulesFor(match);
  const points = (inn: any) => {
    const state = engineInnings(inn, match, rules);
    if (!state) return [];
    const pts = state.wormPoints ?? [];
    return pts.length >= 2 ? pts : [{ over: 0, runs: 0 }, ...pts];
  };

  return {
    innings1: points(match?.innings1),
    innings2: match?.innings2 ? points(match.innings2) : [],
  };
};

/**
 * Rough win-probability indicator for the chasing side.
 *
 * NOT a statistical model — a bounded heuristic from required run rate and
 * wickets in hand, for a casual viewer badge. It must never be presented as
 * a prediction.
 */
export const getWinProbability = (match: any): { team1: number; team2: number } | null => {
  if (match?.currentInnings !== 2 || !match?.innings2) return null;

  const rules = rulesFor(match);
  const target = (match.innings1?.runs ?? 0) + 1;
  const inn2 = match.innings2;
  const runsNeeded = target - (inn2.runs ?? 0);
  const totalBalls = (match.totalOvers ?? rules.totalOvers) * rules.ballsPerOver;
  const ballsBowled = (inn2.overs ?? 0) * rules.ballsPerOver + (inn2.balls ?? 0);
  const ballsLeft = totalBalls - ballsBowled;
  // Uses the competition's actual all-out threshold, not a hardcoded 10, so
  // shorter-format and small-squad matches read correctly.
  const wicketsLeft = rules.allOutWickets - (inn2.wickets ?? 0);

  if (runsNeeded <= 0) return { team1: 0, team2: 100 };
  if (ballsLeft <= 0 || wicketsLeft <= 0) return { team1: 100, team2: 0 };

  const requiredRR = (runsNeeded / ballsLeft) * rules.ballsPerOver;
  const currentRR = ballsBowled > 0 ? ((inn2.runs ?? 0) / ballsBowled) * rules.ballsPerOver : 0;

  let chasingTeamProb = 50;
  chasingTeamProb += (currentRR - requiredRR) * 4;
  chasingTeamProb += (wicketsLeft - rules.allOutWickets / 2) * 3;
  chasingTeamProb = Math.max(5, Math.min(95, chasingTeamProb));

  const team2Prob = Math.round(chasingTeamProb);
  return { team1: 100 - team2Prob, team2: team2Prob };
};

/**
 * All partnerships in an innings, best first — for the match-history
 * "Best Partnerships" panel.
 */
export const getPartnerships = (
  inn: any,
  match?: any
): Array<Partnership & { label: string }> => {
  const state = engineInnings(inn, match);
  if (!state) return [];
  const nameOf = (id: number) => {
    const rosters = [...(match?.team1Players ?? []), ...(match?.team2Players ?? [])];
    return rosters.find((p: any) => p.id === id)?.name ?? `Player ${id + 1}`;
  };
  return [...(state.partnerships ?? [])]
    .map(p => ({ ...p, label: `${nameOf(p.batterAId)} & ${nameOf(p.batterBId)}` }))
    .sort((a, b) => b.runs - a.runs);
};
