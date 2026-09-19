// ─────────────────────────────────────────────────────────────
// G1 / G2 SCORING SHORTCUTS
// ─────────────────────────────────────────────────────────────
// G1 credits 1 run but keeps the same batter on strike (unlike a normal
// single, which rotates strike). G2 is a plain 2-run delivery — already
// strike-neutral under normal rules, so it needs no special handling.
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
    state = reduceInnings(events, rules ? setup : setup, rules);
  });
  return { state, events };
};

beforeEach(() => __resetDeriveCounter());

describe('G1 — 1 run, striker unchanged', () => {
  it('credits 1 run and keeps the same batter on strike', () => {
    const { state } = play([{ type: 'RUNS', runs: 1, keepStrike: true }]);
    expect(state.runs).toBe(1);
    expect(state.batsmanStats[statKey(0)].runs).toBe(1);
    expect(state.strikerId).toBe(0);
    expect(state.nonStrikerId).toBe(1);
  });

  it('a normal single (no keepStrike) still rotates strike, for contrast', () => {
    const { state } = play([{ type: 'RUNS', runs: 1 }]);
    expect(state.strikerId).toBe(1);
    expect(state.nonStrikerId).toBe(0);
  });
});

describe('G2 — 2 runs, normal rules apply', () => {
  it('credits 2 runs and strike stays put, same as any 2-run delivery', () => {
    const { state } = play([{ type: 'RUNS', runs: 2 }]);
    expect(state.runs).toBe(2);
    expect(state.batsmanStats[statKey(0)].runs).toBe(2);
    expect(state.strikerId).toBe(0);
    expect(state.nonStrikerId).toBe(1);
  });
});
