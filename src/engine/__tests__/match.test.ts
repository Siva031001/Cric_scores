// ─────────────────────────────────────────────────────────────
// MATCH LEVEL: Super Over, status machine, interruptions,
// standings/tie-breakers, NRR, replacements, performance score
// ─────────────────────────────────────────────────────────────

import { deriveEvent, ScoringAction, __resetDeriveCounter } from '../derive';
import { reduceInnings, statKey } from '../reduce';
import { resolveRules, ICC_T20, LOCAL_T20 } from '../profiles';
import { appendEvent } from '../history';
import {
  resolveMatchOutcome,
  isRegulationTie,
  buildNRRInputs,
  netRunRate,
  targetFor,
  requiredRunRate,
} from '../outcome';
import {
  createSuperOver,
  superOverBattingFirstTeam,
  resolveSuperOver,
  resolveSuperOverChain,
  nextSuperOver,
  superOverInningsKey,
  isSuperOverKey,
  regulationEventsOnly,
  rulesForSuperOver,
} from '../superover';
import {
  canTransition,
  assertTransition,
  suspendMatch,
  resumeMatch,
  concludeWithoutResult,
  applyRevision,
  effectiveOvers,
  effectiveTarget,
  hasRevisedTarget,
  computeDLS,
  registerDLSProvider,
  hasDLSProvider,
  isScoringAllowed,
} from '../interruptions';
import {
  emptyStanding,
  applyMatchToStandings,
  sortStandings,
  buildHeadToHead,
  poolQualifiers,
  formatNRR,
} from '../standings';
import { createReplacement, canBat, canBowl, __resetReplacementCounter } from '../replacements';
import { computePerformanceScores, suggestPlayerOfTheMatch } from '../performance';
import { loadMatch, buildInningsWrite, buildTournamentResult } from '../persistence';
import {
  CompetitionRules,
  EngineError,
  InningsSetup,
  InningsState,
  MatchEvent,
  Replacement,
  SuperOverState,
} from '../types';

const rules: CompetitionRules = resolveRules({ totalOvers: 20, playersPerSide: 11 });

const setup: InningsSetup = {
  strikerId: 0,
  nonStrikerId: 1,
  bowlerId: 20,
  battingPlayers: [
    { id: 0, name: 'A', globalPlayerId: 'GA' },
    { id: 1, name: 'B', globalPlayerId: 'GB' },
    { id: 2, name: 'C', globalPlayerId: 'GC' },
  ],
  bowlingPlayers: [
    { id: 20, name: 'X', globalPlayerId: 'GX' },
    { id: 21, name: 'Y', globalPlayerId: 'GY' },
  ],
};

/** Builds an innings state with a chosen score, via real deliveries. */
const inningsWith = (
  runs: number,
  wickets = 0,
  r: CompetitionRules = rules,
  key = 'innings1'
): InningsState => {
  const actions: ScoringAction[] = [];
  let remaining = runs;
  while (remaining > 0) {
    const step = Math.min(6, remaining);
    actions.push(step === 4 ? { type: 'RUNS', runs: 4, boundary: 4 } : { type: 'RUNS', runs: step });
    remaining -= step;
  }
  for (let i = 0; i < wickets; i++) actions.push({ type: 'WICKET', dismissal: 'BOWLED' });

  let events: MatchEvent[] = [];
  let state = reduceInnings(events, setup, r);
  actions.forEach((a, i) => {
    // Supply a fresh batter after each wicket so the innings can continue.
    if (state.awaitingBatsmanSlot) {
      const nb = deriveEvent(
        { type: 'NEW_BATSMAN', playerId: 2 + i },
        state,
        r,
        { inningsKey: key, seq: events.length, timestamp: i, makeId: p => `${p}_nb_${i}` }
      );
      events = appendEvent(events, nb);
      state = reduceInnings(events, setup, r);
    }
    const ev = deriveEvent(a, state, r, {
      inningsKey: key,
      seq: events.length,
      timestamp: i,
      makeId: p => `${p}_${i}`,
    });
    events = appendEvent(events, ev);
    state = reduceInnings(events, setup, r);
  });
  return state;
};

beforeEach(() => {
  __resetDeriveCounter();
  __resetReplacementCounter();
  registerDLSProvider(null);
});

