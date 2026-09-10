// ─────────────────────────────────────────────────────────────
// ANALYTICS — partnerships, worm graph, win probability
// ─────────────────────────────────────────────────────────────
// These previously came from a hand-rolled ball-string parser duplicated
// across two files. The tests below pin the behaviour that parser got wrong.
// ─────────────────────────────────────────────────────────────

import {
  getCurrentPartnership,
  getWormData,
  getWinProbability,
  getPartnerships,
  getBallByBall,
} from '../matchAnalytics';
import { deriveEvent, ScoringAction, __resetDeriveCounter } from '../../engine/derive';
import { reduceInnings } from '../../engine/reduce';
import { resolveRules } from '../../engine/profiles';
import { buildInningsWrite } from '../../engine/persistence';
import { appendEvent } from '../../engine/history';
import { CompetitionRules, InningsSetup, MatchEvent, LegacyBall } from '../../engine/types';

const rules: CompetitionRules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

const setup: InningsSetup = {
  strikerId: 0,
  nonStrikerId: 1,
  bowlerId: 20,
  battingPlayers: [
    { id: 0, name: 'Alpha' },
    { id: 1, name: 'Bravo' },
    { id: 2, name: 'Charlie' },
    { id: 3, name: 'Delta' },
  ],
  bowlingPlayers: [{ id: 20, name: 'Xray' }],
};

/** Plays actions and returns the stored innings node the app would persist. */
const storedInnings = (actions: ScoringAction[]) => {
  let events: MatchEvent[] = [];
  let state = reduceInnings(events, setup, rules);
  actions.forEach((a, i) => {
    const ev = deriveEvent(a, state, rules, {
      inningsKey: 'innings1',
      seq: i,
      timestamp: i,
      makeId: p => `${p}_${i}`,
    });
    events = appendEvent(events, ev);
    state = reduceInnings(events, setup, rules);
  });
  return buildInningsWrite(state, setup);
};

const matchShell = (innings1: any, innings2?: any) => ({
  totalOvers: 20,
  playersPerSide: 11,
  currentInnings: innings2 ? 2 : 1,
  team1: 'Alpha XI',
  team2: 'Bravo XI',
  team1Players: setup.battingPlayers,
  team2Players: setup.bowlingPlayers,
  innings1,
  ...(innings2 ? { innings2 } : {}),
});

beforeEach(() => __resetDeriveCounter());

// ─────────────────────────────────────────────────────────────
describe('current partnership', () => {
  it('counts runs since the last wicket', () => {
    const inn = storedInnings([
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'WICKET', dismissal: 'BOWLED' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
      { type: 'RUNS', runs: 2 },
      { type: 'RUNS', runs: 1 },
    ]);
    expect(getCurrentPartnership(inn, matchShell(inn))).toEqual({ runs: 3, balls: 2 });
  });

  // The old parser had no run-out branch, so it ran straight through the
  // wicket and merged the previous partnership into the current one.
  it('stops at a run out instead of merging the previous partnership', () => {
    const inn = storedInnings([
      { type: 'RUNS', runs: 6, boundary: 6 },
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'WICKET', dismissal: 'RUN_OUT', fielderName: 'Xray', playerOutId: 0, runsCompleted: 1 },
      { type: 'NEW_BATSMAN', playerId: 2 },
      { type: 'RUNS', runs: 2 },
    ]);
    const current = getCurrentPartnership(inn, matchShell(inn));
    // Only the 2 after the run out — not 6 + 4 + 1 + 2.
    expect(current.runs).toBe(2);
    expect(current.balls).toBe(1);
  });

  it('does not count a wide as a ball faced in the partnership', () => {
    const inn = storedInnings([
      { type: 'RUNS', runs: 1 },
      { type: 'WIDE', totalRuns: 3 },
    ]);
    const current = getCurrentPartnership(inn, matchShell(inn));
    expect(current.runs).toBe(4); // 1 + 3
    expect(current.balls).toBe(1); // the wide is not a ball faced
  });

  it('reports zero for a fresh innings', () => {
    const inn = storedInnings([]);
    expect(getCurrentPartnership(inn, matchShell(inn))).toEqual({ runs: 0, balls: 0 });
  });
});

