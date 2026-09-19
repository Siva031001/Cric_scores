// ─────────────────────────────────────────────────────────────
// RUN-OUT MIX-UPS — explicit end independent of "who's out"
// ─────────────────────────────────────────────────────────────
// The four scenarios below are the exact cases used to validate this fix:
// the dismissed batter's identity and the end the wicket fell at are
// independent facts (a mix-up can dismiss either batter at either end),
// so the engine must accept both directly rather than inferring the end
// from identity + runs-completed parity.
// ─────────────────────────────────────────────────────────────

import { deriveEvent, ScoringAction, __resetDeriveCounter } from '../derive';
import { reduceInnings } from '../reduce';
import { resolveRules } from '../profiles';
import { CompetitionRules, InningsSetup, MatchEvent } from '../types';

const rules: CompetitionRules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

// Siva = 0 (striker), Raja = 1 (non-striker), matching the scenarios as given.
const setup: InningsSetup = {
  strikerId: 0,
  nonStrikerId: 1,
  bowlerId: 20,
  battingPlayers: [
    { id: 0, name: 'Siva', globalPlayerId: 'G0' },
    { id: 1, name: 'Raja', globalPlayerId: 'G1' },
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

describe('run-out mix-ups: end is independent of who is out', () => {
  it('Scenario 1: Siva (striker) out at Non-Striker\'s End -> new batter at Non-Striker\'s End', () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 0, endOut: 'nonStriker', fielderName: 'F', runsCompleted: 0 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.nonStrikerId).toBe(2);
    expect(state.strikerId).toBe(1); // Raja, the survivor
  });

  it("Scenario 2: Raja (non-striker) out at Striker's End -> new batter at Striker's End", () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 1, endOut: 'striker', fielderName: 'F', runsCompleted: 0 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.strikerId).toBe(2);
    expect(state.nonStrikerId).toBe(0); // Siva, the survivor
  });

  it("Scenario 3: Siva (striker) out at Striker's End -> new batter at Striker's End", () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 0, endOut: 'striker', fielderName: 'F', runsCompleted: 0 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.strikerId).toBe(2);
    expect(state.nonStrikerId).toBe(1); // Raja, the survivor — unchanged
  });

  it("Scenario 4: Raja (non-striker) out at Non-Striker's End -> new batter at Non-Striker's End", () => {
    const { state } = play([
      { type: 'WICKET', dismissal: 'RUN_OUT', playerOutId: 1, endOut: 'nonStriker', fielderName: 'F', runsCompleted: 0 },
      { type: 'NEW_BATSMAN', playerId: 2 },
    ]);
    expect(state.nonStrikerId).toBe(2);
    expect(state.strikerId).toBe(0); // Siva, the survivor — unchanged
  });
});
