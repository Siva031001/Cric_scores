import { Player, Team } from '../types/cricket';

// A stand-in opponent for when the real team isn't known yet at match
// creation time — purely a client-side constant, never written to Firebase
// as a real team. Its players carry NO globalPlayerId, which is the single
// thing every stats aggregation (playerMatchIndex, career stats, team
// rankings) keys off — so this team and its placeholder players are
// invisible to all of that by construction, without needing any special
// case in the scoring/stats code itself.
export const DEFAULT_TEAM_ID = 'DEFAULT_TEAM';

const DEFAULT_PLAYERS: Player[] = Array.from({ length: 11 }, (_, i) => ({
  id: i,
  name: `Player ${i + 1}`,
  role: 'Batter',
  battingStyle: 'Right Hand',
  bowlingStyle: '',
  isCaptain: i === 0,
  isWicketKeeper: i === 1,
  phoneNumber: null,
  playerType: 'guest',
  globalPlayerId: null,
}));

export const DEFAULT_TEAM: Team = {
  id: DEFAULT_TEAM_ID,
  name: 'TBD Opponent',
  players: DEFAULT_PLAYERS,
  createdAt: 0,
  createdBy: 'system',
  teamType: 'other',
};

export const isDefaultTeam = (teamOrId: { id?: string } | string | null | undefined): boolean =>
  (typeof teamOrId === 'string' ? teamOrId : teamOrId?.id) === DEFAULT_TEAM_ID;
