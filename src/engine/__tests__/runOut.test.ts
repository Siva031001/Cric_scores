// ─────────────────────────────────────────────────────────────
// RUN-OUT STRIKER / NON-STRIKER LOGIC
// ─────────────────────────────────────────────────────────────
// Verifies which crease is left vacant (and therefore which slot the
// incoming batter fills) for every combination of "who was out" and "how
// many runs were completed", including the case where the run-out also
// happens to be the last ball of the over.
// ─────────────────────────────────────────────────────────────

import { deriveEvent, ScoringAction, __resetDeriveCounter } from '../derive';
import { reduceInnings, statKey } from '../reduce';
import { resolveRules } from '../profiles';
import { CompetitionRules, InningsSetup, MatchEvent } from '../types';

const rules: CompetitionRules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

const setup: InningsSetup = {
  strikerId: 0,
  nonStrikerId: 1,
  bowlerId: 20,
  battingPlayers: [
    { id: 0, name: 'Striker', globalPlayerId: 'G0' },
    { id: 1, name: 'NonStriker', globalPlayerId: 'G1' },
    { id: 2, name: 'Third', globalPlayerId: 'G2' },
  ],
  bowlingPlayers: [{ id: 20, name: 'Bowler', globalPlayerId: 'G20' }],
};

const play = (actions: ScoringAction[]) => {
  const events: MatchEvent[] = [];
  let state = reduceInnings(events, setup, rules);
  actions.forEach((a, i) => {
    const ev = deriveEvent(a, state, rules, {
      inningsKey: 'innings1',
      seq: i,
      timestamp: 1000 + i,
      makeId: p => `${p}_${i}`,
    });
    events.push(ev);
    state = reduceInnings(events, setup, rules);
  });
  return { state, events };
};

beforeEach(() => __resetDeriveCounter());

describe('run out — vacant crease and new batsman placement', () => {
  it('non-striker run out, 0 runs completed: striker keeps strike, new batter is non-striker', () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 1, fielderName: 'F', runsCompleted: 0 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.strikerId).toBe(0);
    expect(state.nonStrikerId).toBe(2);
  });

  it('striker run out, 0 runs completed: new batter takes strike, non-striker unaffected', () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 0, fielderName: 'F', runsCompleted: 0 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.strikerId).toBe(2);
    expect(state.nonStrikerId).toBe(1);
  });

  it('striker run out, 1 run completed (crossed): survivor takes strike, new batter is non-striker', () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 0, fielderName: 'F', runsCompleted: 1 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.strikerId).toBe(1);
    expect(state.nonStrikerId).toBe(2);
  });

  it('non-striker run out, 1 run completed (crossed): new batter takes strike, survivor is non-striker', () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 1, fielderName: 'F', runsCompleted: 1 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.strikerId).toBe(2);
    expect(state.nonStrikerId).toBe(0);
  });

  it('run out on the last ball of the over: end-of-over crossing combines correctly with the run-out crossing', () => {
    const dots: ScoringAction[] = Array.from({ length: 5 }, () => ({ type: 'RUNS', runs: 0 }));
    const { state } = play([
      ...dots,
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 0, fielderName: 'F', runsCompleted: 1 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    // Striker(0) and non-striker(1) cross once for the completed run, then
    // the over-end change swaps ends again — net no change from those two
    // swaps — so the new batter inherits the outgoing striker's slot and
    // opens strike next over; the survivor is non-striker.
    expect(state.strikerId).toBe(2);
    expect(state.nonStrikerId).toBe(1);
  });
});
