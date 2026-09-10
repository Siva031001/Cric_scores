// ─────────────────────────────────────────────────────────────
// ADVANCED SCORING: short runs, overthrows, penalties,
// undo, historical editing, and legacy migration
// ─────────────────────────────────────────────────────────────

import { deriveEvent, ScoringAction, __resetDeriveCounter } from '../derive';
import { reduceInnings, reduceInningsVerbose, statKey } from '../reduce';
import { resolveRules } from '../profiles';
import {
  appendEvent,
  undoLast,
  editEvent,
  deleteEvent,
  listDeliveries,
  auditTrail,
  wasEdited,
} from '../history';
import { fromLegacyHistory, toLegacyResult } from '../legacy';
import { CompetitionRules, EngineError, InningsSetup, MatchEvent, LegacyBall } from '../types';

const rules: CompetitionRules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

const setup: InningsSetup = {
  strikerId: 0,
  nonStrikerId: 1,
  bowlerId: 20,
  battingPlayers: [
    { id: 0, name: 'A', globalPlayerId: 'GA' },
    { id: 1, name: 'B', globalPlayerId: 'GB' },
    { id: 2, name: 'C', globalPlayerId: 'GC' },
    { id: 3, name: 'D', globalPlayerId: 'GD' },
  ],
  bowlingPlayers: [
    { id: 20, name: 'X', globalPlayerId: 'GX' },
    { id: 21, name: 'Y', globalPlayerId: 'GY' },
  ],
};

const play = (actions: ScoringAction[], r: CompetitionRules = rules) => {
  let events: MatchEvent[] = [];
  let state = reduceInnings(events, setup, r);
  actions.forEach((a, i) => {
    const ev = deriveEvent(a, state, r, {
      inningsKey: 'innings1',
      seq: i,
      timestamp: 1000 + i,
      makeId: p => `${p}_${i}`,
    });
    events = appendEvent(events, ev);
    state = reduceInnings(events, setup, r);
  });
  return { state, events };
};

const refold = (events: MatchEvent[], r: CompetitionRules = rules) =>
  reduceInnings(events, setup, r);

beforeEach(() => __resetDeriveCounter());

// ─────────────────────────────────────────────────────────────
describe('short runs', () => {
  it('credits attempted minus short', () => {
    const { state, events } = play([
      { type: 'RUNS', runs: 0, attemptedRuns: 2, shortRuns: 1 },
    ]);
    expect(state.runs).toBe(1);
    expect(state.batsmanStats[statKey(0)].runs).toBe(1);
    const ball = events[0] as any;
    expect(ball.attemptedRuns).toBe(2);
    expect(ball.shortRuns).toBe(1);
    expect(ball.batterRuns).toBe(1);
  });

  it('rotates strike on the credited runs, not the attempted runs', () => {
    // 2 attempted, 1 short -> 1 credited -> odd -> ends swap.
    expect(play([{ type: 'RUNS', runs: 0, attemptedRuns: 2, shortRuns: 1 }]).state.strikerId).toBe(1);
    // 3 attempted, 1 short -> 2 credited -> even -> no swap.
    expect(play([{ type: 'RUNS', runs: 0, attemptedRuns: 3, shortRuns: 1 }]).state.strikerId).toBe(0);
  });

  it('does not fabricate a wicket or an extra ball', () => {
    const { state } = play([{ type: 'RUNS', runs: 0, attemptedRuns: 2, shortRuns: 1 }]);
    expect(state.wickets).toBe(0);
    expect(state.legalBalls).toBe(1);
    expect(state.batsmanStats[statKey(0)].balls).toBe(1);
  });

  it('rejects more short runs than were attempted', () => {
    const s = refold([]);
    expect(() =>
      deriveEvent({ type: 'RUNS', runs: 0, attemptedRuns: 2, shortRuns: 3 }, s, rules, {
        inningsKey: 'innings1',
        seq: 0,
        timestamp: 0,
      })
    ).toThrow(/cannot exceed attempted/);
  });

  it('honours a profile that disables short runs', () => {
    const noShort = resolveRules({ totalOvers: 20, overrides: { shortRunEnabled: false } });
    const s = reduceInnings([], setup, noShort);
    expect(() =>
      deriveEvent({ type: 'RUNS', runs: 0, attemptedRuns: 2, shortRuns: 1 }, s, noShort, {
        inningsKey: 'innings1',
        seq: 0,
        timestamp: 0,
      })
    ).toThrow(/disabled/);
  });
});

