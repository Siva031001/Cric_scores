export type BallResult =
  '0' | '1' | '2' | '3' | '4' | '6' | 'W' |
  'WD' | `WD${number}` |
  'NB' | `NB${number}` |
  `B${number}` | `LB${number}` | `PEN${number}`;

export type WicketType =
  'Bowled' | 'Caught' | 'LBW' | 'Run Out' |
  'Stumped' | 'Hit Wicket' | 'Retired';

export type BattingStyle = 'Right Hand' | 'Left Hand';
export type PlayerRole = 'Batter' | 'Bowler' | 'Wicket Keeper' | 'All Rounder';
export type MatchFormat = '6 Overs' | '8 Overs' | '20 Overs' | '50 Overs' | 'Custom';
export type BallType = 'Leather Ball' | 'Tennis Ball' | 'Turf';

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
  teamType?: 'my' | 'other';
}

export interface Ball {
  result: BallResult;
  over: number;
  ball: number;
  batsmanId?: number;
  bowlerId?: number;
  wicketType?: WicketType;
  fielderId?: number;
  fielderName?: string;
  newBatsmanId?: number;
  /** The non-striker at the moment the ball was bowled. Load-bearing: undo
   *  replay and partnership reconstruction both depend on it. */
  nonStrikerIdBefore?: number;
  /** Marker entries that are not deliveries — they record an incoming
   *  batter so a single undo can reverse both the batter and the wicket. */
  type?: 'NEW_BATSMAN';
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
  /** How the batter was dismissed. This — not `wicketType` — is what the
   *  code actually writes and what the scorecard reads. */
  dismissalType?: string;
  /** Fielder credited, stored by display name. 'Skip' means unknown. */
  fielderName?: string;
  /** Links this innings entry to the player's cross-match identity. */
  globalPlayerId?: string | null;
  /** Set when the batter retired; null once they return. */
  retired?: 'RETIRED_HURT' | 'RETIRED_OUT' | null;
  canReturn?: boolean;
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
  globalPlayerId?: string | null;
}

/** Fielding credit, keyed by sanitised display name. */
export interface FieldingStats {
  catches: number;
  stumpings: number;
  runOuts: number;
  displayName: string;
  globalPlayerId?: string | null;
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
  // Keyed `p<playerId>` (see statKey), never the bare number: Firebase turns
  // integer-keyed objects into sparse arrays with null holes.
  batsmanStats: { [key: string]: BatsmanStats };
  bowlerStats: { [key: string]: BowlerStats };
  fieldingStats?: { [key: string]: FieldingStats };
  extras: {
    wides: number;
    noBalls: number;
    byes: number;
    legByes: number;
    /** Penalty runs awarded to this side. */
    penalty: number;
  };
  /** Persisted so a free hit survives a reload and undo replay. */
  freeHit?: boolean;
  latestCommentaryText?: string;
  latestCommentaryTs?: number;
}

export interface Match {
  id: string;
  team1: string;
  team2: string;
  team1Players: Player[];
  team2Players: Player[];
  team1Logo?: string | null;
  team2Logo?: string | null;
  totalOvers: number;
  format?: MatchFormat;
  ballType?: BallType;
  currentInnings: 1 | 2;
  innings1: Innings;
  innings2: Innings;
  status: 'live' | 'paused' | 'completed';
  createdAt: number;
  scorerId: string;
  venue?: string;
  tournamentId?: string;
  tournamentMatchId?: string | null;
  winner?: string;
  tossWinner?: string;
  tossChoice?: string;
  matchDate?: string;
  matchTime?: string;
  playersPerSide?: number;
  /** Live-streaming state, written from StreamingDashboardScreen / ScoringScreen. */
  isLive?: boolean;
  isStreaming?: boolean;
  streamUrl?: string;
  streamSourceType?: 'youtube' | 'rtmp' | null;
  streamPaused?: boolean;
  streamStartedAt?: number;
  streamQuality?: '360p' | '480p' | '720p' | '1080p' | 'auto';
  streamThemeId?: string;
  streamTitle?: string;
  streamDescription?: string;
  commentsEnabled?: boolean;
  /** Latest milestone toast, shown on LiveViewScreen. */
  lastMilestone?: { text: string; playerName: string; ts: number };
  /** AI-generated match summary, shown on ScorecardScreen. */
  summaryText?: string;
  summaryGeneratedAt?: number;
  manOfMatch?: MOMCandidate;
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
  assignedScorerPhone?: string | null;
}

export type TournamentFormatType = 'League' | 'Knockout' | 'Pool + Knockout';
export type KnockoutStage = 'Round of 16' | 'Quarter Final' | 'Semi Final' | 'Final' | 'Third Place Match';

export interface Pool {
  poolId: string;
  poolName: string;
  teamIds: string[]; // TournamentTeam.teamId values
  qualifyCount: 1 | 2 | 4;
  matches: TournamentMatch[];   // NEW: fixtures scoped to this pool only
  standings: TournamentTeam[];  // NEW: pool-only points table, separate from tournament.teams
}

export interface KnockoutFixture {
  id: string;
  stage: KnockoutStage;
  slot: number; // e.g. 1,2,3,4 for QF1-4, used for bracket ordering
  homeTeamName?: string; // resolved team name, or "Winner of QF1" placeholder
  awayTeamName?: string;
  homeSourceFixtureId?: string; // if this slot is fed by a previous knockout match's winner
  awaySourceFixtureId?: string;
  status: 'scheduled' | 'live' | 'completed';
  matchId?: string;
  winner?: string;
}

export interface CaptainInvite {
  teamId: string;
  teamName: string;
  inviteCode: string;
  status: 'pending' | 'submitted' | 'approved';
  submittedPlayers?: any[];
  submittedAt?: number;
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
  tournamentFormat?: TournamentFormatType;
  pools?: Pool[];
  knockoutStartStage?: KnockoutStage;
  includeThirdPlaceMatch?: boolean;
  knockoutFixtures?: KnockoutFixture[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  createdBy: string;
  createdAt: number;
  status: 'upcoming' | 'live' | 'completed';
  captainInvites?: CaptainInvite[];
  scorers?: { [phone: string]: { uid: string; name: string; assignedAt: number } };
  teamLockMode?: 'manual' | 'onStart' | 'afterLeague' | 'beforeKnockout';
  teamsLocked?: boolean;
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

export interface PlayerMaster {
  playerId: string;
  name: string;
  phoneNumber: string | null;
  accountId: string | null;
  playerType: 'REGISTERED' | 'GUEST';
  createdBy: string;
  createdAt: number;
  linkedAt?: number;
}

export interface MOMCandidate {
  name: string;
  teamName: string;
  score: number;
  battingLine: string;
  bowlingLine: string;
  fieldingLine: string;
}