// ─────────────────────────────────────────────────────────────
// P0 SCORING CORRECTNESS
// ─────────────────────────────────────────────────────────────
// Covers the four critical fixes: 5/7+ runs, wide by total, no-ball by
// total with attribution, and retirement handling. Plus the regression that
// motivated the work — scoring 5 used to silently record nothing.
// ─────────────────────────────────────────────────────────────

import { deriveEvent, ScoringAction, __resetDeriveCounter, MAX_RUNS_PER_DELIVERY } from '../derive';
import { reduceInnings, statKey } from '../reduce';
import { resolveRules } from '../profiles';
import { CompetitionRules, EngineError, InningsSetup, MatchEvent } from '../types';

const rules: CompetitionRules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

const setup: InningsSetup = {
  strikerId: 0,
  nonStrikerId: 1,
  bowlerId: 20,
  battingPlayers: [
    { id: 0, name: 'Striker', globalPlayerId: 'G0' },
    { id: 1, name: 'NonStriker', globalPlayerId: 'G1' },
    { id: 2, name: 'Third', globalPlayerId: 'G2' },
    { id: 3, name: 'Fourth', globalPlayerId: 'G3' },
  ],
  bowlingPlayers: [
    { id: 20, name: 'Bowler', globalPlayerId: 'G20' },
    { id: 21, name: 'Bowler2', globalPlayerId: 'G21' },
  ],
};

/** Applies actions in sequence, re-reducing after each so every action sees
 *  the true current state — exactly how the screen will drive the engine. */
const play = (actions: ScoringAction[], r: CompetitionRules = rules) => {
  const events: MatchEvent[] = [];
  let state = reduceInnings(events, setup, r);
  actions.forEach((a, i) => {
    const ev = deriveEvent(a, state, r, {
      inningsKey: 'innings1',
      seq: i,
      timestamp: 1000 + i,
      makeId: p => `${p}_${i}`,
    });
    events.push(ev);
    state = reduceInnings(events, setup, r);
  });
  return { state, events };
};

beforeEach(() => __resetDeriveCounter());

// ─────────────────────────────────────────────────────────────
describe('runs off the bat', () => {
  it.each([0, 1, 2, 3, 4, 6])('scores %i correctly', runs => {
    const boundary = runs === 4 ? 4 : runs === 6 ? 6 : 0;
    const { state } = play([{ type: 'RUNS', runs, boundary } as ScoringAction]);
    expect(state.runs).toBe(runs);
    expect(state.batsmanStats[statKey(0)].runs).toBe(runs);
    expect(state.batsmanStats[statKey(0)].balls).toBe(1);
    expect(state.bowlerStats[statKey(20)].runs).toBe(runs);
    expect(state.legalBalls).toBe(1);
  });

  // The regression: the old switch had no case "5", so a 5 recorded a ball,
  // rotated strike, and added zero runs anywhere.
  it('scores 5 runs — the case the old engine dropped', () => {
    const { state } = play([{ type: 'RUNS', runs: 5 }]);
    expect(state.runs).toBe(5);
    expect(state.batsmanStats[statKey(0)].runs).toBe(5);
    expect(state.batsmanStats[statKey(0)].balls).toBe(1);
    expect(state.bowlerStats[statKey(20)].runs).toBe(5);
    // 5 is odd, so the batters have crossed.
    expect(state.strikerId).toBe(1);
    expect(state.nonStrikerId).toBe(0);
  });

  it.each([7, 8, 9, 10, 12])('scores %i runs without an artificial 6-run cap', runs => {
    const { state } = play([{ type: 'RUNS', runs }]);
    expect(state.runs).toBe(runs);
    expect(state.batsmanStats[statKey(0)].runs).toBe(runs);
  });

  it('keeps team balls and batter balls in step for every run value', () => {
    const { state } = play([
      { type: 'RUNS', runs: 5 },
      { type: 'RUNS', runs: 7 },
      { type: 'RUNS', runs: 2 },
    ]);
    const batterBalls =
      state.batsmanStats[statKey(0)].balls + state.batsmanStats[statKey(1)].balls;
    expect(batterBalls).toBe(3);
    expect(state.legalBalls).toBe(3);
    expect(state.runs).toBe(14);
  });

  it('rejects negative, fractional and absurd run values', () => {
    const s = reduceInnings([], setup, rules);
    const ctx = { inningsKey: 'innings1' as const, seq: 0, timestamp: 0 };
    expect(() => deriveEvent({ type: 'RUNS', runs: -1 }, s, rules, ctx)).toThrow(EngineError);
    expect(() => deriveEvent({ type: 'RUNS', runs: 1.5 }, s, rules, ctx)).toThrow(/whole number/);
    expect(() =>
      deriveEvent({ type: 'RUNS', runs: MAX_RUNS_PER_DELIVERY + 1 }, s, rules, ctx)
    ).toThrow(/limit for one delivery/);
  });
});

