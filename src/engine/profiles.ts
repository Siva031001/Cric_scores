// ─────────────────────────────────────────────────────────────
// COMPETITION RULE PROFILES
// ─────────────────────────────────────────────────────────────
// PURE MODULE — no react-native / firebase imports.
//
// Cricket playing conditions legitimately differ between competitions, so
// nothing here is treated as universal law. A match stores the profile it
// was played under, and the engine reads every threshold from that profile
// rather than from a constant buried in a screen.
// ─────────────────────────────────────────────────────────────

import { CompetitionRules, PerformanceScoreWeights, TieBreaker, PointsRules } from './types';

/**
 * Default weights for the app's Player-of-the-Match suggestion.
 *
 * IMPORTANT: this is an application heuristic invented for this product.
 * It is NOT an ICC rule and must never be presented as one. The scorer
 * always gets the final say — see performance.ts.
 *
 * These values reproduce the app's previous behaviour exactly, so existing
 * matches rank the same way after the refactor.
 */
export const DEFAULT_PERFORMANCE_WEIGHTS: PerformanceScoreWeights = {
  runPerRun: 1,
  perFour: 1,
  perSix: 2,
  fiftyBonus: 10,
  centuryBonus: 25,
  notOutBonus: 5,
  perWicket: 15,
  economyUnder6Bonus: 5,
  economyUnder8Bonus: 2,
  perMaiden: 3,
  perCatch: 8,
  perStumping: 8,
  perRunOut: 6,
};

/** Points scheme matching the app's existing behaviour. */
export const DEFAULT_POINTS: PointsRules = {
  win: 2,
  tie: 1,
  loss: 0,
  noResult: 1,
  abandoned: 1,
};

/**
 * Where a competition awards full points for a Super Over win, the win/loss
 * values are used directly. Where it treats the match as a tie but still
 * separates the sides, superOverWin/superOverLoss apply instead.
 */
export const SUPER_OVER_POINTS: PointsRules = {
  ...DEFAULT_POINTS,
  superOverWin: 2,
  superOverLoss: 0,
};

export const DEFAULT_TIE_BREAKERS: TieBreaker[] = [
  'POINTS',
  'WINS',
  'NRR',
  'HEAD_TO_HEAD',
  'SEEDING',
];

export const DEFAULT_PENALTY_REASONS: string[] = [
  'Unfair Play',
  'Fielding Restriction Breach',
  'Ball Striking Helmet',
  'Short Run',
  'Time Wasting',
  'Damaging the Pitch',
  'Other',
];

const base = (
  overrides: Partial<CompetitionRules> & Pick<CompetitionRules, 'profileId' | 'label' | 'format' | 'totalOvers'>
): CompetitionRules => {
  const playersPerSide = overrides.playersPerSide ?? 11;
  return {
    playersPerSide,
    ballsPerOver: 6,
    maxOversPerBowler: null,
    // A side is all out one wicket short of its full complement.
    allOutWickets: overrides.allOutWickets ?? playersPerSide - 1,

    widePenaltyRuns: 1,
    noBallPenaltyRuns: 1,
    freeHitAfterNoBall: true,

    superOverEnabled: false,
    superOverOvers: 1,
    superOverMaxWickets: 2,
    superOverBattingFirst: 'CHASING_TEAM',
    superOverCountsInStats: false,
    superOverCountsInNRR: false,

    dlsEnabled: false,

    timedOutEnabled: true,
    retiredOutEnabled: true,
    concussionReplacementEnabled: true,
    shortRunEnabled: true,
    penaltyRunsEnabled: true,
    penaltyReasons: DEFAULT_PENALTY_REASONS,

    creditBowlerForRetiredOut: false,

    tieBreakerRules: DEFAULT_TIE_BREAKERS,
    pointsRules: DEFAULT_POINTS,
    performanceScoreWeights: DEFAULT_PERFORMANCE_WEIGHTS,

    ...overrides,
  } as CompetitionRules;
};

export const ICC_T20: CompetitionRules = base({
  profileId: 'ICC_T20',
  label: 'ICC T20',
  format: 'T20',
  totalOvers: 20,
  maxOversPerBowler: 4,
  superOverEnabled: true,
  dlsEnabled: true,
  pointsRules: SUPER_OVER_POINTS,
});

export const ICC_ODI: CompetitionRules = base({
  profileId: 'ICC_ODI',
  label: 'ICC ODI',
  format: 'ODI',
  totalOvers: 50,
  maxOversPerBowler: 10,
  superOverEnabled: true,
  dlsEnabled: true,
  pointsRules: SUPER_OVER_POINTS,
});

/**
 * Local / club T20: Super Over and DLS off by default, no bowler quota,
 * because most local competitions do not run either.
 */
export const LOCAL_T20: CompetitionRules = base({
  profileId: 'LOCAL_T20',
  label: 'Local T20',
  format: 'T20',
  totalOvers: 20,
  maxOversPerBowler: null,
  superOverEnabled: false,
  dlsEnabled: false,
});

export const LOCAL_T10: CompetitionRules = base({
  profileId: 'LOCAL_T10',
  label: 'Local T10',
  format: 'T10',
  totalOvers: 10,
  maxOversPerBowler: null,
});

export const PROFILES: Record<string, CompetitionRules> = {
  ICC_T20,
  ICC_ODI,
  LOCAL_T20,
  LOCAL_T10,
};

/**
 * Builds the rules for a match. Falls back to a CUSTOM profile so the
 * app's existing free-form formats (5, 6, 8, 15 overs, Turf with 4-a-side)
 * keep working without needing a named profile.
 */
export const resolveRules = (opts: {
  profileId?: string | null;
  totalOvers?: number | null;
  playersPerSide?: number | null;
  overrides?: Partial<CompetitionRules> | null;
}): CompetitionRules => {
  const named = opts.profileId ? PROFILES[opts.profileId] : undefined;

  const totalOvers = opts.totalOvers ?? named?.totalOvers ?? 20;
  const playersPerSide = opts.playersPerSide ?? named?.playersPerSide ?? 11;

  const start: CompetitionRules = named
    ? { ...named, totalOvers, playersPerSide, allOutWickets: playersPerSide - 1 }
    : base({
        profileId: 'CUSTOM',
        label: 'Custom',
        format: 'CUSTOM',
        totalOvers,
        playersPerSide,
      });

  if (!opts.overrides) return start;

  const merged = { ...start, ...opts.overrides } as CompetitionRules;
  // Keep the all-out threshold consistent if playersPerSide was overridden
  // without an explicit allOutWickets.
  if (opts.overrides.playersPerSide != null && opts.overrides.allOutWickets == null) {
    merged.allOutWickets = merged.playersPerSide - 1;
  }
  return merged;
};

/** Rules for a Super Over, derived from the parent match's rules. */
export const superOverRules = (parent: CompetitionRules): CompetitionRules => ({
  ...parent,
  totalOvers: parent.superOverOvers,
  allOutWickets: parent.superOverMaxWickets,
  maxOversPerBowler: parent.superOverOvers,
});