// ─────────────────────────────────────────────────────────────
describe('all partnerships', () => {
  it('lists each partnership best first with both batters named', () => {
    const inn = storedInnings([
      { type: 'RUNS', runs: 2 },
      { type: 'WICKET', dismissal: 'BOWLED' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
      { type: 'RUNS', runs: 6, boundary: 6 },
      { type: 'RUNS', runs: 4, boundary: 4 },
    ]);
    const list = getPartnerships(inn, matchShell(inn));
    expect(list).toHaveLength(2);
    expect(list[0].runs).toBe(10);
    expect(list[0].unbeaten).toBe(true);
    expect(list[0].label).toMatch(/&/);
    expect(list[1].runs).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
describe('worm graph', () => {
  it('plots the total as it stood at each over boundary', () => {
    // Over 1: six singles = 6. Over 2: two more singles = 8.
    const actions: ScoringAction[] = [
      ...Array.from({ length: 6 }, () => ({ type: 'RUNS', runs: 1 } as ScoringAction)),
      { type: 'RUNS', runs: 1 },
      { type: 'RUNS', runs: 1 },
    ];
    const inn = storedInnings(actions);
    const worm = getWormData(matchShell(inn));
    const atOver1 = worm.innings1.find((p: any) => p.over === 1);
    // The old implementation pushed its point AFTER adding the first ball of
    // the next over, so this read 7 instead of 6.
    expect(atOver1?.runs).toBe(6);
    expect(worm.innings1[worm.innings1.length - 1].runs).toBe(8);
  });

  it('includes penalty runs, which the old parser dropped', () => {
    const inn = storedInnings([
      ...Array.from({ length: 5 }, () => ({ type: 'RUNS', runs: 1 } as ScoringAction)),
      { type: 'PENALTY', runs: 5, awardedTo: 'BATTING', reason: 'Unfair Play' },
      { type: 'RUNS', runs: 1 },
    ]);
    const worm = getWormData(matchShell(inn));
    expect(worm.innings1[worm.innings1.length - 1].runs).toBe(11);
  });

  it('returns an empty series for a missing second innings', () => {
    const inn = storedInnings([{ type: 'RUNS', runs: 1 }]);
    expect(getWormData(matchShell(inn)).innings2).toEqual([]);
  });

  it('always yields at least two points so the graph can render', () => {
    const inn = storedInnings([]);
    expect(getWormData(matchShell(inn)).innings1.length).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────
describe('legacy matches with no engine fields', () => {
  const legacyInnings = {
    runs: 12,
    wickets: 1,
    overs: 1,
    balls: 0,
    strikerId: 2,
    nonStrikerId: 1,
    currentBowlerId: 20,
    batsmanStats: {},
    bowlerStats: {},
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
    ballHistory: [
      { result: '4', over: 0, ball: 0, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
      { result: '2', over: 0, ball: 1, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
      { result: '2W(RO)', over: 0, ball: 2, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20, fielderName: 'Xray' },
      { type: 'NEW_BATSMAN', newBatsmanId: 2 },
      { result: '4', over: 0, ball: 3, batsmanId: 2, nonStrikerIdBefore: 1, bowlerId: 20 },
    ] as LegacyBall[],
  };

  it('derives partnerships by converting the legacy history', () => {
    const m = matchShell(legacyInnings);
    const list = getPartnerships(legacyInnings, m);
    expect(list.length).toBeGreaterThanOrEqual(2);
    // First partnership: 4 + 2 + 2 completed on the run out = 8.
    const closed = list.find(p => !p.unbeaten);
    expect(closed?.runs).toBe(8);
  });

  it('recovers the run-out runs the old parser lost', () => {
    const worm = getWormData(matchShell(legacyInnings));
    // 4 + 2 + 2 (run out) + 4 = 12
    expect(worm.innings1[worm.innings1.length - 1].runs).toBe(12);
  });

  it('excludes NEW_BATSMAN markers from the ball-by-ball feed', () => {
    const feed = getBallByBall(legacyInnings, 20);
    expect(feed.every((b: any) => b.type !== 'NEW_BATSMAN')).toBe(true);
    expect(feed).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────
describe('win probability', () => {
  it('is null outside a chase', () => {
    const inn = storedInnings([{ type: 'RUNS', runs: 1 }]);
    expect(getWinProbability(matchShell(inn))).toBeNull();
  });

  it('reports a completed chase as won', () => {
    const inn1 = storedInnings([{ type: 'RUNS', runs: 4, boundary: 4 }]);
    const inn2 = storedInnings([{ type: 'RUNS', runs: 6, boundary: 6 }]);
    expect(getWinProbability(matchShell(inn1, inn2))).toEqual({ team1: 0, team2: 100 });
  });

  it('uses the competition all-out threshold, not a hardcoded ten', () => {
    // 8-a-side: all out at 7. Losing 7 wickets means the chase has failed.
    const eight = resolveRules({ totalOvers: 10, playersPerSide: 8 });
    expect(eight.allOutWickets).toBe(7);
    const m = {
      totalOvers: 10,
      playersPerSide: 8,
      currentInnings: 2,
      innings1: { runs: 60 },
      innings2: { runs: 20, wickets: 7, overs: 5, balls: 0 },
    };
    expect(getWinProbability(m)).toEqual({ team1: 100, team2: 0 });
  });

  it('stays within its clamped range', () => {
    const m = {
      totalOvers: 20,
      playersPerSide: 11,
      currentInnings: 2,
      innings1: { runs: 200 },
      innings2: { runs: 10, wickets: 5, overs: 10, balls: 0 },
    };
    const p = getWinProbability(m)!;
    expect(p.team2).toBeGreaterThanOrEqual(5);
    expect(p.team2).toBeLessThanOrEqual(95);
    expect(p.team1 + p.team2).toBe(100);
  });
});