// ─────────────────────────────────────────────────────────────
describe('boundary vs running vs overthrow', () => {
  it('only credits a four when it was actually a boundary', () => {
    const run4 = play([{ type: 'RUNS', runs: 4, runType: 'RUNNING' }]).state;
    expect(run4.runs).toBe(4);
    expect(run4.batsmanStats[statKey(0)].fours).toBe(0);

    const hit4 = play([{ type: 'RUNS', runs: 4, boundary: 4 }]).state;
    expect(hit4.batsmanStats[statKey(0)].fours).toBe(1);
  });

  it('records a 5 made of a boundary plus an overthrow', () => {
    const { state, events } = play([
      { type: 'RUNS', runs: 5, overthrowRuns: 1, runType: 'OVERTHROW' },
    ]);
    expect(state.runs).toBe(5);
    expect(state.batsmanStats[statKey(0)].fours).toBe(0);
    const ball = events[0] as any;
    expect(ball.runType).toBe('OVERTHROW');
    expect(ball.overthrowRuns).toBe(1);
  });

  it('refuses a boundary value that contradicts the run total', () => {
    const s = reduceInnings([], setup, rules);
    expect(() =>
      deriveEvent({ type: 'RUNS', runs: 5, boundary: 4 }, s, rules, {
        inningsKey: 'innings1',
        seq: 0,
        timestamp: 0,
      })
    ).toThrow(/cannot be recorded on a 5-run delivery/);
  });

  it('does not rotate strike on a boundary four', () => {
    const { state } = play([{ type: 'RUNS', runs: 4, boundary: 4 }]);
    expect(state.strikerId).toBe(0);
  });

  it('rotates strike when 3 are run', () => {
    const { state } = play([{ type: 'RUNS', runs: 3 }]);
    expect(state.strikerId).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe('wide — scorer enters the total', () => {
  it.each([
    [1, 1],
    [2, 2],
    [3, 3],
    [5, 5],
    [10, 10],
  ])('a wide entered as %i adds %i to the total', (entered, expected) => {
    const { state } = play([{ type: 'WIDE', totalRuns: entered }]);
    expect(state.runs).toBe(expected);
    expect(state.extras.wides).toBe(expected);
    expect(state.bowlerStats[statKey(20)].runs).toBe(expected);
    expect(state.bowlerStats[statKey(20)].wides).toBe(1);
  });

  it('never counts a wide as a legal ball or a ball faced', () => {
    const { state } = play([
      { type: 'WIDE', totalRuns: 1 },
      { type: 'WIDE', totalRuns: 5 },
    ]);
    expect(state.legalBalls).toBe(0);
    expect(state.balls).toBe(0);
    expect(state.overs).toBe(0);
    expect(state.batsmanStats[statKey(0)].balls).toBe(0);
  });

  it('rotates strike on the runs run, not on the penalty', () => {
    // Total 2 = 1 penalty + 1 run -> odd number run -> ends swap.
    expect(play([{ type: 'WIDE', totalRuns: 2 }]).state.strikerId).toBe(1);
    // Total 3 = 1 penalty + 2 run -> even -> no swap.
    expect(play([{ type: 'WIDE', totalRuns: 3 }]).state.strikerId).toBe(0);
    // Bare wide -> nothing run -> no swap.
    expect(play([{ type: 'WIDE', totalRuns: 1 }]).state.strikerId).toBe(0);
  });

  it('rejects a wide total below the penalty', () => {
    const s = reduceInnings([], setup, rules);
    expect(() =>
      deriveEvent({ type: 'WIDE', totalRuns: 0 }, s, rules, {
        inningsKey: 'innings1',
        seq: 0,
        timestamp: 0,
      })
    ).toThrow(EngineError);
  });
});

// ─────────────────────────────────────────────────────────────
describe('no ball — scorer enters the total, then attributes it', () => {
  it.each([
    [1, 0],
    [2, 1],
    [5, 4],
    [7, 6],
  ])('a no ball entered as %i gives the batter %i', (entered, batterRuns) => {
    const { state } = play([
      { type: 'NO_BALL', totalRuns: entered, attribution: 'BATTER' },
    ]);
    expect(state.runs).toBe(entered);
    expect(state.batsmanStats[statKey(0)].runs).toBe(batterRuns);
    expect(state.extras.noBalls).toBe(1);
    // Bowler is charged the penalty plus whatever came off the bat.
    expect(state.bowlerStats[statKey(20)].runs).toBe(entered);
    expect(state.bowlerStats[statKey(20)].noBalls).toBe(1);
  });

  it('counts as a ball faced but not a legal delivery', () => {
    const { state } = play([{ type: 'NO_BALL', totalRuns: 1, attribution: 'BATTER' }]);
    expect(state.legalBalls).toBe(0);
    expect(state.balls).toBe(0);
    expect(state.batsmanStats[statKey(0)].balls).toBe(1);
  });

  it('attributes byes off a no ball away from the batter', () => {
    const { state } = play([{ type: 'NO_BALL', totalRuns: 3, attribution: 'BYE' }]);
    expect(state.runs).toBe(3);
    expect(state.batsmanStats[statKey(0)].runs).toBe(0);
    expect(state.extras.byes).toBe(2);
    expect(state.extras.noBalls).toBe(1);
    // Byes are not charged to the bowler — only the no-ball penalty is.
    expect(state.bowlerStats[statKey(20)].runs).toBe(1);
  });

  it('attributes leg byes off a no ball away from the batter', () => {
    const { state } = play([{ type: 'NO_BALL', totalRuns: 4, attribution: 'LEG_BYE' }]);
    expect(state.batsmanStats[statKey(0)].runs).toBe(0);
    expect(state.extras.legByes).toBe(3);
    expect(state.bowlerStats[statKey(20)].runs).toBe(1);
  });

  it('refuses to guess attribution', () => {
    const s = reduceInnings([], setup, rules);
    expect(() =>
      deriveEvent(
        { type: 'NO_BALL', totalRuns: 4, attribution: undefined as any },
        s,
        rules,
        { inningsKey: 'innings1', seq: 0, timestamp: 0 }
      )
    ).toThrow(/must be attributed/);
  });

  it('will not mark a bye as a boundary', () => {
    const s = reduceInnings([], setup, rules);
    expect(() =>
      deriveEvent(
        { type: 'NO_BALL', totalRuns: 5, attribution: 'BYE', boundary: 4 },
        s,
        rules,
        { inningsKey: 'innings1', seq: 0, timestamp: 0 }
      )
    ).toThrow(/off the bat/);
  });

  it('credits a six hit off a no ball', () => {
    const { state } = play([
      { type: 'NO_BALL', totalRuns: 7, attribution: 'BATTER', boundary: 6 },
    ]);
    expect(state.runs).toBe(7);
    expect(state.batsmanStats[statKey(0)].runs).toBe(6);
    expect(state.batsmanStats[statKey(0)].sixes).toBe(1);
    expect(state.strikerId).toBe(0); // boundary, no crossing
  });
});

// ─────────────────────────────────────────────────────────────
describe('free hit', () => {
  it('is set by a no ball and cleared by the next legal ball', () => {
    let { state, events } = play([{ type: 'NO_BALL', totalRuns: 1, attribution: 'BATTER' }]);
    expect(state.freeHit).toBe(true);

    const next = deriveEvent({ type: 'RUNS', runs: 1 }, state, rules, {
      inningsKey: 'innings1',
      seq: 1,
      timestamp: 2,
    });
    state = reduceInnings([...events, next], setup, rules);
    expect(state.freeHit).toBe(false);
  });

  it('survives a wide', () => {
    const { state } = play([
      { type: 'NO_BALL', totalRuns: 1, attribution: 'BATTER' },
      { type: 'WIDE', totalRuns: 1 },
    ]);
    expect(state.freeHit).toBe(true);
  });

  it('blocks a bowled dismissal but allows a run out', () => {
    const { state } = play([{ type: 'NO_BALL', totalRuns: 1, attribution: 'BATTER' }]);
    const ctx = { inningsKey: 'innings1' as const, seq: 9, timestamp: 9 };
    expect(() =>
      deriveEvent({ type: 'WICKET', dismissal: 'BOWLED' }, state, rules, ctx)
    ).toThrow(/free hit/);
    expect(() =>
      deriveEvent(
        { type: 'WICKET', dismissal: 'RUN_OUT', fielderName: 'F', playerOutId: 0 },
        state,
        rules,
        ctx
      )
    ).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────
describe('retirement', () => {
  it('retired hurt is not a wicket and the batter stays not out', () => {
    const { state } = play([
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'RETIREMENT', playerId: 0, retirementType: 'RETIRED_HURT' },
    ]);
    expect(state.wickets).toBe(0);
    const bs = state.batsmanStats[statKey(0)];
    expect(bs.isOut).toBe(false);
    expect(bs.retired).toBe('RETIRED_HURT');
    expect(bs.canReturn).toBe(true);
    // Runs are retained.
    expect(bs.runs).toBe(4);
    // Bowler gets nothing.
    expect(state.bowlerStats[statKey(20)].wickets).toBe(0);
  });

  it('lets a retired hurt batter come back and keep their score', () => {
    const { state } = play([
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'RETIREMENT', playerId: 0, retirementType: 'RETIRED_HURT' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
      { type: 'RUNS', runs: 1 },
      { type: 'RETURN_TO_BAT', playerId: 0, slot: 'striker' },
      { type: 'RUNS', runs: 2 },
    ]);
    const bs = state.batsmanStats[statKey(0)];
    expect(bs.retired).toBeNull();
    expect(bs.isOut).toBe(false);
    expect(bs.runs).toBe(6); // 4 before, 2 after
    expect(state.wickets).toBe(0);
  });

  it('retired out counts as a wicket with no bowler credit', () => {
    const { state } = play([
      { type: 'RUNS', runs: 2 },
      { type: 'RETIREMENT', playerId: 1, retirementType: 'RETIRED_OUT' },
    ]);
    expect(state.wickets).toBe(1);
    const bs = state.batsmanStats[statKey(1)];
    expect(bs.isOut).toBe(true);
    expect(bs.retired).toBe('RETIRED_OUT');
    expect(bs.dismissalType).toBe('RETIRED_OUT');
    expect(bs.canReturn).toBe(false);
    expect(state.bowlerStats[statKey(20)].wickets).toBe(0);
  });

  it('reports only retired hurt batters as returnable', () => {
    const { state } = play([
      { type: 'RETIREMENT', playerId: 0, retirementType: 'RETIRED_HURT' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
      { type: 'RETIREMENT', playerId: 1, retirementType: 'RETIRED_OUT' },
    ]);
    expect(state.retired.filter(r => r.type === 'RETIRED_HURT' && !r.returned)).toHaveLength(1);
    expect(state.wickets).toBe(1);
  });

  it('rejects retired out as a delivery', () => {
    const s = reduceInnings([], setup, rules);
    expect(() =>
      deriveEvent({ type: 'WICKET', dismissal: 'RETIRED_OUT' }, s, rules, {
        inningsKey: 'innings1',
        seq: 0,
        timestamp: 0,
      })
    ).toThrow(/must be recorded as a retirement/);
  });

  it('honours a profile that disables retired out', () => {
    const strict = resolveRules({ totalOvers: 20, overrides: { retiredOutEnabled: false } });
    const s = reduceInnings([], setup, strict);
    expect(() =>
      deriveEvent(
        { type: 'RETIREMENT', playerId: 0, retirementType: 'RETIRED_OUT' },
        s,
        strict,
        { inningsKey: 'innings1', seq: 0, timestamp: 0 }
      )
    ).toThrow(/not enabled/);
  });
});
