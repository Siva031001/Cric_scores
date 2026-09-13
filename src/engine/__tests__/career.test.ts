import { aggregateCareer, emptyCareerStats } from '../career';

// Minimal stored-match shapes, matching what the app actually writes to
// matches/{id}. Only the fields aggregateCareer reads are included.
const GID = 'PTEST0001';
const OTHER = 'POTHER999';

const squad = (...gids: (string | null)[]) => gids.map((g, i) => ({ id: i, name: 'P' + i, globalPlayerId: g }));

const bat = (globalPlayerId: string, o: any) => ({ globalPlayerId, playerId: 0, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, ...o });
const bowl = (globalPlayerId: string, o: any) => ({ globalPlayerId, playerId: 0, overs: 0, balls: 0, runs: 0, wickets: 0, maidens: 0, dots: 0, ...o });
const field = (globalPlayerId: string, o: any) => ({ globalPlayerId, displayName: 'X', catches: 0, stumpings: 0, runOuts: 0, ...o });

describe('aggregateCareer', () => {
  it('returns empty stats for no matches or no id', () => {
    expect(aggregateCareer([], GID)).toEqual(emptyCareerStats());
    expect(aggregateCareer([{ id: 'm1' }], '')).toEqual(emptyCareerStats());
  });

  it('tolerates nulls in the match list', () => {
    // playerMatchIndex can reference a match that has since been deleted.
    expect(() => aggregateCareer([null, undefined as any], GID)).not.toThrow();
    expect(aggregateCareer([null], GID).matches).toBe(0);
  });

  it('counts matches from squad membership, not from stat rows', () => {
    // The real-data bug this guards: a squad member who never batted, bowled
    // or fielded still played the match.
    const ms = [
      { id: 'm1', team1Players: squad(GID), team2Players: squad(OTHER), innings1: {} },
      { id: 'm2', team1Players: squad(GID), team2Players: squad(OTHER), innings1: {} },
    ];
    const r = aggregateCareer(ms, GID);
    expect(r.matches).toBe(2);
    expect(r.batting.matches).toBe(2);
    expect(r.bowling.matches).toBe(2);
    expect(r.batting.innings).toBe(0);
    expect(r.battedInMatches).toBe(0);
  });

  it('ignores matches the player was not part of', () => {
    const ms = [{ id: 'm1', team1Players: squad(OTHER), team2Players: squad(OTHER), innings1: {} }];
    expect(aggregateCareer(ms, GID).matches).toBe(0);
  });

  it('aggregates batting across both innings and excludes other players', () => {
    const ms = [{
      id: 'm1', team1Players: squad(GID), team2Players: squad(OTHER),
      innings1: { batsmanStats: { a: bat(GID, { runs: 30, balls: 20, fours: 4, sixes: 1, isOut: true }), b: bat(OTHER, { runs: 99, balls: 50 }) } },
      innings2: { batsmanStats: { c: bat(GID, { runs: 12, balls: 10, isOut: false }) } },
    }];
    const r = aggregateCareer(ms, GID).batting;
    expect(r.innings).toBe(2);
    expect(r.runs).toBe(42);
    expect(r.balls).toBe(30);
    expect(r.fours).toBe(4);
    expect(r.sixes).toBe(1);
    expect(r.highScore).toBe(30);
    expect(r.notOut).toBe(1);
    // 42 runs for 1 dismissal
    expect(r.average).toBe(42);
    expect(r.strikeRate).toBe(140);
  });

  it('averages by dismissals, not innings, and reports 0 when never dismissed', () => {
    const ms = [{
      id: 'm1', team1Players: squad(GID),
      innings1: { batsmanStats: { a: bat(GID, { runs: 50, balls: 25, isOut: false }) } },
    }];
    const r = aggregateCareer(ms, GID).batting;
    expect(r.notOut).toBe(1);
    expect(r.average).toBe(0);
  });

  it('counts a duck only when dismissed for zero', () => {
    const ms = [{
      id: 'm1', team1Players: squad(GID),
      innings1: { batsmanStats: { a: bat(GID, { runs: 0, balls: 3, isOut: true }) } },
    }, {
      id: 'm2', team1Players: squad(GID),
      innings1: { batsmanStats: { a: bat(GID, { runs: 0, balls: 1, isOut: false }) } },
    }];
    const r = aggregateCareer(ms, GID).batting;
    expect(r.ducks).toBe(1);
    expect(r.notOut).toBe(1);
  });

  it('bands scores into 25s, 50s and 100s without double counting', () => {
    const mk = (runs: number, id: string) => ({
      id, team1Players: squad(GID),
      innings1: { batsmanStats: { a: bat(GID, { runs, balls: runs, isOut: true }) } },
    });
    const r = aggregateCareer([mk(24, 'a'), mk(25, 'b'), mk(49, 'c'), mk(50, 'd'), mk(99, 'e'), mk(100, 'f')], GID).batting;
    expect(r.twentyFives).toBe(2); // 25, 49
    expect(r.fifties).toBe(2);     // 50, 99
    expect(r.hundreds).toBe(1);    // 100
  });

  it('aggregates bowling and skips a selected bowler who never delivered', () => {
    const ms = [{
      id: 'm1', team1Players: squad(GID),
      innings1: { bowlerStats: { a: bowl(GID, { overs: 4, balls: 0, runs: 24, wickets: 2, maidens: 1, dots: 8 }) } },
    }, {
      id: 'm2', team1Players: squad(GID),
      innings1: { bowlerStats: { a: bowl(GID, { overs: 0, balls: 0, runs: 0, wickets: 0 }) } },
    }];
    const r = aggregateCareer(ms, GID).bowling;
    expect(r.innings).toBe(1);
    expect(r.balls).toBe(24);
    expect(r.runs).toBe(24);
    expect(r.wickets).toBe(2);
    expect(r.maidens).toBe(1);
    expect(r.twoWickets).toBe(1);
    expect(r.fourWickets).toBe(0);
    expect(r.average).toBe(12);      // 24 runs / 2 wickets
    expect(r.economy).toBe(6);       // 24 runs over 4 overs
    expect(r.strikeRate).toBe(12);   // 24 balls / 2 wickets
  });

  it('picks the best bowling figure by wickets then fewest runs', () => {
    const mk = (wickets: number, runs: number, id: string) => ({
      id, team1Players: squad(GID),
      innings1: { bowlerStats: { a: bowl(GID, { overs: 2, runs, wickets }) } },
    });
    expect(aggregateCareer([mk(3, 40, 'a'), mk(3, 12, 'b'), mk(2, 5, 'c')], GID).bowling.bestFigure).toBe('3/12');
    expect(aggregateCareer([mk(0, 30, 'a')], GID).bowling.bestFigure).toBe('0/30');
    expect(aggregateCareer([{ id: 'x', team1Players: squad(GID), innings1: {} }], GID).bowling.bestFigure).toBe('-');
  });

  it('aggregates fielding', () => {
    const ms = [{
      id: 'm1', team1Players: squad(GID),
      innings1: { fieldingStats: { a: field(GID, { catches: 2, runOuts: 1 }), b: field(OTHER, { catches: 5 }) } },
      innings2: { fieldingStats: { c: field(GID, { stumpings: 3 }) } },
    }];
    const r = aggregateCareer(ms, GID).fielding;
    expect(r).toEqual({ catches: 2, stumpings: 3, runOuts: 1 });
  });

  it('excludes Super Over innings from career totals', () => {
    const ms = [{
      id: 'm1', team1Players: squad(GID),
      innings1: { batsmanStats: { a: bat(GID, { runs: 10, balls: 10, isOut: true }) } },
      superOverInnings: { so0_innings1: { batsmanStats: { a: bat(GID, { runs: 99, balls: 6, isOut: true }) } } },
    }];
    expect(aggregateCareer(ms, GID).batting.runs).toBe(10);
  });
});