// ─────────────────────────────────────────────────────────────
describe('penalty runs', () => {
  it('adds to the batting side and is not charged to the bowler', () => {
    const { state } = play([
      { type: 'PENALTY', runs: 5, awardedTo: 'BATTING', reason: 'Unfair Play' },
    ]);
    expect(state.runs).toBe(5);
    expect(state.extras.penalty).toBe(5);
    expect(state.bowlerStats[statKey(20)].runs).toBe(0);
    // Not a delivery: no ball consumed.
    expect(state.legalBalls).toBe(0);
    expect(state.balls).toBe(0);
  });

  it('tracks a penalty awarded against the batting side separately', () => {
    const { state } = play([
      { type: 'PENALTY', runs: 5, awardedTo: 'FIELDING', reason: 'Short Run' },
    ]);
    // Runs go to the opposition, so this innings total is unchanged.
    expect(state.runs).toBe(0);
    expect(state.penaltyRunsAgainst).toBe(5);
  });

  it('records the reason and requires one', () => {
    const s = refold([]);
    expect(() =>
      deriveEvent(
        { type: 'PENALTY', runs: 5, awardedTo: 'BATTING', reason: '' },
        s,
        rules,
        { inningsKey: 'innings1', seq: 0, timestamp: 0 }
      )
    ).toThrow(/reason/);
  });

  it('exposes a configurable reason list rather than a fixed one', () => {
    expect(rules.penaltyReasons).toContain('Unfair Play');
    const custom = resolveRules({
      totalOvers: 20,
      overrides: { penaltyReasons: ['League Rule 7'] },
    });
    expect(custom.penaltyReasons).toEqual(['League Rule 7']);
  });
});