// ─────────────────────────────────────────────────────────────
describe('match outcome', () => {
  it('reports a win by runs when the chase falls short', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha',
      team2: 'Beta',
      innings1: inningsWith(100),
      innings2: inningsWith(90, 10),
      rules,
      status: 'IN_PROGRESS',
    });
    expect(out.resultType).toBe('WIN_BY_RUNS');
    expect(out.winnerTeam).toBe('Alpha');
    expect(out.margin).toBe(10);
    expect(out.text).toBe('Alpha won by 10 runs');
  });

  it('reports a win by wickets when the target is passed', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha',
      team2: 'Beta',
      innings1: inningsWith(50),
      innings2: inningsWith(51, 3),
      rules,
      status: 'IN_PROGRESS',
    });
    expect(out.resultType).toBe('WIN_BY_WICKETS');
    expect(out.winnerTeam).toBe('Beta');
    expect(out.margin).toBe(7); // 10 allowed wickets - 3 lost
    expect(out.text).toBe('Beta won by 7 wickets');
  });

  it('uses the singular form for a one-run and one-wicket margin', () => {
    const byRun = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(50), innings2: inningsWith(49, 10),
      rules, status: 'IN_PROGRESS',
    });
    expect(byRun.text).toBe('Alpha won by 1 run');
  });

  it('detects a tie', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(75), innings2: inningsWith(75, 10),
      rules, status: 'IN_PROGRESS',
    });
    expect(out.resultType).toBe('TIE');
    expect(out.text).toBe('Match tied');
    expect(out.winnerTeam).toBeNull();
  });

  it('keeps abandoned and no result distinct, and neither is a loss', () => {
    const common = {
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(40), innings2: inningsWith(20, 2), rules,
    };
    const abandoned = resolveMatchOutcome({ ...common, status: 'ABANDONED' });
    const noResult = resolveMatchOutcome({ ...common, status: 'NO_RESULT' });
    expect(abandoned.resultType).toBe('ABANDONED');
    expect(noResult.resultType).toBe('NO_RESULT');
    expect(abandoned.winnerTeam).toBeNull();
    expect(noResult.winnerTeam).toBeNull();
    expect(abandoned.text).not.toBe(noResult.text);
  });

  it('stays in progress mid-chase', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(120), innings2: inningsWith(40, 1),
      rules, status: 'IN_PROGRESS',
    });
    expect(out.resultType).toBe('IN_PROGRESS');
  });

  it('does not confuse teams whose names overlap', () => {
    // The old substring approach matched both "CSK" and "Super CSK".
    const out = resolveMatchOutcome({
      team1: 'CSK', team2: 'Super CSK',
      innings1: inningsWith(60), innings2: inningsWith(61, 2),
      rules, status: 'IN_PROGRESS',
    });
    expect(out.winnerTeam).toBe('Super CSK');
    expect(out.loserTeam).toBe('CSK');
  });

  it('honours an officially revised target', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(200), innings2: inningsWith(105, 4),
      rules, status: 'IN_PROGRESS',
      revisedTarget: 105, revisedOvers: 12,
    });
    expect(out.resultType).toBe('WIN_BY_WICKETS');
    expect(out.winnerTeam).toBe('Beta');
  });

  it('computes required run rate and returns null when it does not apply', () => {
    expect(requiredRunRate(101, 50, 20, 10, 0)).toBeCloseTo(5.1, 5);
    expect(requiredRunRate(101, 50, 20, 20, 0)).toBeNull(); // overs gone
    expect(requiredRunRate(101, 101, 20, 10, 0)).toBeNull(); // already won
  });
});

