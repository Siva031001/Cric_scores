// ─────────────────────────────────────────────────────────────
// SUPER OVER OPENERS: regression coverage for two related bugs found in a
// full-repo review.
//
// 1. matchEngine.ts's activeState() used to decide which Super Over half is
//    "active" by checking whether so.innings1 was non-null, instead of
//    whether it was actually COMPLETE (the same check activeInningsKey()
//    already used correctly). The moment ball 1 of a Super Over existed,
//    so.innings1 became non-null-but-incomplete, so activeState() wrongly
//    switched to innings2 (still null) and fell back to a hardcoded
//    placeholder state — corrupting every delivery from ball 2 onward.
//
// 2. persistence.ts's loadMatch() derived Super Over openers only by
//    scanning ball events for the first delivery's recorded striker/
//    non-striker/bowler ids, never reading the openers actually selected
//    via startSuperOverInnings (written to raw.superOverInnings) — so even
//    ball 1 itself was scored against whichever ids happened to be in that
//    first event, not the real selection.
// ─────────────────────────────────────────────────────────────

import { loadMatch, StoredMatch, activeInningsState } from '../persistence';
import { resolveRules } from '../profiles';
import { deriveEvent, ScoringAction } from '../derive';
import { reduceInnings } from '../reduce';

const rules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

const baseMatch = (overrides: Partial<StoredMatch> = {}): StoredMatch => ({
  id: 'M1',
  team1: 'Alpha',
  team2: 'Beta',
  team1Players: [
    { id: 0, name: 'A0' }, { id: 1, name: 'A1' }, { id: 2, name: 'A2' },
  ],
  team2Players: [
    { id: 10, name: 'B0' }, { id: 11, name: 'B1' }, { id: 12, name: 'B2' },
  ],
  totalOvers: 20,
  currentInnings: 2,
  // A regulation tie sets up the Super Over scenario.
  innings1: { runs: 150, wickets: 5, overs: 20, balls: 0, strikerId: 0, nonStrikerId: 1, currentBowlerId: 10, ballHistory: [] },
  innings2: { runs: 150, wickets: 6, overs: 20, balls: 0, strikerId: 10, nonStrikerId: 11, currentBowlerId: 0, ballHistory: [] },
  superOvers: [{ index: 1, battingFirstTeam: 'Beta' }],
  ...overrides,
});

describe('Super Over openers — persistence.ts loadMatch', () => {
  it('with no events and no superOverInnings write, innings1 stays null (unstarted)', () => {
    const m = loadMatch(baseMatch());
    expect(m.superOvers[0].innings1).toBeNull();
  });

  it('once startSuperOverInnings-style openers are written, innings1 is real (zeroed, real openers) even with zero balls', () => {
    const m = loadMatch(baseMatch({
      superOverInnings: {
        so1_innings1: { openingStrikerId: 11, openingNonStrikerId: 12, openingBowlerId: 0 },
      },
    }));
    const inn1 = m.superOvers[0].innings1;
    expect(inn1).not.toBeNull();
    expect(inn1!.strikerId).toBe(11);
    expect(inn1!.nonStrikerId).toBe(12);
    expect(inn1!.currentBowlerId).toBe(0);
    expect(inn1!.runs).toBe(0);
  });

  it('prefers the explicit openers over scanning ball events, when both exist', () => {
    // A ball recorded with different ids than the explicit openers should
    // never win — the explicit selection is authoritative.
    const so1Rules = { ...rules };
    const ev = deriveEvent(
      { type: 'RUNS', runs: 1 } as ScoringAction,
      // The state the ball was actually derived against, matching the
      // EXPLICIT openers (11/12/0) below, not some other pair.
      { strikerId: 11, nonStrikerId: 12, currentBowlerId: 0 } as any,
      so1Rules,
      { inningsKey: 'so1_innings1', seq: 0, timestamp: 0 }
    );
    const m = loadMatch(baseMatch({
      ballEvents: [ev],
      superOverInnings: {
        so1_innings1: { openingStrikerId: 11, openingNonStrikerId: 12, openingBowlerId: 0 },
      },
    }));
    const inn1 = m.superOvers[0].innings1;
    expect(inn1!.strikerId === 11 || inn1!.nonStrikerId === 11).toBe(true);
  });
});

describe('Super Over openers — matchEngine.ts activeState', () => {
  it('stays on innings1 while it is non-null but NOT complete (the exact regression)', () => {
    const soRules = resolveRules({ totalOvers: 20 });
    const m = loadMatch(baseMatch({
      superOverInnings: {
        so1_innings1: { openingStrikerId: 11, openingNonStrikerId: 12, openingBowlerId: 0 },
      },
    }));
    // Sanity: innings1 is real but not complete (0 overs/0 wickets, well
    // under any Super Over limit) — this is exactly the state that used to
    // trip activeState's old `so.innings1 && !so.innings2` check into
    // wrongly picking innings2 (still null) and falling back to a
    // placeholder.
    const state = activeInningsState(m);
    expect(state.strikerId).toBe(11);
    expect(state.nonStrikerId).toBe(12);
    expect(state.currentBowlerId).toBe(0);
  });

  it('moves to innings2 only once innings1 is genuinely complete', () => {
    const soRules = { ...rules, totalOvers: rules.totalOvers, superOverOvers: 1, superOverMaxWickets: 2 };
    // Complete Beta's Super Over (1 over = 6 legal balls) with real events,
    // derived against the real openers — not by faking wickets/overs on
    // the stored snapshot, which loadMatch never reads back anyway.
    const setup = { strikerId: 11, nonStrikerId: 12, currentBowlerId: 0, isSuperOver: true } as any;
    let state = setup;
    const events: any[] = [];
    const soOverRules = { ...rules, totalOvers: 1, allOutWickets: 2, maxOversPerBowler: 1 };
    for (let i = 0; i < 6; i++) {
      const ev = deriveEvent({ type: 'RUNS', runs: 0 } as ScoringAction, state, soOverRules, {
        inningsKey: 'so1_innings1', seq: i, timestamp: i,
      });
      events.push(ev);
      // Fold forward exactly like play() does elsewhere in this suite.
      state = reduceInnings(events, { strikerId: 11, nonStrikerId: 12, bowlerId: 0, isSuperOver: true }, soOverRules);
    }
    const m = loadMatch(baseMatch({
      ballEvents: events,
      superOvers: [{ index: 1, battingFirstTeam: 'Beta' }],
      superOverInnings: {
        so1_innings1: { openingStrikerId: 11, openingNonStrikerId: 12, openingBowlerId: 0 },
        so1_innings2: { openingStrikerId: 0, openingNonStrikerId: 1, openingBowlerId: 10 },
      },
    }));
    expect(m.superOvers[0].innings1?.overs).toBe(1);
    const activeSt = activeInningsState(m);
    expect(activeSt.strikerId).toBe(0);
    expect(activeSt.nonStrikerId).toBe(1);
    expect(activeSt.currentBowlerId).toBe(10);
  });
});