// ─────────────────────────────────────────────────────────────
describe('undo', () => {
  it('restores the score after 5 runs', () => {
    const { events } = play([{ type: 'RUNS', runs: 5 }]);
    const { events: after } = undoLast(events);
    const state = refold(after);
    expect(state.runs).toBe(0);
    expect(state.batsmanStats[statKey(0)].runs).toBe(0);
    expect(state.strikerId).toBe(0);
  });

  it('leaves the legal ball count untouched after undoing a wide', () => {
    const { events } = play([
      { type: 'RUNS', runs: 1 },
      { type: 'WIDE', totalRuns: 5 },
    ]);
    const before = refold(events);
    expect(before.legalBalls).toBe(1);
    expect(before.runs).toBe(6);

    const state = refold(undoLast(events).events);
    expect(state.legalBalls).toBe(1);
    expect(state.runs).toBe(1);
    expect(state.extras.wides).toBe(0);
    expect(state.bowlerStats[statKey(20)].wides).toBe(0);
    expect(state.bowlerStats[statKey(20)].runs).toBe(1);
  });

  it('restores the free hit state after undoing a no ball', () => {
    const { events } = play([
      { type: 'NO_BALL', totalRuns: 7, attribution: 'BATTER', boundary: 6 },
    ]);
    expect(refold(events).freeHit).toBe(true);
    const state = refold(undoLast(events).events);
    expect(state.freeHit).toBe(false);
    expect(state.runs).toBe(0);
    expect(state.batsmanStats[statKey(0)].sixes).toBe(0);
  });

  it('reverses both the incoming batter and the wicket in one step', () => {
    const { events } = play([
      { type: 'RUNS', runs: 1 },
      { type: 'WICKET', dismissal: 'BOWLED' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
    ]);
    const before = refold(events);
    expect(before.wickets).toBe(1);
    expect(before.strikerId).toBe(2);

    const { events: after, removed } = undoLast(events);
    // Both the NEW_BATSMAN marker and the wicket delivery come off.
    expect(removed).toHaveLength(2);

    const state = refold(after);
    expect(state.wickets).toBe(0);
    // The dismissed batter is back at the crease, not out.
    expect(state.batsmanStats[statKey(1)].isOut).toBe(false);
    expect(state.strikerId).not.toBe(2);
    expect(state.bowlerStats[statKey(20)].wickets).toBe(0);
  });

  it('is safe on an empty innings', () => {
    const { events } = undoLast([]);
    expect(events).toEqual([]);
    expect(refold(events).runs).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe('historical ball editing', () => {
  const twentyBalls = (): ScoringAction[] =>
    Array.from({ length: 20 }, (_, i) => ({ type: 'RUNS', runs: i % 3 } as ScoringAction));

  it('recalculates the entire innings, not just the edited ball', () => {
    const { events, state: before } = play(twentyBalls());
    // i % 3 over i=0..19 -> six full 0+1+2 cycles (18) + 0 + 1 = 19
    expect(before.runs).toBe(19);

    // Ball at position 7 was 1 run (7 % 3); correct it to a six.
    const target = events[7];
    const stateBeforeTarget = refold(events.slice(0, 7));
    const replacement = deriveEvent(
      { type: 'RUNS', runs: 6, boundary: 6 },
      stateBeforeTarget,
      rules,
      { inningsKey: 'innings1', seq: 7, timestamp: 5000 }
    );
    const edited = editEvent(events, 7, replacement, {
      editedBy: 'scorer-1',
      reason: 'Missed a six',
    });

    const after = refold(edited);
    // Old value at that position was 1, new is 6 -> +5.
    expect(after.runs).toBe(24);
    expect(after.batsmanStats[statKey(0)].sixes + after.batsmanStats[statKey(1)].sixes).toBe(1);
    // Bowler figures recomputed too.
    expect(after.bowlerStats[statKey(20)].runs).toBe(24);
    // Ball count unchanged — an edit does not add or remove a delivery.
    expect(after.legalBalls).toBe(before.legalBalls);
    expect(target.seq).toBe(7);
  });

  it('keeps an audit trail of what changed', () => {
    const { events } = play([{ type: 'RUNS', runs: 1 }, { type: 'RUNS', runs: 2 }]);
    const s0 = refold(events.slice(0, 1));
    const replacement = deriveEvent({ type: 'RUNS', runs: 4, boundary: 4 }, s0, rules, {
      inningsKey: 'innings1',
      seq: 1,
      timestamp: 9999,
    });
    const edited = editEvent(events, 1, replacement, {
      editedBy: 'scorer-9',
      editedAt: 123456,
      reason: 'Signalled four',
    });

    expect(wasEdited(edited, 1)).toBe(true);
    const trail = auditTrail(edited);
    expect(trail).toHaveLength(1);
    expect(trail[0].editedBy).toBe('scorer-9');
    expect(trail[0].reason).toBe('Signalled four');
    expect((trail[0].before as any).batterRuns).toBe(2);
    expect((trail[0].after as any).batterRuns).toBe(4);
  });

  it('recalculates wickets when a wicket is edited away', () => {
    const { events } = play([
      { type: 'RUNS', runs: 1 },
      { type: 'WICKET', dismissal: 'BOWLED' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
      { type: 'RUNS', runs: 2 },
    ]);
    expect(refold(events).wickets).toBe(1);

    const s = refold(events.slice(0, 1));
    const replacement = deriveEvent({ type: 'RUNS', runs: 3 }, s, rules, {
      inningsKey: 'innings1',
      seq: 1,
      timestamp: 1,
    });
    const edited = editEvent(events, 1, replacement);
    const after = refold(edited);
    expect(after.wickets).toBe(0);
    expect(after.bowlerStats[statKey(20)].wickets).toBe(0);
  });

  it('deletes a delivery that never happened and closes the gap', () => {
    const { events } = play([
      { type: 'RUNS', runs: 1 },
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'RUNS', runs: 2 },
    ]);
    expect(refold(events).legalBalls).toBe(3);

    const pruned = deleteEvent(events, 1);
    const after = refold(pruned);
    expect(after.legalBalls).toBe(2);
    expect(after.runs).toBe(3);
    expect(pruned.map(e => e.seq)).toEqual([0, 1]);
  });

  it('flags when an edit changes who was on strike downstream', () => {
    // Two singles: strike swaps each ball.
    const { events } = play([{ type: 'RUNS', runs: 1 }, { type: 'RUNS', runs: 1 }]);
    const s0 = refold(events.slice(0, 0));
    // Change the first ball to 2 runs, so no swap occurs and the recorded
    // striker on ball 2 is now inconsistent with the replay.
    const replacement = deriveEvent({ type: 'RUNS', runs: 2 }, s0, rules, {
      inningsKey: 'innings1',
      seq: 0,
      timestamp: 1,
    });
    const edited = editEvent(events, 0, replacement);
    const { warnings } = reduceInningsVerbose(edited, setup, rules);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].message).toMatch(/differs from replayed striker/);
  });

  it('lists deliveries with scorer-facing over.ball labels', () => {
    const { events } = play([
      { type: 'RUNS', runs: 1 },
      { type: 'WIDE', totalRuns: 2 },
      { type: 'WICKET', dismissal: 'BOWLED' },
    ]);
    const list = listDeliveries(events);
    expect(list).toHaveLength(3);
    expect(list[0].label).toBe('0.1');
    expect(list[1].description).toMatch(/Wide/);
    expect(list[2].description).toMatch(/bowled/);
  });

  it('refuses to edit a position that does not exist', () => {
    const { events } = play([{ type: 'RUNS', runs: 1 }]);
    expect(() => editEvent(events, 99, events[0])).toThrow(EngineError);
    expect(() => deleteEvent(events, 99)).toThrow(/No event at position/);
  });
});

// ─────────────────────────────────────────────────────────────
describe('over and maiden accounting', () => {
  it('completes an over after six legal balls and swaps ends', () => {
    const { state } = play(Array.from({ length: 6 }, () => ({ type: 'RUNS', runs: 0 } as ScoringAction)));
    expect(state.overs).toBe(1);
    expect(state.balls).toBe(0);
    // Six dots: no crossings, so only the end-of-over swap applies.
    expect(state.strikerId).toBe(1);
    expect(state.awaitingBowler).toBe(true);
  });

  it('does not let wides or no balls complete an over', () => {
    const actions: ScoringAction[] = [
      ...Array.from({ length: 5 }, () => ({ type: 'RUNS', runs: 0 } as ScoringAction)),
      { type: 'WIDE', totalRuns: 1 },
      { type: 'NO_BALL', totalRuns: 1, attribution: 'BATTER' },
    ];
    const { state } = play(actions);
    expect(state.overs).toBe(0);
    expect(state.balls).toBe(5);
    expect(state.legalBalls).toBe(5);
  });

  it('credits a maiden for a wicketless scoreless over', () => {
    const { state } = play(Array.from({ length: 6 }, () => ({ type: 'RUNS', runs: 0 } as ScoringAction)));
    expect(state.bowlerStats[statKey(20)].maidens).toBe(1);
  });

  it('does not credit a maiden when the bowler concedes a run', () => {
    const actions: ScoringAction[] = [
      ...Array.from({ length: 5 }, () => ({ type: 'RUNS', runs: 0 } as ScoringAction)),
      { type: 'RUNS', runs: 1 },
    ];
    expect(play(actions).state.bowlerStats[statKey(20)].maidens).toBe(0);
  });

  it('still credits a maiden when only byes were conceded', () => {
    // Byes are not charged to the bowler, so they do not break a maiden.
    const actions: ScoringAction[] = [
      ...Array.from({ length: 5 }, () => ({ type: 'RUNS', runs: 0 } as ScoringAction)),
      { type: 'BYE', runs: 2 },
    ];
    const { state } = play(actions);
    expect(state.bowlerStats[statKey(20)].maidens).toBe(1);
    expect(state.bowlerStats[statKey(20)].runs).toBe(0);
    expect(state.runs).toBe(2);
  });

  it('derives bowler overs from their own legal balls', () => {
    const actions: ScoringAction[] = Array.from({ length: 6 }, () => ({ type: 'RUNS', runs: 1 } as ScoringAction));
    const { state } = play(actions);
    expect(state.bowlerStats[statKey(20)].overs).toBe(1);
    expect(state.bowlerStats[statKey(20)].balls).toBe(0);
    expect(state.bowlerStats[statKey(20)].runs).toBe(6);
  });
});

// ─────────────────────────────────────────────────────────────
describe('partnerships', () => {
  it('closes a partnership on a wicket and opens the next', () => {
    const { state } = play([
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'RUNS', runs: 2 },
      { type: 'WICKET', dismissal: 'BOWLED' },
      { type: 'NEW_BATSMAN', playerId: 2, slot: 'striker' },
      { type: 'RUNS', runs: 3 },
    ]);
    expect(state.partnerships).toHaveLength(2);
    expect(state.partnerships[0].runs).toBe(6);
    expect(state.partnerships[0].unbeaten).toBe(false);
    expect(state.partnerships[1].runs).toBe(3);
    expect(state.partnerships[1].unbeaten).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────
describe('legacy migration', () => {
  const legacy: LegacyBall[] = [
    { result: '1', over: 0, ball: 0, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
    { result: 'WD2', over: 0, ball: 1, batsmanId: 1, nonStrikerIdBefore: 0, bowlerId: 20 },
    { result: 'NB4', over: 0, ball: 1, batsmanId: 1, nonStrikerIdBefore: 0, bowlerId: 20 },
    { result: '4', over: 0, ball: 1, batsmanId: 1, nonStrikerIdBefore: 0, bowlerId: 20 },
    { result: 'B1', over: 0, ball: 2, batsmanId: 1, nonStrikerIdBefore: 0, bowlerId: 20 },
    { result: 'LB2', over: 0, ball: 3, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
    { result: 'PEN5', over: 0, ball: 4, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
    { result: 'W', over: 0, ball: 4, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
    { type: 'NEW_BATSMAN', newBatsmanId: 2 },
  ];

  it('converts every legacy token into a structured event', () => {
    const events = fromLegacyHistory(legacy, { inningsKey: 'innings1' });
    expect(events).toHaveLength(9);
    expect(events.filter(e => e.kind === 'BALL')).toHaveLength(7);
    expect(events.filter(e => e.kind === 'PENALTY')).toHaveLength(1);
    expect(events.filter(e => e.kind === 'NEW_BATSMAN')).toHaveLength(1);
  });

  it('reproduces the totals a legacy match displayed', () => {
    const events = fromLegacyHistory(legacy, { inningsKey: 'innings1' });
    const state = refold(events);
    // 1 + 3(WD2) + 5(NB4) + 4 + 1(bye) + 2(legbye) + 5(pen) + 0(W) = 21
    expect(state.runs).toBe(21);
    expect(state.extras.wides).toBe(3);
    expect(state.extras.noBalls).toBe(1);
    expect(state.extras.byes).toBe(1);
    expect(state.extras.legByes).toBe(2);
    expect(state.extras.penalty).toBe(5);
    expect(state.wickets).toBe(1);
    // Legal balls: 1, 4, B1, LB2, W = 5. Wide, no-ball and penalty excluded.
    expect(state.legalBalls).toBe(5);
  });

  it('recovers the dismissal type from stored batsman stats', () => {
    const events = fromLegacyHistory(legacy, {
      inningsKey: 'innings1',
      dismissalByPlayerId: { 0: 'LBW' },
    });
    const wicket = events.find(e => e.kind === 'BALL' && (e as any).wicket) as any;
    expect(wicket.wicket.type).toBe('LBW');
  });

  it('marks a wicket UNKNOWN rather than guessing when nothing was stored', () => {
    const events = fromLegacyHistory(legacy, { inningsKey: 'innings1' });
    const wicket = events.find(e => e.kind === 'BALL' && (e as any).wicket) as any;
    expect(wicket.wicket.type).toBe('UNKNOWN');
  });

  it('converts a legacy run-out and keeps its completed runs', () => {
    const ro: LegacyBall[] = [
      { result: '2W(RO)', over: 0, ball: 0, batsmanId: 1, nonStrikerIdBefore: 0, bowlerId: 20, fielderName: 'X' },
    ];
    const events = fromLegacyHistory(ro, { inningsKey: 'innings1' });
    const state = refold(events);
    // The old engine lost these runs entirely because "2W(RO)" matched no branch.
    expect(state.runs).toBe(2);
    expect(state.wickets).toBe(1);
    const w = (events[0] as any).wicket;
    expect(w.type).toBe('RUN_OUT');
    expect(w.creditBowler).toBe(false);
    expect(state.bowlerStats[statKey(20)].wickets).toBe(0);
  });

  it('round-trips a delivery back to a legacy token', () => {
    const { events } = play([
      { type: 'RUNS', runs: 4, boundary: 4 },
      { type: 'WIDE', totalRuns: 3 },
      { type: 'NO_BALL', totalRuns: 5, attribution: 'BATTER', boundary: 4 },
      { type: 'BYE', runs: 2 },
      { type: 'LEG_BYE', runs: 1 },
    ]);
    const tokens = events.map(e => toLegacyResult(e as any));
    expect(tokens).toEqual(['4', 'WD2', 'NB4', 'B2', 'LB1']);
  });

  it('regenerates a legacy ballHistory alongside the events', () => {
    const { state } = play([{ type: 'RUNS', runs: 1 }, { type: 'WIDE', totalRuns: 2 }]);
    expect(state.ballHistory).toHaveLength(2);
    expect(state.ballHistory[0].result).toBe('1');
    expect(state.ballHistory[1].result).toBe('WD1');
    expect(state.ballHistory[0].bowlerId).toBe(20);
  });
});