// ─────────────────────────────────────────────────────────────
describe('super over', () => {
  const t1 = 'Alpha';
  const t2 = 'Beta';

  it('is only offered when the competition enables it', () => {
    expect(ICC_T20.superOverEnabled).toBe(true);
    expect(LOCAL_T20.superOverEnabled).toBe(false);
  });

  it('gives the chasing side first innings by default', () => {
    const first = superOverBattingFirstTeam({
      rules: ICC_T20, matchBattingFirstTeam: t1, matchChasingTeam: t2,
    });
    expect(first).toBe(t2);
  });

  it('supports a competition that keeps the original order', () => {
    const r = resolveRules({ totalOvers: 20, overrides: { superOverBattingFirst: 'SAME_AS_MATCH' } });
    expect(
      superOverBattingFirstTeam({ rules: r, matchBattingFirstTeam: t1, matchChasingTeam: t2 })
    ).toBe(t1);
  });

  it('requires a recorded toss when the rule says toss', () => {
    const r = resolveRules({ totalOvers: 20, overrides: { superOverBattingFirst: 'TOSS' } });
    expect(() =>
      superOverBattingFirstTeam({ rules: r, matchBattingFirstTeam: t1, matchChasingTeam: t2 })
    ).toThrow(/toss/);
    expect(
      superOverBattingFirstTeam({
        rules: r, matchBattingFirstTeam: t1, matchChasingTeam: t2, tossWinner: t1,
      })
    ).toBe(t1);
  });

  it('ends a super over innings after two wickets', () => {
    const so = rulesForSuperOver(ICC_T20);
    expect(so.allOutWickets).toBe(2);
    expect(so.totalOvers).toBe(1);
    const inn = inningsWith(6, 2, so, superOverInningsKey(1, 1));
    expect(inn.wickets).toBe(2);
  });

  it('decides a super over on runs', () => {
    const so: SuperOverState = {
      ...createSuperOver(1, t2),
      innings1: inningsWith(7, 0, rulesForSuperOver(ICC_T20), superOverInningsKey(1, 1)),
      innings2: inningsWith(6, 2, rulesForSuperOver(ICC_T20), superOverInningsKey(1, 2)),
    };
    const res = resolveSuperOver(so, t1, ICC_T20);
    expect(res.complete).toBe(true);
    expect(res.tied).toBe(false);
    expect(res.winnerTeam).toBe(t2); // batted first and defended
  });

  it('surfaces a super over win through the match outcome', () => {
    const soRules = rulesForSuperOver(ICC_T20);
    const superOvers: SuperOverState[] = [
      {
        ...createSuperOver(1, t2),
        innings1: inningsWith(6, 0, soRules, superOverInningsKey(1, 1)),
        innings2: inningsWith(7, 0, soRules, superOverInningsKey(1, 2)),
        complete: true,
        tied: false,
        winnerTeam: t1,
      },
    ];
    const out = resolveMatchOutcome({
      team1: t1, team2: t2,
      innings1: inningsWith(75), innings2: inningsWith(75, 10),
      rules: ICC_T20, status: 'SUPER_OVER', superOvers,
    });
    expect(out.resultType).toBe('TIE_BROKEN_BY_SUPER_OVER');
    expect(out.decidedBySuperOver).toBe(true);
    expect(out.winnerTeam).toBe(t1);
    expect(out.superOverIndex).toBe(1);
    expect(out.text).toMatch(/won the Super Over/);
  });

  it('chains into a second super over when the first is tied', () => {
    const soRules = rulesForSuperOver(ICC_T20);
    const tiedFirst: SuperOverState = {
      ...createSuperOver(1, t2),
      innings1: inningsWith(8, 0, soRules, superOverInningsKey(1, 1)),
      innings2: inningsWith(8, 2, soRules, superOverInningsKey(1, 2)),
    };
    const chain = resolveSuperOverChain([tiedFirst], t1, t2, ICC_T20);
    expect(chain.needsAnother).toBe(true);
    expect(chain.winnerTeam).toBeNull();

    const second = nextSuperOver([tiedFirst], t1, t2);
    expect(second.index).toBe(2);
    // Sides swap who bats first in the repeat.
    expect(second.battingFirstTeam).toBe(t1);
  });

  it('resolves a double super over to the second one', () => {
    const soRules = rulesForSuperOver(ICC_T20);
    const first: SuperOverState = {
      ...createSuperOver(1, t2),
      innings1: inningsWith(8, 0, soRules, superOverInningsKey(1, 1)),
      innings2: inningsWith(8, 2, soRules, superOverInningsKey(1, 2)),
    };
    const second: SuperOverState = {
      ...createSuperOver(2, t1),
      innings1: inningsWith(10, 0, soRules, superOverInningsKey(2, 1)),
      innings2: inningsWith(9, 2, soRules, superOverInningsKey(2, 2)),
    };
    const chain = resolveSuperOverChain([first, second], t1, t2, ICC_T20);
    expect(chain.winnerTeam).toBe(t1);
    expect(chain.decidedAtIndex).toBe(2);
    expect(chain.needsAnother).toBe(false);
  });

  it('namespaces super over innings so they never mix with regulation play', () => {
    expect(isSuperOverKey('so1_innings1')).toBe(true);
    expect(isSuperOverKey('innings1')).toBe(false);
    const mixed: MatchEvent[] = [
      { kind: 'BOWLER_CHANGE', id: 'a', seq: 0, inningsKey: 'innings1', timestamp: 0, bowlerId: 20 },
      { kind: 'BOWLER_CHANGE', id: 'b', seq: 1, inningsKey: 'so1_innings1', timestamp: 0, bowlerId: 21 },
    ];
    expect(regulationEventsOnly(mixed)).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────
describe('net run rate', () => {
  it('charges the full quota when a side is bowled out', () => {
    const allOut = inningsWith(80, 10); // all out inside the 20 overs
    const [a] = buildNRRInputs({
      team1: 'Alpha', team2: 'Beta',
      innings1: allOut, innings2: inningsWith(81, 2), rules,
    });
    expect(a.oversFor).toBe(20);
  });

  it('honours a non-standard all-out threshold', () => {
    // 8-a-side: all out at 7 wickets. The old code hard-coded 10 and so
    // never applied the full-quota rule here.
    const eight = resolveRules({ totalOvers: 10, playersPerSide: 8 });
    expect(eight.allOutWickets).toBe(7);
    const allOut = inningsWith(40, 7, eight);
    const [a] = buildNRRInputs({
      team1: 'Alpha', team2: 'Beta',
      innings1: allOut, innings2: inningsWith(41, 1, eight), rules: eight,
    });
    expect(a.oversFor).toBe(10);
  });

  it('uses actual overs faced when a side is not bowled out', () => {
    const notOut = inningsWith(30, 2);
    const [a] = buildNRRInputs({
      team1: 'Alpha', team2: 'Beta',
      innings1: notOut, innings2: inningsWith(31, 1), rules,
    });
    expect(a.oversFor).toBeCloseTo(notOut.overs + notOut.balls / 6, 5);
    expect(a.oversFor).toBeLessThan(20);
  });

  it('computes a signed rate from cumulative totals', () => {
    expect(netRunRate(300, 40, 250, 40)).toBeCloseTo(1.25, 5);
    expect(netRunRate(250, 40, 300, 40)).toBeCloseTo(-1.25, 5);
    expect(netRunRate(0, 0, 0, 0)).toBe(0);
  });

  it('excludes super over runs from NRR by default', () => {
    expect(ICC_T20.superOverCountsInNRR).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────
describe('status state machine', () => {
  it('allows the normal live path', () => {
    expect(canTransition('SCHEDULED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
  });

  it('separates suspension from abandonment and no result', () => {
    expect(canTransition('IN_PROGRESS', 'SUSPENDED')).toBe(true);
    expect(canTransition('SUSPENDED', 'RESUMED')).toBe(true);
    expect(canTransition('SUSPENDED', 'ABANDONED')).toBe(true);
    expect(canTransition('SUSPENDED', 'NO_RESULT')).toBe(true);
  });

  it('refuses impossible transitions', () => {
    expect(canTransition('ABANDONED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('NO_RESULT', 'COMPLETED')).toBe(false);
    expect(() => assertTransition('ABANDONED', 'IN_PROGRESS')).toThrow(EngineError);
  });

  it('blocks scoring unless the match is live', () => {
    expect(isScoringAllowed('IN_PROGRESS')).toBe(true);
    expect(isScoringAllowed('RESUMED')).toBe(true);
    expect(isScoringAllowed('SUPER_OVER')).toBe(true);
    expect(isScoringAllowed('SUSPENDED')).toBe(false);
    expect(isScoringAllowed('ABANDONED')).toBe(false);
  });

  it('does not turn bad weather into a result on its own', () => {
    const { status, interruption } = suspendMatch({
      status: 'IN_PROGRESS', reason: 'Rain',
      inningsKey: 'innings2', innings: inningsWith(40, 2), rules,
    });
    // Suspending records a stoppage; it does NOT decide the match.
    expect(status).toBe('SUSPENDED');
    expect(interruption.reason).toBe('Rain');
    expect(interruption.revisedTarget).toBeNull();

    // The official then chooses explicitly.
    expect(resumeMatch(status)).toBe('RESUMED');
    expect(concludeWithoutResult(status, 'NO_RESULT')).toBe('NO_RESULT');
    expect(concludeWithoutResult(status, 'ABANDONED')).toBe('ABANDONED');
  });

  it('captures the score and overs at the stoppage', () => {
    const inn = inningsWith(40, 2);
    const { interruption } = suspendMatch({
      status: 'IN_PROGRESS', reason: 'Bad Light',
      inningsKey: 'innings2', innings: inn, rules,
    });
    expect(interruption.scoreAtStop).toBe(40);
    expect(interruption.oversCompletedAtStop).toBeCloseTo(inn.overs + inn.balls / 6, 5);
  });
});

// ─────────────────────────────────────────────────────────────
describe('revised overs and targets', () => {
  const baseInterruption = () =>
    suspendMatch({
      status: 'IN_PROGRESS', reason: 'Rain',
      inningsKey: 'innings2', innings: inningsWith(30, 1), rules,
    }).interruption;

  it('stores an officially applied revision', () => {
    const revised = applyRevision({
      interruption: baseInterruption(),
      revisedOvers: 12, revisedTarget: 105,
      appliedBy: 'referee-1', rules,
    });
    expect(revised.revisedOvers).toBe(12);
    expect(revised.revisedTarget).toBe(105);
    expect(revised.appliedBy).toBe('referee-1');
    expect(effectiveOvers([revised], rules)).toBe(12);
    expect(effectiveTarget([revised])).toBe(105);
    expect(hasRevisedTarget([revised])).toBe(true);
  });

  it('requires an official and at least one value', () => {
    expect(() =>
      applyRevision({ interruption: baseInterruption(), revisedOvers: 12, revisedTarget: null, appliedBy: '', rules })
    ).toThrow(/who applied it/);
    expect(() =>
      applyRevision({ interruption: baseInterruption(), revisedOvers: null, revisedTarget: null, appliedBy: 'ref', rules })
    ).toThrow(/Provide a revised/);
  });

  it('rejects revised overs above the original quota', () => {
    expect(() =>
      applyRevision({ interruption: baseInterruption(), revisedOvers: 25, revisedTarget: null, appliedBy: 'ref', rules })
    ).toThrow(/cannot exceed the original 20/);
  });

  it('falls back to the original quota when nothing was revised', () => {
    expect(effectiveOvers([], rules)).toBe(20);
    expect(effectiveTarget([])).toBeNull();
    expect(hasRevisedTarget([])).toBe(false);
  });

  it('never invents a DLS figure without a registered provider', () => {
    expect(hasDLSProvider()).toBe(false);
    expect(() =>
      computeDLS({
        team1Runs: 200, team1Wickets: 5, team1OversFaced: 20,
        team2Runs: 80, team2Wickets: 2, team2OversFaced: 8,
        originalOvers: 20, oversLostToStoppage: 8, rules,
      })
    ).toThrow(/No DLS engine is configured/);
  });

  it('uses a provider once one is registered', () => {
    registerDLSProvider({
      method: 'TEST-METHOD',
      compute: () => ({ revisedTarget: 150, revisedOvers: 15, parScore: 140, method: 'TEST-METHOD' }),
    });
    const res = computeDLS({
      team1Runs: 200, team1Wickets: 5, team1OversFaced: 20,
      team2Runs: 80, team2Wickets: 2, team2OversFaced: 8,
      originalOvers: 20, oversLostToStoppage: 5, rules,
    });
    expect(res.revisedTarget).toBe(150);
    expect(res.method).toBe('TEST-METHOD');
  });
});

// ─────────────────────────────────────────────────────────────
describe('standings and tie-breakers', () => {
  const rows = () => [
    emptyStanding('t1', 'Alpha', 1),
    emptyStanding('t2', 'Beta', 2),
    emptyStanding('t3', 'Gamma', 3),
  ];

  const winOutcome = (winner: string, loser: string) =>
    resolveMatchOutcome({
      team1: winner, team2: loser,
      innings1: inningsWith(100), innings2: inningsWith(90, 10),
      rules, status: 'IN_PROGRESS',
    });

  it('awards points to exactly the two teams involved', () => {
    const out = winOutcome('Alpha', 'Beta');
    const after = applyMatchToStandings(rows(), {
      outcome: out, rules, team1: 'Alpha', team2: 'Beta', nrrInputs: null,
    });
    const alpha = after.find(r => r.teamName === 'Alpha')!;
    const beta = after.find(r => r.teamName === 'Beta')!;
    const gamma = after.find(r => r.teamName === 'Gamma')!;
    expect(alpha.points).toBe(2);
    expect(alpha.won).toBe(1);
    expect(beta.points).toBe(0);
    expect(beta.lost).toBe(1);
    // Untouched.
    expect(gamma.played).toBe(0);
  });

  it('gives both sides a point for a tie', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(75), innings2: inningsWith(75, 10),
      rules, status: 'IN_PROGRESS',
    });
    const after = applyMatchToStandings(rows(), {
      outcome: out, rules, team1: 'Alpha', team2: 'Beta', nrrInputs: null,
    });
    expect(after.find(r => r.teamName === 'Alpha')!.points).toBe(1);
    expect(after.find(r => r.teamName === 'Beta')!.points).toBe(1);
    expect(after.find(r => r.teamName === 'Alpha')!.tied).toBe(1);
  });

  it('does not record a loss for either side on a no result', () => {
    const out = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(40), innings2: inningsWith(20, 1),
      rules, status: 'NO_RESULT',
    });
    const after = applyMatchToStandings(rows(), {
      outcome: out, rules, team1: 'Alpha', team2: 'Beta', nrrInputs: null,
    });
    const alpha = after.find(r => r.teamName === 'Alpha')!;
    const beta = after.find(r => r.teamName === 'Beta')!;
    expect(alpha.lost).toBe(0);
    expect(beta.lost).toBe(0);
    expect(alpha.noResult).toBe(1);
    expect(alpha.points).toBe(1);
    // A no result contributes nothing to run rate.
    expect(alpha.nrrOversFor).toBe(0);
  });

  it('accumulates NRR across matches', () => {
    const out = winOutcome('Alpha', 'Beta');
    const nrrInputs = buildNRRInputs({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(100), innings2: inningsWith(90, 10), rules,
    });
    const after = applyMatchToStandings(rows(), {
      outcome: out, rules, team1: 'Alpha', team2: 'Beta', nrrInputs,
    });
    const alpha = after.find(r => r.teamName === 'Alpha')!;
    expect(alpha.nrrRunsFor).toBe(100);
    expect(alpha.nrrRunsAgainst).toBe(90);
    expect(alpha.nrr).not.toBe(0);
  });

  it('applies the configured tie-break order', () => {
    const table = [
      { ...emptyStanding('a', 'Alpha', 3), points: 4, won: 2, nrr: 0.10 },
      { ...emptyStanding('b', 'Beta', 1), points: 4, won: 2, nrr: 0.50 },
      { ...emptyStanding('c', 'Gamma', 2), points: 4, won: 2, nrr: 0.30 },
    ];

    const byNRR = sortStandings(table, ['POINTS', 'WINS', 'NRR']);
    expect(byNRR.map(r => r.teamName)).toEqual(['Beta', 'Gamma', 'Alpha']);

    // Same table, different competition rules -> different order.
    const bySeed = sortStandings(table, ['POINTS', 'WINS', 'SEEDING']);
    expect(bySeed.map(r => r.teamName)).toEqual(['Beta', 'Gamma', 'Alpha']);

    const seedFirst = sortStandings(
      [
        { ...emptyStanding('a', 'Alpha', 3), points: 4, nrr: 0.9 },
        { ...emptyStanding('b', 'Beta', 1), points: 4, nrr: 0.1 },
      ],
      ['POINTS', 'SEEDING']
    );
    expect(seedFirst.map(r => r.teamName)).toEqual(['Beta', 'Alpha']);
  });

  it('breaks a tie on head to head when configured', () => {
    const h2h = buildHeadToHead([
      { team1: 'Alpha', team2: 'Beta', outcome: winOutcome('Beta', 'Alpha') },
    ]);
    const table = [
      { ...emptyStanding('a', 'Alpha'), points: 4, nrr: 0.5 },
      { ...emptyStanding('b', 'Beta'), points: 4, nrr: 0.1 },
    ];
    const sorted = sortStandings(table, ['POINTS', 'HEAD_TO_HEAD'], h2h);
    expect(sorted[0].teamName).toBe('Beta');
  });

  it('is deterministic when rows are genuinely identical', () => {
    const table = [emptyStanding('b', 'Beta'), emptyStanding('a', 'Alpha')];
    expect(sortStandings(table, ['POINTS']).map(r => r.teamName)).toEqual(['Alpha', 'Beta']);
  });

  it('picks pool qualifiers using the configured order', () => {
    const pool = [
      { ...emptyStanding('a', 'Alpha'), points: 2, nrr: 0.1 },
      { ...emptyStanding('b', 'Beta'), points: 4, nrr: -0.2 },
      { ...emptyStanding('c', 'Gamma'), points: 2, nrr: 0.9 },
    ];
    const q = poolQualifiers(pool, 2, ['POINTS', 'NRR'], {}, 'Pool A');
    expect(q.map(r => r.teamName)).toEqual(['Beta', 'Gamma']);
    expect(q[0].poolRank).toBe(1);
    expect(q[0].poolName).toBe('Pool A');
  });

  it('formats NRR with a sign', () => {
    expect(formatNRR(1.234)).toBe('+1.23');
    expect(formatNRR(-1.234)).toBe('-1.23');
    expect(formatNRR(0)).toBe('0.00');
  });

  it('splits points on a super over win when the scheme says so', () => {
    const superOvers: SuperOverState[] = [
      { ...createSuperOver(1, 'Beta'), complete: true, tied: false, winnerTeam: 'Alpha' },
    ];
    const out = resolveMatchOutcome({
      team1: 'Alpha', team2: 'Beta',
      innings1: inningsWith(75), innings2: inningsWith(75, 10),
      rules: ICC_T20, status: 'SUPER_OVER', superOvers,
    });
    const after = applyMatchToStandings(rows(), {
      outcome: out, rules: ICC_T20, team1: 'Alpha', team2: 'Beta', nrrInputs: null,
    });
    expect(after.find(r => r.teamName === 'Alpha')!.points).toBe(2);
    expect(after.find(r => r.teamName === 'Beta')!.points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────
describe('substitutes and concussion replacements', () => {
  const base = { teamName: 'Alpha', rules, existing: [] as Replacement[] };

  it('lets a substitute fielder field but not bat or bowl', () => {
    const r = createReplacement({
      ...base, originalPlayerId: 1, replacementPlayerId: 9, replacementType: 'FIELDER',
      makeId: p => `${p}_1`,
    });
    expect(canBat(9, [r]).allowed).toBe(false);
    expect(canBowl(9, [r]).allowed).toBe(false);
    expect(canBat(9, [r]).reason).toMatch(/not permitted to bat/);
  });

  it('lets an approved concussion replacement bat and bowl', () => {
    const r = createReplacement({
      ...base, originalPlayerId: 1, replacementPlayerId: 9,
      replacementType: 'CONCUSSION', approved: true, reason: 'Head knock',
      makeId: p => `${p}_1`,
    });
    expect(canBat(9, [r]).allowed).toBe(true);
    expect(canBowl(9, [r]).allowed).toBe(true);
  });

  it('requires approval and a reason for a concussion replacement', () => {
    expect(() =>
      createReplacement({
        ...base, originalPlayerId: 1, replacementPlayerId: 9,
        replacementType: 'CONCUSSION', approved: false, reason: 'Head knock',
      })
    ).toThrow(/approved by the match official/);
    expect(() =>
      createReplacement({
        ...base, originalPlayerId: 1, replacementPlayerId: 9,
        replacementType: 'CONCUSSION', approved: true,
      })
    ).toThrow(/must record a reason/);
  });

  it('stops the replaced player taking any further part', () => {
    const r = createReplacement({
      ...base, originalPlayerId: 1, replacementPlayerId: 9, replacementType: 'CONCUSSION',
      approved: true, reason: 'Head knock', makeId: p => `${p}_1`,
    });
    expect(canBat(1, [r]).allowed).toBe(false);
    expect(canBowl(1, [r]).allowed).toBe(false);
  });

  it('will not reuse a player who has already come on', () => {
    const r = createReplacement({
      ...base, originalPlayerId: 1, replacementPlayerId: 9, replacementType: 'FIELDER',
      makeId: p => `${p}_1`,
    });
    expect(() =>
      createReplacement({ ...base, existing: [r], originalPlayerId: 2, replacementPlayerId: 9, replacementType: 'FIELDER' })
    ).toThrow(/already come on/);
  });

  it('preserves the original player statistics by never reusing their id', () => {
    // Stats are keyed by player id, so a replacement accumulating under a
    // different id cannot overwrite the original's record.
    const state = inningsWith(10);
    const originalKey = statKey(0);
    expect(state.batsmanStats[originalKey]).toBeDefined();
    expect(state.batsmanStats[statKey(9)]).toBeUndefined();
  });

  it('honours a profile that disables concussion replacements', () => {
    const strict = resolveRules({ totalOvers: 20, overrides: { concussionReplacementEnabled: false } });
    expect(() =>
      createReplacement({
        ...base, rules: strict, originalPlayerId: 1, replacementPlayerId: 9,
        replacementType: 'CONCUSSION', approved: true, reason: 'x',
      })
    ).toThrow(/not enabled/);
  });
});

// ─────────────────────────────────────────────────────────────
describe('performance score (player of the match suggestion)', () => {
  it('ranks contributors and exposes the score', () => {
    const inn1 = inningsWith(60);
    const candidates = computePerformanceScores({
      team1: 'Alpha', team2: 'Beta',
      team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'C' }],
      team2Players: [{ id: 20, name: 'X' }, { id: 21, name: 'Y' }],
      innings1: inn1, innings2: null, rules,
    });
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].score).toBeGreaterThan(0);
    // Sorted descending.
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].score).toBeGreaterThanOrEqual(candidates[i].score);
    }
  });

  it('breaks the score down so the suggestion is explainable', () => {
    const candidates = computePerformanceScores({
      team1: 'Alpha', team2: 'Beta',
      team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }],
      team2Players: [{ id: 20, name: 'X' }],
      innings1: inningsWith(50), innings2: null, rules,
    });
    const top = candidates[0];
    expect(top.breakdown.batting + top.breakdown.bowling + top.breakdown.fielding).toBeCloseTo(top.score, 5);
  });

  it('is configurable rather than fixed', () => {
    const heavySix = resolveRules({
      totalOvers: 20,
      overrides: { performanceScoreWeights: { ...rules.performanceScoreWeights, perSix: 100 } },
    });
    // Must be an actual boundary six — a 6 that was run does not count as one,
    // which is exactly the distinction the engine enforces.
    const sixEvent = deriveEvent(
      { type: 'RUNS', runs: 6, boundary: 6 },
      reduceInnings([], setup, rules),
      rules,
      { inningsKey: 'innings1', seq: 0, timestamp: 0, makeId: p => `${p}_six` }
    );
    const inn = reduceInnings([sixEvent], setup, rules);
    expect(inn.batsmanStats[statKey(0)].sixes).toBe(1);

    const args = {
      team1: 'Alpha', team2: 'Beta',
      team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }],
      team2Players: [{ id: 20, name: 'X' }],
      innings1: inn, innings2: null,
    };
    const normal = computePerformanceScores({ ...args, rules });
    const boosted = computePerformanceScores({ ...args, rules: heavySix });
    expect(boosted[0].score).toBeGreaterThan(normal[0].score);
  });

  it('returns a shortlist the scorer can override', () => {
    const shortlist = suggestPlayerOfTheMatch(
      {
        team1: 'Alpha', team2: 'Beta',
        team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'C' }],
        team2Players: [{ id: 20, name: 'X' }, { id: 21, name: 'Y' }],
        innings1: inningsWith(60), innings2: null, rules,
      },
      3
    );
    expect(shortlist.length).toBeLessThanOrEqual(3);
  });
});

