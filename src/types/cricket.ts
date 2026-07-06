export type BallResult =
  '0' | '1' | '2' | '3' | '4' | '6' | 'W' |
  'WD' | 'WD2' | 'WD3' | 'WD4' |
  'NB' | 'NB2' | 'NB3' | 'NB4' | 'NB6' |
  'B1' | 'B2' | 'B3' | 'B4' |
  'LB1' | 'LB2' | 'LB3' | 'LB4';

export type WicketType =
  'Bowled' | 'Caught' | 'LBW' | 'Run Out' |
  'Stumped' | 'Hit Wicket' | 'Retired';

export type BattingStyle = 'Right Hand' | 'Left Hand';
export type PlayerRole = 'Batter' | 'Bowler' | 'Wicket Keeper' | 'All Rounder';
export type MatchFormat = '6 Overs' | '8 Overs' | '20 Overs' | '50 Overs' | 'Custom';
export type BallType = 'Leather Ball' | 'Tennis Ball';

export interface Player {
  id: number;
  name: string;
  role?: PlayerRole;
  battingStyle?: BattingStyle;
  bowlingStyle?: string;
  isCaptain?: boolean;
  isWicketKeeper?: boolean;
  phoneNumber?: string | null;
  playerType?: 'registered' | 'guest';
  globalPlayerId?: string | null;
}

export interface Team {
  id: string;
  name: string;
  logo?: string;
  players: Player[];
  createdAt: number;
  createdBy: string;
}

export interface Ball {
  result: BallResult;
  over: number;
  ball: number;
  batsmanId?: number;
  bowlerId?: number;
  wicketType?: WicketType;
  fielderId?: number;
  newBatsmanId?: number;
}

export interface BatsmanStats {
  playerId: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  isOut: boolean;
  wicketType?: WicketType;
  bowlerId?: number;
  fielderId?: number;
  dots?: number;
}

export interface BowlerStats {
  playerId: number;
  overs: number;
  balls: number;
  runs: number;
  wickets: number;
  wides: number;
  noBalls: number;
  maidens: number;
  dots: number;
}

export interface Innings {
  runs: number;
  wickets: number;
  overs: number;
  balls: number;
  ballHistory: Ball[];
  strikerId: number;
  nonStrikerId: number;
  currentBowlerId: number;
  batsmanStats: { [key: number]: BatsmanStats };
  bowlerStats: { [key: number]: BowlerStats };
  extras: {
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
  };
}

export interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Players: Player[];
  team2Players: Player[];
  totalOvers: number;
  format?: MatchFormat;
  ballType?: BallType;
  currentInnings: 1 | 2;
  innings1: Innings;
  innings2: Innings;
  status: 'live' | 'completed';
  createdAt: number;
  scorerId: string;
  venue?: string;
  tournamentId?: string;
  winner?: string;
  tossWinner?: string;
  tossChoice?: string;
  matchDate?: string;
  matchTime?: string;
}

export interface TournamentTeam {
  teamId: string;
  teamName: string;
  logo?: string;
  players?: any[];
  played: number;
  won: number;
  lost: number;
  tied: number;
  nrr: number;
  points: number;
}

export interface TournamentMatch {
  id: string;
  team1: string;
  team2: string;
  date: string;
  time: string;
  venue: string;
  status: 'scheduled' | 'live' | 'completed';
  matchId?: string;
  result?: string;
}

export interface Tournament {
  id: string;
  name: string;
  organisationName: string;
  venue: string;
  startDate: string;
  endDate: string;
  ballType: BallType;
  format?: string;
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  createdBy: string;
  createdAt: number;
  status: 'upcoming' | 'live' | 'completed';
}

export interface UserProfile {
  uid: string;
  name: string;
  photo?: string;
  mobile?: string;
  email?: string;
  role?: PlayerRole;
  battingStyle?: BattingStyle;
  bowlingStyle?: string;
  country?: string;
  createdAt?: number;
}

export interface CareerBattingStats {
  matches: number;
  innings: number;
  runs: number;
  balls: number;
  highScore: number;
  average: number;
  strikeRate: number;
  notOut: number;
  ducks: number;
  hundreds: number;
  fifties: number;
  twentyFives: number;
  sixes: number;
  fours: number;
}

export interface CareerBowlingStats {
  matches: number;
  innings: number;
  balls: number;
  dots: number;
  runs: number;
  wickets: number;
  maidens: number;
  average: number;
  economy: number;
  bestFigure: string;
  strikeRate: number;
  twoWickets: number;
  fourWickets: number;
}

export interface CareerFieldingStats {
  catches: number;
  stumpings: number;
  runOuts: number;
}