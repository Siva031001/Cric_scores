// ── Career statistics aggregation ────────────────────────────
// Pure functions: given a set of stored matches and a player's cross-match
// identity (globalPlayerId), fold them into career batting / bowling /
// fielding totals. No Firebase, no React — so this is unit-testable and can
// be reused by any screen.
//
// Why globalPlayerId and not the per-match numeric `playerId`: the numeric id
// is only unique WITHIN one match's team list (it is an array index), so the
// same number means different people in different matches. globalPlayerId is
// the stable cross-match identity written onto batsmanStats / bowlerStats /
// fieldingStats when a match is scored.
//
// Super Overs are deliberately excluded. They are a tie-break device, and
// runs/wickets from them are not counted in career records — so only
// innings1 and innings2 are folded here.

import type {
  CareerBattingStats,
  CareerBowlingStats,
  CareerFieldingStats,
} from '../types/cricket';

export interface CareerStats {
  batting: CareerBattingStats;
  bowling: CareerBowlingStats;
  fielding: CareerFieldingStats;
  /** Matches played — squad membership, the cricket "Mat" figure. */
  matches: number;
  /** Matches in which they actually batted. */
  battedInMatches: number;
  /** Matches in which they actually bowled. */
  bowledInMatches: number;
}

const emptyBatting = (): CareerBattingStats => ({
  matches: 0, innings: 0, runs: 0, balls: 0, highScore: 0, average: 0,
  strikeRate: 0, notOut: 0, ducks: 0, hundreds: 0, fifties: 0,
  twentyFives: 0, sixes: 0, fours: 0,
});

const emptyBowling = (): CareerBowlingStats => ({
  matches: 0, innings: 0, balls: 0, dots: 0, runs: 0, wickets: 0, maidens: 0,
  average: 0, economy: 0, bestFigure: '-', strikeRate: 0,
  twoWickets: 0, fourWickets: 0,
});

const emptyFielding = (): CareerFieldingStats => ({
  catches: 0, stumpings: 0, runOuts: 0,
});

export const emptyCareerStats = (): CareerStats => ({
  batting: emptyBatting(),
  bowling: emptyBowling(),
  fielding: emptyFielding(),
  matches: 0,
  battedInMatches: 0,
  bowledInMatches: 0,
});

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Folds stored match records into one player's career totals.
 *
 * `matches` is a list of raw `matches/{id}` values as stored in the database
 * (nulls are tolerated and skipped, since a match can be deleted while still
 * referenced by playerMatchIndex).
 */
export const aggregateCareer = (matches: any[], globalPlayerId: string): CareerStats => {
  const out = emptyCareerStats();
  if (!globalPlayerId) return out;

  const batting = out.batting;
  const bowling = out.bowling;
  const fielding = out.fielding;

  // Best bowling innings, compared as (most wickets, then fewest runs).
  let bestWkts = -1;
  let bestRuns = 0;

  const matchIds = new Set<string>();
  const battedIn = new Set<string>();
  const bowledIn = new Set<string>();

  for (const m of matches) {
    if (!m) continue;
    const id = m.id ?? JSON.stringify(m.createdAt ?? Math.random());

    // "Matches" means matches PLAYED, which is squad membership — not
    // whether the player produced a statistic. Verified against real data:
    // one player was in the squad for 13 matches but had a batting, bowling
    // or fielding row in only 1 of them. Counting from the stat rows (as this
    // first did) reported "1 match" for someone who had played 13.
    const inSquad = [...(m.team1Players ?? []), ...(m.team2Players ?? [])]
      .some((p: any) => p?.globalPlayerId === globalPlayerId);
    let appeared = inSquad;

    for (const key of ['innings1', 'innings2']) {
      const inn = m[key];
      if (!inn) continue;

      for (const bs of Object.values<any>(inn.batsmanStats ?? {})) {
        if (!bs || bs.globalPlayerId !== globalPlayerId) continue;
        appeared = true;
        // An innings counts once the player is at the crease. A batter who
        // came in and was dismissed without facing a legal ball still has a
        // batting innings, so this is not gated on balls > 0.
        batting.innings += 1;
        battedIn.add(id);
        const runs = bs.runs ?? 0;
        const balls = bs.balls ?? 0;
        batting.runs += runs;
        batting.balls += balls;
        batting.fours += bs.fours ?? 0;
        batting.sixes += bs.sixes ?? 0;
        if (runs > batting.highScore) batting.highScore = runs;
        if (bs.isOut) {
          if (runs === 0) batting.ducks += 1;
        } else {
          batting.notOut += 1;
        }
        if (runs >= 100) batting.hundreds += 1;
        else if (runs >= 50) batting.fifties += 1;
        else if (runs >= 25) batting.twentyFives += 1;
      }

      for (const bw of Object.values<any>(inn.bowlerStats ?? {})) {
        if (!bw || bw.globalPlayerId !== globalPlayerId) continue;
        const balls = (bw.overs ?? 0) * 6 + (bw.balls ?? 0);
        // Only count a bowling innings if they actually bowled a ball —
        // a bowlerStats row is created when a bowler is selected, before
        // they have delivered anything.
        if (balls === 0) continue;
        appeared = true;
        bowling.innings += 1;
        bowledIn.add(id);
        const wkts = bw.wickets ?? 0;
        const conceded = bw.runs ?? 0;
        bowling.balls += balls;
        bowling.runs += conceded;
        bowling.wickets += wkts;
        bowling.maidens += bw.maidens ?? 0;
        bowling.dots += bw.dots ?? 0;
        if (wkts >= 2) bowling.twoWickets += 1;
        if (wkts >= 4) bowling.fourWickets += 1;
        if (wkts > bestWkts || (wkts === bestWkts && conceded < bestRuns)) {
          bestWkts = wkts;
          bestRuns = conceded;
        }
      }

      for (const fs of Object.values<any>(inn.fieldingStats ?? {})) {
        if (!fs || fs.globalPlayerId !== globalPlayerId) continue;
        appeared = true;
        fielding.catches += fs.catches ?? 0;
        fielding.stumpings += fs.stumpings ?? 0;
        fielding.runOuts += fs.runOuts ?? 0;
      }
    }

    if (appeared) matchIds.add(id);
  }

  out.matches = matchIds.size;
  // Cricket convention: the "Mat" column is the same in the batting and
  // bowling sections — matches played. The separate "Inns" figures above are
  // what distinguish innings batted from innings bowled.
  batting.matches = out.matches;
  bowling.matches = out.matches;
  // Kept for callers that want the narrower figures.
  out.battedInMatches = battedIn.size;
  out.bowledInMatches = bowledIn.size;

  // Batting average is runs per DISMISSAL, not per innings — not-outs don't
  // count against it. With no dismissals there is no average; 0 is reported
  // rather than Infinity, and callers show '-' when innings is 0.
  const dismissals = batting.innings - batting.notOut;
  batting.average = dismissals > 0 ? round2(batting.runs / dismissals) : 0;
  batting.strikeRate = batting.balls > 0 ? round2((batting.runs / batting.balls) * 100) : 0;

  bowling.average = bowling.wickets > 0 ? round2(bowling.runs / bowling.wickets) : 0;
  bowling.economy = bowling.balls > 0 ? round2(bowling.runs / (bowling.balls / 6)) : 0;
  bowling.strikeRate = bowling.wickets > 0 ? round2(bowling.balls / bowling.wickets) : 0;
  bowling.bestFigure = bestWkts >= 0 ? `${bestWkts}/${bestRuns}` : '-';

  return out;
};