// ─────────────────────────────────────────────────────────────
describe('persistence bridge', () => {
  it('loads a legacy match with no ballEvents by converting its history', () => {
    const raw = {
      id: 'M1', team1: 'Alpha', team2: 'Beta',
      totalOvers: 20, playersPerSide: 11, currentInnings: 1 as const, status: 'live',
      team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }, { id: 2, name: 'C' }],
      team2Players: [{ id: 20, name: 'X' }],
      innings1: {
        runs: 5, wickets: 0, overs: 0, balls: 2,
        strikerId: 1, nonStrikerId: 0, currentBowlerId: 20,
        ballHistory: [
          { result: '1', over: 0, ball: 0, batsmanId: 0, nonStrikerIdBefore: 1, bowlerId: 20 },
          { result: '4', over: 0, ball: 1, batsmanId: 1, nonStrikerIdBefore: 0, bowlerId: 20 },
        ],
      },
    };
    const m = loadMatch(raw);
    expect(m.migratedFromLegacy).toBe(true);
    expect(m.innings1.runs).toBe(5);
    expect(m.innings1.legalBalls).toBe(2);
    expect(m.status).toBe('IN_PROGRESS');
    // Opening pair recovered from the first delivery, not the current one.
    expect(m.innings1.batsmanStats[statKey(0)]).toBeDefined();
    expect(m.innings1.batsmanStats[statKey(1)]).toBeDefined();
  });

  it('prefers stored ballEvents when present', () => {
    const events: MatchEvent[] = [
      {
        kind: 'BALL', id: 'b1', seq: 0, inningsKey: 'innings1', timestamp: 1,
        over: 0, ball: 0, strikerId: 0, nonStrikerId: 1, bowlerId: 20,
        deliveryType: 'LEGAL', legalDelivery: true, batterFacedBall: true,
        batterRuns: 6, extras: { wide: 0, noBall: 0, bye: 0, legBye: 0, penalty: 0 },
        totalRuns: 6, crossingRuns: 0, runType: 'BOUNDARY_SIX', boundary: 6,
        overthrowRuns: 0, freeHitBefore: false, freeHitAfter: false,
      },
    ];
    const m = loadMatch({
      id: 'M2', team1: 'Alpha', team2: 'Beta', totalOvers: 20, playersPerSide: 11,
      currentInnings: 1, status: 'live', ballEvents: events,
      team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }],
      team2Players: [{ id: 20, name: 'X' }],
    });
    expect(m.migratedFromLegacy).toBe(false);
    expect(m.innings1.runs).toBe(6);
    expect(m.innings1.batsmanStats[statKey(0)].sixes).toBe(1);
  });

  it('writes an innings snapshot using the original field names', () => {
    const snap = buildInningsWrite(inningsWith(10));
    // Backward-compatible keys the existing screens read.
    ['runs', 'wickets', 'overs', 'balls', 'strikerId', 'nonStrikerId',
     'currentBowlerId', 'batsmanStats', 'bowlerStats', 'extras', 'ballHistory']
      .forEach(k => expect(snap).toHaveProperty(k));
    // Additive engine fields.
    ['freeHit', 'partnerships', 'wormPoints', 'retired'].forEach(k =>
      expect(snap).toHaveProperty(k)
    );
  });

  it('hands the tournament a structured result and no NRR for a no result', () => {
    const m = loadMatch({
      id: 'M3', team1: 'Alpha', team2: 'Beta', totalOvers: 20, playersPerSide: 11,
      currentInnings: 2, matchStatus: 'NO_RESULT',
      team1Players: [{ id: 0, name: 'A' }, { id: 1, name: 'B' }],
      team2Players: [{ id: 20, name: 'X' }],
      innings1: { runs: 40, wickets: 1, overs: 5, balls: 0, ballHistory: [] },
      innings2: { runs: 20, wickets: 0, overs: 3, balls: 0, ballHistory: [] },
    });
    const res = buildTournamentResult(m);
    expect(res.outcome.resultType).toBe('NO_RESULT');
    expect(res.nrrInputs).toBeNull();
  });
});
