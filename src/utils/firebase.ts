import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Match, Tournament, Team, Player, PlayerMaster, MOMCandidate, BallResult } from '../types/cricket';
// ── Rules engine ─────────────────────────────────────────────
// Tournament points, NRR and tie-breaking are engine concerns. This module
// only reads and writes; it never recomputes a cricket rule itself.
import {
  applyMatchToStandings,
  poolQualifiers as enginePoolQualifiers,
  sortStandings,
  DEFAULT_TIE_BREAKERS,
} from '../engine';
import type {
  CompetitionRules,
  MatchOutcome,
  NRRInput,
  StandingRow,
  TieBreaker,
} from '../engine';

// ── Name Formatting Helpers ──────────────────────────────────
export const toInitCap = (str: string): string => {
  if (!str) return '';
  return str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};
export const formatTeamName = (name: string): string => {
  if (!name) return '';
  const trimmed = name.trim();
  if (/^[a-zA-Z]{1,4}$/.test(trimmed)) return trimmed.toUpperCase();
  return toInitCap(trimmed);
};
export const formatPlayerName = (name: string): string => toInitCap(name.trim());

// ── Unique ID generator with collision retry ────────────────
const generateUniqueId = async (path: string, makeId: () => string, maxAttempts = 5): Promise<string> => {
  for (let i = 0; i < maxAttempts; i++) {
    const candidate = makeId();
    const snap = await database().ref(path + '/' + candidate).once('value');
    if (!snap.exists()) return candidate;
  }
  throw new Error(`Failed to generate unique ID for ${path} after ${maxAttempts} attempts`);
};

export const signInAnonymously = async () => {
  const userCredential = await auth().signInAnonymously();
  return userCredential.user;
};

export const getCurrentUser = () => auth().currentUser;

export const saveUserProfile = async (profile) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await database().ref(`users/${user.uid}/profile`).update({
    ...profile, uid: user.uid, updatedAt: Date.now(),
  });
};

export const getUserProfile = async () => {
  const user = getCurrentUser();
  if (!user) return null;
  const snap = await database().ref(`users/${user.uid}/profile`).once('value');
  return snap.val();
};

export const isMatchOrganizer = (match) => {
  const user = getCurrentUser();
  return !!user && match?.scorerId === user.uid;
};

export const subscribeToProfile = (callback) => {
  const user = getCurrentUser();
  if (!user) return () => {};
  const ref = database().ref(`users/${user.uid}/profile`);
  const listener = (snap) => callback(snap.val());
  ref.on('value', listener);
  return () => ref.off('value', listener);
};

// Keys mirrored from pinAuthService.ts's logoutLocalSession — must stay in
// sync with LOCAL_SESSION_KEY / LOCAL_PHONE_KEY there.
const LOCAL_SESSION_KEY = 'cricketscorer_session_id';
const LOCAL_PHONE_KEY = 'cricketscorer_phone';

export const deleteAccount = async () => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  // Phone-based accounts use a stable uid of "phone_" + phoneKey (see
  // assignScorer / isAssignedScorer) — without also removing the
  // pinAuth/{phone} credential record, the old PIN can still log back into
  // this "deleted" account since a new account creation reuses the same uid.
  if (user.uid.startsWith('phone_')) {
    const phoneKey = user.uid.slice('phone_'.length);
    await database().ref(`pinAuth/${phoneKey}`).remove();
  }
  await database().ref(`users/${user.uid}`).remove();
  await user.delete();
  // Clear this device's local session pointer too, so it can't keep acting
  // as if it's still logged in to the now-deleted account.
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
  await AsyncStorage.removeItem(LOCAL_PHONE_KEY);
};

export const saveTeam = async (teamData: any): Promise<string> => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const existing = await getMyTeams();
  const duplicate = existing.find(t => t.name?.toLowerCase() === teamData.name?.toLowerCase());
  if (duplicate) throw new Error('Team already exists: ' + teamData.name);
  const teamId = await generateUniqueId('users/' + user.uid + '/teams', () => Math.random().toString(36).substring(2, 8).toUpperCase());
  await database().ref(`users/${user.uid}/teams/${teamId}`).set({
    ...teamData,
    id: teamId,
    createdBy: user.uid,
    createdAt: Date.now(),
    teamType: teamData.teamType ?? 'my',
  });
  return teamId;
};

export const updateTeam = async (teamId, data) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await database().ref(`users/${user.uid}/teams/${teamId}`).update(data);
};

export const getMyTeams = async () => {
  const user = getCurrentUser();
  if (!user) return [];
  const snap = await database().ref(`users/${user.uid}/teams`).once('value');
  const teams = [];
  snap.forEach(child => { teams.push(child.val()); return undefined; });
  return teams;
};

export const findTeamByName = async (name: string): Promise<Team | null> => {
  const teams = await getMyTeams();
  return teams.find(t => t?.name?.toLowerCase?.() === name.toLowerCase()) ?? null;
};

export const deleteTeam = async (teamId) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await database().ref(`users/${user.uid}/teams/${teamId}`).remove();
};

export const createMatch = async (matchData: any): Promise<string> => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const matchId = await generateUniqueId('matches', () => Math.random().toString(36).substring(2, 8).toUpperCase());
  await database().ref(`matches/${matchId}`).set({
    ...matchData, id: matchId, scorerId: user.uid, createdAt: Date.now(),
    tournamentId: matchData.tournamentId ?? null,
    tournamentMatchId: matchData.tournamentMatchId ?? null,
  });
  await database().ref(`users/${user.uid}/matches/${matchId}`).set(true);

  const allPlayers = [...(matchData.team1Players ?? []), ...(matchData.team2Players ?? [])];
  const playerIndexUpdates: Record<string, boolean> = {};
  allPlayers.forEach((p: any) => {
    if (p?.globalPlayerId) {
      playerIndexUpdates[`playerMatchIndex/${p.globalPlayerId}/${matchId}`] = true;
    }
  });
  if (Object.keys(playerIndexUpdates).length > 0) {
    await database().ref().update(playerIndexUpdates);
  }

  return matchId;
};

export const getMatchById = async (matchId) => {
  const snap = await database().ref(`matches/${matchId}`).once('value');
  return snap.val();
};

export const updateMatch = async (matchId, data) => {
  await database().ref(`matches/${matchId}`).update(data);
};

export const subscribeToMatch = (matchId: string, callback: (data: Match) => void, onError?: (error: Error) => void) => {
  const ref = database().ref(`matches/${matchId}`);
  const listener = (snap: any) => callback(snap.val());
  const errorListener = (error: any) => {
    if (onError) onError(error);
    else console.error('subscribeToMatch error:', error);
  };
  ref.on('value', listener, errorListener);
  return () => ref.off('value', listener);
};

// ── getMatchHistory — parallel reads via Promise.all ────────
export const getMatchHistory = async () => {
  // Prefer the linked player's own participation index, so History shows
  // only matches this phone number / App ID actually played in.
  const linkedPlayerId = await getMyLinkedPlayerId();
  if (linkedPlayerId) {
    return await getMatchesForPlayer(linkedPlayerId);
  }

  // Fallback for accounts with no linked player record yet — old scorer-scoped behavior.
  const user = getCurrentUser();
  if (!user) return [];
  const indexSnap = await database().ref(`users/${user.uid}/matches`).once('value');
  const matchIds: string[] = [];
  indexSnap.forEach(child => { matchIds.push(child.key as string); return undefined; });
  const ids = matchIds.reverse().slice(0, 50);
  if (ids.length === 0) return [];
  const snaps = await Promise.all(
    ids.map(id => database().ref(`matches/${id}`).once('value'))
  );
  return snaps.map(s => s.val()).filter(Boolean);
};

// ── getLiveMatches — parallel reads via Promise.all ─────────
export const getLiveMatches = async () => {
  const user = getCurrentUser();
  if (!user) return [];
  const indexSnap = await database().ref(`users/${user.uid}/matches`).once('value');
  const matchIds: string[] = [];
  indexSnap.forEach(child => { matchIds.push(child.key as string); return undefined; });
  const ids = matchIds.reverse().slice(0, 20);
  if (ids.length === 0) return [];
  const snaps = await Promise.all(
    ids.map(id => database().ref(`matches/${id}`).once('value'))
  );
  return snaps.map(s => s.val()).filter(m => m && m.status === 'live');
};

export const createTournament = async (data) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  // Collision-check the generated id before using it — the id space
  // (36^6 ≈ 2.2 billion) makes a collision rare but not impossible, and an
  // unchecked collision would silently overwrite someone else's tournament.
  let id;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = Math.random().toString(36).substring(2, 8).toUpperCase();
    const exists = (await database().ref(`tournaments/${candidate}`).once('value')).exists();
    if (!exists) { id = candidate; break; }
  }
  if (!id) throw new Error('Could not generate a unique tournament id, please try again');
  await database().ref(`tournaments/${id}`).set({
    ...data, id, createdBy: user.uid, createdAt: Date.now(),
  });
  await database().ref(`users/${user.uid}/tournaments/${id}`).set(true);
  return id;
};

// ───────────────────────────────────────────────────────────
// TOURNAMENT POOLS
// ───────────────────────────────────────────────────────────

// Creates a new pool with a custom name. Does NOT assign teams yet —
// use assignTeamToPool for that, so teams can be moved between pools
// without recreating the pool.
export const createPool = async (tournamentId, poolName, qualifyCount = 2) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  const poolId = 'pool_' + Math.random().toString(36).substring(2, 8);
  const newPool = {
    poolId,
    poolName: poolName.trim(),
    teamIds: [],
    qualifyCount,
    matches: [],
    standings: [],
  };
  const pools = [...(tournament.pools ?? []), newPool];
  await database().ref(`tournaments/${tournamentId}`).update({ pools });
  return poolId;
};

export const deletePool = async (tournamentId, poolId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const pools = (tournament.pools ?? []).filter((p) => p.poolId !== poolId);
  await database().ref(`tournaments/${tournamentId}`).update({ pools });
};

export const renamePool = async (tournamentId: string, poolId: string, newName: string): Promise<void> => {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error('Pool name cannot be empty');
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const pools = (tournament.pools ?? []).map((p: any) =>
    p.poolId === poolId ? { ...p, poolName: trimmed } : p
  );
  await database().ref(`tournaments/${tournamentId}`).update({ pools });
};

// Assigns a team to a pool. A team can only be in ONE pool at a time —
// this function removes it from any other pool first, so re-assigning
// (e.g. moving a team from Pool A to Pool B) is a single call, not a
// separate "remove then add".
export const assignTeamToPool = async (tournamentId, poolId, teamId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  const team = (tournament.teams ?? []).find((t) => t.teamId === teamId);
  if (!team) throw new Error('Team not found in this tournament');

  const pools = (tournament.pools ?? []).map((p) => {
    // Remove from any pool that currently has this team
    const withoutTeam = { ...p, teamIds: (p.teamIds ?? []).filter((id) => id !== teamId) };
    if (p.poolId === poolId) {
      // Add to the target pool, and seed its standings entry if missing
      const alreadyIn = (withoutTeam.standings ?? []).some((s) => s.teamId === teamId);
      return {
        ...withoutTeam,
        teamIds: [...withoutTeam.teamIds, teamId],
        standings: alreadyIn
          ? withoutTeam.standings
          : [...(withoutTeam.standings ?? []), {
              teamId, teamName: team.teamName, played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0,
            }],
      };
    }
    return withoutTeam;
  });

  await database().ref(`tournaments/${tournamentId}`).update({ pools });
};

export const removeTeamFromPool = async (tournamentId, poolId, teamId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const pools = (tournament.pools ?? []).map((p) =>
    p.poolId === poolId
      ? {
          ...p,
          teamIds: (p.teamIds ?? []).filter((id) => id !== teamId),
          standings: (p.standings ?? []).filter((s) => s.teamId !== teamId),
        }
      : p
  );
  await database().ref(`tournaments/${tournamentId}`).update({ pools });
};

// Schedules a match INSIDE a specific pool (separate from tournament.matches,
// which remains for non-pool / overall scheduling in League or Knockout-only
// tournaments).
export const addPoolMatch = async (tournamentId, poolId, matchData) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  const newMatch = {
    id: Date.now().toString(),
    team1: matchData.team1,
    team2: matchData.team2,
    date: matchData.date || 'TBD',
    time: matchData.time || 'TBD',
    venue: matchData.venue || tournament.venue || 'TBD',
    status: 'scheduled',
  };

  const pools = (tournament.pools ?? []).map((p) =>
    p.poolId === poolId ? { ...p, matches: [...(p.matches ?? []), newMatch] } : p
  );
  await database().ref(`tournaments/${tournamentId}`).update({ pools });
  return newMatch.id;
};

export const updateTournament = async (id, data) => {
  await database().ref(`tournaments/${id}`).update(data);
};

export const getMyTournaments = async () => {
  const user = getCurrentUser();
  if (!user) return [];
  const indexSnap = await database().ref(`users/${user.uid}/tournaments`).once('value');
  const ids: string[] = [];
  indexSnap.forEach(child => { ids.push(child.key as string); return undefined; });
  if (ids.length === 0) return [];
  const snaps = await Promise.all(ids.map(id => database().ref(`tournaments/${id}`).once('value')));
  return snaps.map(s => s.val()).filter(Boolean);
};

export const subscribeToTournament = (id, callback) => {
  const ref = database().ref(`tournaments/${id}`);
  const listener = (snap) => callback(snap.val());
  ref.on('value', listener);
  return () => ref.off('value', listener);
};

// ───────────────────────────────────────────────────────────
// PLAYER MASTER — registered vs guest player identity system
// ───────────────────────────────────────────────────────────

export const createPlayerMaster = async (name, type, phoneNumber: string | null = null) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const playerId = 'P' + Math.random().toString(36).substring(2, 10).toUpperCase();
  const record = {
    playerId,
    name,
    phoneNumber: phoneNumber ?? null,
    accountId: type === 'registered' ? user.uid : null,
    playerType: type === 'registered' ? 'REGISTERED' : 'GUEST',
    createdBy: user.uid,
    createdAt: Date.now(),
  };
  await database().ref('players/' + playerId).set(record);
  return playerId;
};

export const getMyLinkedPlayerId = async (): Promise<string | null> => {
  const user = getCurrentUser();
  if (!user) return null;
  const snap = await database().ref('players').orderByChild('accountId').equalTo(user.uid).once('value');
  let foundId: string | null = null;
  let count = 0;
  snap.forEach((child: any) => {
    count++;
    if (!foundId) foundId = child.key;
    return undefined;
  });
  if (count > 1) console.warn(`[Data Integrity] Multiple players linked to accountId ${user.uid}; using first match`);
  return foundId;
};

export const retroactivelyLinkGuestPlayers = async (phoneNumber: string): Promise<void> => {
  const key = phoneNumber.replace(/\D/g, '');
  if (!key) return;
  const user = getCurrentUser();
  if (!user) return;
  const snap = await database().ref('players').orderByChild('phoneNumber').equalTo(key).once('value');
  const updates: Record<string, any> = {};
  const guestPlayers: any[] = [];
  snap.forEach((child: any) => {
    const v = child.val();
    if (v?.playerType === 'GUEST' && v?.accountId == null) {
      guestPlayers.push({ id: child.key, ...v });
    }
    return undefined;
  });
  if (guestPlayers.length === 0) return;
  if (guestPlayers.length > 1) {
    console.warn(`[Data Integrity] Multiple GUEST players for phone ${key}; linking only the most recent`);
    guestPlayers.sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }
  const mostRecent = guestPlayers[0];
  updates[mostRecent.id + '/accountId'] = user.uid;
  updates[mostRecent.id + '/playerType'] = 'REGISTERED';
  updates[mostRecent.id + '/linkedAt'] = Date.now();
  await database().ref('players').update(updates);
};

export const ensureMyPlayerLinked = async (displayName, phoneNumber: string | null = null) => {
  const existing = await getMyLinkedPlayerId();
  if (existing) {
    // Backfill phoneNumber if it wasn't stored when this record was first
    // created — without it, phone-lookup during team creation can never
    // find this player's own stats record again.
    if (phoneNumber) {
      const snap = await database().ref('players/' + existing).once('value');
      if (!snap.val()?.phoneNumber) {
        await database().ref('players/' + existing).update({ phoneNumber: phoneNumber.replace(/\D/g, '') });
      }
    }
    return existing;
  }
  return await createPlayerMaster(displayName, 'registered', phoneNumber);
};

export const searchGuestPlayers = async (query) => {
  const snap = await database().ref('players').once('value');
  const results = [];
  const q = query.trim().toLowerCase();
  snap.forEach(child => {
    const v = child.val();
    if (v?.playerType === 'GUEST' && v?.name?.toLowerCase().includes(q)) results.push(v);
    return undefined;
  });
  return results;
};

export const linkPlayerToAccount = async (playerId, phoneNumber = null) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const snap = await database().ref('players/' + playerId).once('value');
  const existing = snap.val();
  if (!existing) throw new Error('Player not found');
  if (existing.accountId) throw new Error('This player is already linked to an account');
  await database().ref('players/' + playerId).update({
    accountId: user.uid,
    playerType: 'REGISTERED',
    phoneNumber: phoneNumber ?? existing.phoneNumber ?? null,
    linkedAt: Date.now(),
  });
};

export const getMatchesForPlayer = async (globalPlayerId: string): Promise<Match[]> => {
  if (!globalPlayerId) return [];
  const indexSnap = await database().ref('playerMatchIndex/' + globalPlayerId).once('value');
  const matchIds: string[] = [];
  indexSnap.forEach((child: any) => { matchIds.push(child.key as string); return undefined; });
  if (matchIds.length === 0) return [];
  const snaps = await Promise.all(matchIds.map(id => database().ref('matches/' + id).once('value')));
  return snaps.map(s => s.val()).filter(Boolean)
    .sort((a: any, b: any) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
};

// ───────────────────────────────────────────────────────────
// PHONE-BASED PLAYER LINKING
// ───────────────────────────────────────────────────────────

export const findAccountByPhone = async (phoneNumber: string) => {
  const key = phoneNumber.replace(/\D/g, '');
  if (!key) return null;
  const snap = await database().ref('pinAuth/' + key).once('value');
  const record = snap.val();
  if (!record) return null;
  return { phoneNumber: key, uid: record.uid ?? null };
};


// Creates (or reuses) a guest player identified by phone number + a
// temporary display name, for use when the phone number has no account yet.
// Storing phoneNumber is mandatory so future registration can retroactively
// link this record via retroactivelyLinkGuestPlayers().
export const createGuestPlayerByPhone = async (phoneNumber: string, displayName: string) => {
  const key = phoneNumber.replace(/\D/g, '');
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  // Reuse an existing guest record for this phone number if one already
  // exists, instead of creating a duplicate Global Player each match.
  const existingSnap = await database().ref('players').orderByChild('phoneNumber').equalTo(key).once('value');
  let existingId: string | null = null;
  existingSnap.forEach((child: any) => {
    if (!existingId && child.val()?.playerType === 'GUEST') existingId = child.key;
    return undefined;
  });
  if (existingId) {
    await database().ref('players/' + existingId).update({ name: displayName });
    return existingId;
  }
  const playerId = 'P' + Math.random().toString(36).substring(2, 10).toUpperCase();
  await database().ref('players/' + playerId).set({
    playerId,
    name: displayName,
    phoneNumber: key,
    accountId: null,
    playerType: 'GUEST',
    createdBy: user.uid,
    createdAt: Date.now(),
  });
  return playerId;
};

// Looks up a player-master record directly by globalPlayerId — used to pull
// registered name/stats context after findAccountByPhone confirms an account.
export const getPlayerMasterByAccountPhone = async (phoneNumber: string) => {
  const key = phoneNumber.replace(/\D/g, '');
  const snap = await database().ref('players').orderByChild('phoneNumber').equalTo(key).once('value');
  let found: any = null;
  snap.forEach((child: any) => {
    const v = child.val();
    if (v?.playerType === 'REGISTERED' && !found) found = { ...v, id: child.key };
    return undefined;
  });
  return found;
};


// ───────────────────────────────────────────────────────────
// TOURNAMENT MATCH COMPLETION
// ───────────────────────────────────────────────────────────
// Points, NRR and bracket progression are computed from the engine's
// STRUCTURED MatchOutcome.
//
// Nothing in this path parses an English result sentence. The previous
// implementation did (`winner.includes(team1 + ' won')`), which awarded
// points to BOTH sides whenever one team name was a suffix of the other
// ("CSK" / "Super CSK"), and recorded a loss for both sides on an
// abandoned match because neither name matched.

/** Converts a stored tournament team row into an engine standings row. */
const toStandingRow = (t: any): StandingRow => ({
  teamId: t.teamId ?? t.teamName ?? '',
  teamName: t.teamName ?? '',
  played: Number(t.played) || 0,
  won: Number(t.won) || 0,
  lost: Number(t.lost) || 0,
  tied: Number(t.tied) || 0,
  noResult: Number(t.noResult) || 0,
  points: Number(t.points) || 0,
  nrrRunsFor: Number(t.nrrRunsFor) || 0,
  nrrOversFor: Number(t.nrrOversFor) || 0,
  nrrRunsAgainst: Number(t.nrrRunsAgainst) || 0,
  nrrOversAgainst: Number(t.nrrOversAgainst) || 0,
  nrr: Number(t.nrr) || 0,
  ...(t.seed != null ? { seed: Number(t.seed) } : {}),
});

/** Merges an updated standings row back onto the stored team object, so
 *  fields the engine does not own (logo, players) are preserved. */
const mergeStandingRow = (original: any, row: StandingRow) => ({
  ...original,
  played: row.played,
  won: row.won,
  lost: row.lost,
  tied: row.tied,
  noResult: row.noResult,
  points: row.points,
  nrrRunsFor: row.nrrRunsFor,
  nrrOversFor: row.nrrOversFor,
  nrrRunsAgainst: row.nrrRunsAgainst,
  nrrOversAgainst: row.nrrOversAgainst,
  nrr: row.nrr,
});

/** The tie-break order this tournament is played under. */
export const tieBreakersFor = (tournament: any): TieBreaker[] => {
  const configured = tournament?.tieBreakerRules;
  return Array.isArray(configured) && configured.length > 0
    ? (configured as TieBreaker[])
    : DEFAULT_TIE_BREAKERS;
};

export interface TournamentSyncInput {
  /** Structured result from the engine. Never a sentence. */
  outcome: MatchOutcome;
  /** Both sides' NRR contribution, or null for a no result / abandonment. */
  nrrInputs: [NRRInput, NRRInput] | null;
  rules: CompetitionRules;
  team1: string;
  team2: string;
  matchId?: string | null;
}

/**
 * Folds a finished match into its tournament: standings, the fixture's
 * status, pool standings where applicable, and knockout progression.
 *
 * Safe to call for any result type. A no result or abandonment updates
 * `played` and points but contributes nothing to run rate.
 */
export const completeTournamentMatch = async (
  tournamentId: string,
  tournamentMatchId: string,
  input: TournamentSyncInput
): Promise<void> => {
  if (!tournamentId || !tournamentMatchId) return;
  if (!input?.outcome || !input.team1 || !input.team2) {
    console.warn('[completeTournamentMatch] called without a structured outcome', input);
    return;
  }
  // A match still in progress has no result to record.
  if (input.outcome.resultType === 'IN_PROGRESS') return;

  const tSnap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = tSnap.val();
  if (!tournament) return;

  // ── Idempotency guard ──
  // Standings accumulate, so applying the same finished match twice would
  // double a team's points and NRR. Undo-then-recomplete, a retry after a
  // dropped connection, or two scorers finishing the same fixture can all
  // trigger a second call. If the fixture is already recorded as completed
  // for this match, there is nothing to add.
  const alreadyRecorded = [
    ...(tournament.matches ?? []),
    ...(tournament.pools ?? []).flatMap((p: any) => p.matches ?? []),
    ...(tournament.knockoutFixtures ?? []),
  ].some(
    (f: any) =>
      f?.id === tournamentMatchId &&
      f?.status === 'completed' &&
      (input.matchId == null || f?.matchId === input.matchId)
  );
  if (alreadyRecorded) {
    // The fixture was already marked completed by a previous call, but that
    // call may have failed AFTER writing "completed" and BEFORE the bracket
    // advance below ran (e.g. a dropped connection), stranding the bracket
    // on a permanently-skipped winner. advanceWinnerInBracket only assigns
    // the same winner name into the next slot, so it's safe to retry here.
    const strandedFixture = (tournament.knockoutFixtures ?? []).find(
      (f: any) => f?.id === tournamentMatchId
    );
    if (strandedFixture?.result?.winnerTeam) {
      await advanceWinnerInBracket(tournamentId, tournamentMatchId, strandedFixture.result.winnerTeam);
    }
    return;
  }

  const { outcome, nrrInputs, rules, team1, team2 } = input;
  const matchId = input.matchId ?? null;
  // Kept for display and backward compatibility only; never parsed back.
  const winnerText = outcome.text;

  const applyTo = (rows: any[]) => {
    const asRows = rows.map(toStandingRow);
    const updated = applyMatchToStandings(asRows, {
      outcome,
      nrrInputs,
      rules,
      team1,
      team2,
    });
    return rows.map((original, i) => mergeStandingRow(original, updated[i]));
  };

  // Overall tournament table. For a Pool + Knockout tournament this is the
  // cross-pool table; each pool keeps its own standings below.
  const updatedTeams = applyTo(tournament.teams ?? []);

  const fixturePatch = {
    status: 'completed',
    matchId,
    winner: winnerText,
    result: outcome,
  };

  // Try the overall fixture list first...
  let matchedInOverall = false;
  const updatedMatches = (tournament.matches ?? []).map((m: any) => {
    if (m.id === tournamentMatchId) {
      matchedInOverall = true;
      return { ...m, ...fixturePatch };
    }
    return m;
  });

  // ...otherwise the fixture belongs to a pool, so update that pool's own
  // fixtures and standings.
  let updatedPools = tournament.pools ?? [];
  if (!matchedInOverall && updatedPools.length > 0) {
    updatedPools = updatedPools.map((p: any) => {
      const found = (p.matches ?? []).some((m: any) => m.id === tournamentMatchId);
      if (!found) return p;
      return {
        ...p,
        matches: p.matches.map((m: any) =>
          m.id === tournamentMatchId ? { ...m, ...fixturePatch } : m
        ),
        standings: applyTo(p.standings ?? []),
      };
    });
  }

  // Third path: a knockout fixture.
  let updatedFixtures = tournament.knockoutFixtures ?? [];
  const isKnockoutFixture =
    !matchedInOverall && updatedFixtures.some((f: any) => f.id === tournamentMatchId);
  if (isKnockoutFixture) {
    updatedFixtures = updatedFixtures.map((f: any) =>
      f.id === tournamentMatchId ? { ...f, ...fixturePatch } : f
    );
  }

  await database().ref(`tournaments/${tournamentId}`).update({
    teams: updatedTeams,
    matches: updatedMatches,
    pools: updatedPools,
    knockoutFixtures: updatedFixtures,
  });

  // Advance the winner into whichever later-round slot was waiting on this
  // fixture. Taken straight from the structured outcome — including a
  // Super Over winner, which the old string test could not recognise.
  if (isKnockoutFixture && outcome.winnerTeam) {
    await advanceWinnerInBracket(tournamentId, tournamentMatchId, outcome.winnerTeam);
  }
};

// ───────────────────────────────────────────────────────────
// AI MATCH SUMMARY — routed through the generateMatchSummary Cloud
// Function so the Gemini API key stays server-side (never embedded in the
// client bundle — see functions/index.js for the prompt + Gemini call).
// ───────────────────────────────────────────────────────────

export const generateMatchSummary = async (matchId, match) => {
  try {
    const functionsMod = require('@react-native-firebase/functions').default;
    const { data } = await functionsMod().httpsCallable('generateMatchSummary')({ matchId, match });
    return data?.summaryText ?? null;
  } catch (e) {
    console.error('AI summary generation failed:', e);
    return null;
  }
};

// ───────────────────────────────────────────────────────────
// MAN OF THE MATCH
// ───────────────────────────────────────────────────────────

// Shared scoring logic used by both functions below
const _buildMOMScores = (match: any) => {
  const scores: Record<string, { name: string; teamName: string; score: number; battingLine: string; bowlingLine: string; fieldingLine: string }> = {};

  const processInnings = (inn: any, battingPlayers: any[], bowlingPlayers: any[], battingTeamName: string, bowlingTeamName: string) => {
    if (!inn) return;

    Object.values(inn.batsmanStats ?? {}).forEach((bs: any) => {
      if (!bs || (bs.balls ?? 0) === 0) return;
      const player = battingPlayers?.find((p: any) => p.id === bs.playerId);
      if (!player) return;
      const key = bs.globalPlayerId ?? ('local:' + bs.playerId + ':' + battingTeamName);
      const runs = bs.runs ?? 0;
      const balls = bs.balls ?? 0;
      const fours = bs.fours ?? 0;
      const sixes = bs.sixes ?? 0;
      const notOut = !bs.isOut;
      const batScore = runs + fours + (sixes * 2) + (runs >= 100 ? 25 : runs >= 50 ? 10 : 0) + (notOut ? 5 : 0);
      const sr = balls > 0 ? ((runs / balls) * 100).toFixed(0) : '0';
      const battingLine = runs + '(' + balls + ') SR:' + sr + ' 4s:' + fours + ' 6s:' + sixes + (notOut ? ' *' : '');
      if (!scores[key]) scores[key] = { name: player.name, teamName: battingTeamName, score: 0, battingLine: '-', bowlingLine: '-', fieldingLine: '-' };
      scores[key].score += batScore;
      scores[key].battingLine = battingLine;
    });

    Object.values(inn.bowlerStats ?? {}).forEach((bw: any) => {
      if (!bw || (bw.overs === 0 && bw.balls === 0)) return;
      const player = bowlingPlayers?.find((p: any) => p.id === bw.playerId);
      if (!player) return;
      const key = bw.globalPlayerId ?? ('local:' + bw.playerId + ':' + bowlingTeamName);
      const wickets = bw.wickets ?? 0;
      const totalOv = (bw.overs ?? 0) + (bw.balls ?? 0) / 6;
      const eco = totalOv > 0 ? bw.runs / totalOv : 99;
      const maidens = bw.maidens ?? 0;
      const bowlScore = (wickets * 15) + (eco < 6 ? 5 : eco < 8 ? 2 : 0) + (maidens * 3);
      const ecoStr = totalOv > 0 ? (bw.runs / totalOv).toFixed(1) : '0.0';
      const bowlingLine = bw.overs + '.' + bw.balls + ' ov, ' + bw.runs + ' runs, ' + wickets + ' wkts, Eco:' + ecoStr;
      if (!scores[key]) scores[key] = { name: player.name, teamName: bowlingTeamName, score: 0, battingLine: '-', bowlingLine: '-', fieldingLine: '-' };
      scores[key].score += bowlScore;
      scores[key].bowlingLine = bowlingLine;
    });

    Object.entries(inn.fieldingStats ?? {}).forEach(([, fs]: any) => {
      if (!fs) return;
      const displayName = fs.displayName ?? 'Unknown';
      // Prefer the stable id (fs.fielderId, set for any record produced
      // since it was added to the engine); fall back to name matching for
      // older records that predate it — mirrors the batting/bowling blocks
      // above, which always had a stable playerId to match on.
      const player = (fs.fielderId != null ? bowlingPlayers?.find((p: any) => p.id === fs.fielderId) : undefined)
        ?? bowlingPlayers?.find((p: any) => p.name === displayName);
      if (!player) return;
      const key = fs.globalPlayerId ?? ('local:' + player.id + ':' + bowlingTeamName);
      const catches = fs.catches ?? 0;
      const stumpings = fs.stumpings ?? 0;
      const runOuts = fs.runOuts ?? 0;
      const fieldScore = (catches * 8) + (stumpings * 8) + (runOuts * 6);
      const parts = [];
      if (catches > 0) parts.push(catches + ' ct');
      if (stumpings > 0) parts.push(stumpings + ' st');
      if (runOuts > 0) parts.push(runOuts + ' ro');
      const fieldingLine = parts.length > 0 ? parts.join(', ') : '-';
      if (!scores[key]) scores[key] = { name: player.name, teamName: bowlingTeamName, score: 0, battingLine: '-', bowlingLine: '-', fieldingLine: '-' };
      scores[key].score += fieldScore;
      if (fieldingLine !== '-') scores[key].fieldingLine = fieldingLine;
    });
  };

  processInnings(match.innings1, match.team1Players, match.team2Players, match.team1, match.team2);
  processInnings(match.innings2, match.team2Players, match.team1Players, match.team2, match.team1);

  return Object.entries(scores).sort(([, a], [, b]) => b.score - a.score);
};

// Returns single top performer (backward-compatible)
export const calculateManOfMatch = (match: any) => {
  const sorted = _buildMOMScores(match);
  if (sorted.length === 0) return null;
  const [, top] = sorted[0];
  return top;
};

// Returns top 2 candidates so the scorer can choose between them.
// If the auto-#1 is from the losing team the scorer can pick #2 instead.
export const calculateManOfMatchCandidates = (match: any) => {
  const sorted = _buildMOMScores(match);
  return sorted.slice(0, 2).map(([, v]) => v);
};

export const saveManOfMatch = async (matchId: string, mom: any) => {
  await database().ref('matches/' + matchId).update({ manOfMatch: mom });
};


// ───────────────────────────────────────────────────────────
// KNOCKOUT BRACKET
// ───────────────────────────────────────────────────────────

const STAGE_ORDER = ['Round of 16', 'Quarter Final', 'Semi Final', 'Final'];

// Returns true only when EVERY pool has finished all its scheduled matches.
// The bracket stays hidden (per requirement) until this is true.
export const arePoolsComplete = (tournament) => {
  const pools = tournament.pools ?? [];
  if (pools.length === 0) return false;
  return pools.every((p) => (p.matches ?? []).length > 0 && (p.matches ?? []).every((m) => m.status === 'completed'));
};

// Returns each pool's qualifiers ranked by points then NRR, labeled with
// their rank (1 = winner, 2 = runner-up, ...) so fixtures can be seeded.
export const getPoolQualifiers = (pool, tournament?: any) => {
  // Ranked by the competition's configured tie-break order. Previously this
  // was hard-coded to points-then-NRR, which is only one of several valid
  // orderings across competitions.
  const rows = (pool.standings ?? []).map(toStandingRow);
  const ranked = enginePoolQualifiers(
    rows,
    pool.qualifyCount ?? rows.length,
    tieBreakersFor(tournament),
    {},
    pool.poolName
  );
  // Re-attach the original stored objects so callers keep any extra fields.
  return ranked.map((r, idx) => {
    const original = (pool.standings ?? []).find((s: any) => s.teamId === r.teamId) ?? {};
    return { ...original, ...r, poolRank: idx + 1, poolName: pool.poolName };
  });
};
// Cross-pool seeding: pairs rank 1 from one pool against rank 2 from the
// next pool (standard "avoid same-pool teams meeting early" seeding),
// wrapping around when qualifier counts are uneven across pools.
const buildSeededPairs = (allQualifiers) => {
  // Group by rank across all pools: [ [rank1 from every pool], [rank2 from every pool], ... ]
  const byRank = {};
  allQualifiers.forEach((q) => {
    if (!byRank[q.poolRank]) byRank[q.poolRank] = [];
    byRank[q.poolRank].push(q);
  });
  const rank1s = byRank[1] ?? [];
  const rank2s = byRank[2] ?? [];
  const rank3PlusFlat = Object.keys(byRank).filter((r) => Number(r) >= 3).flatMap((r) => byRank[r]);

  const pairs = [];
  // Cross-pool seeding: rank1s[i] and rank2s[i] come from the SAME i-th
  // pool (both lists are built by filtering allQualifiers, which preserves
  // pool order) — a fixed rotation by 1 always lands rank1s[i] on a
  // DIFFERENT pool's rank2, for any pool count >= 2. The previous approach
  // greedily picked the first available different-pool candidate one seed
  // at a time with no backtracking, which could — and did, with an odd
  // number of pools — paint itself into a corner where the LAST seed had
  // no cross-pool candidate left, even though a valid overall assignment
  // existed (a rotation always exists as one).
  const n = Math.min(rank1s.length, rank2s.length);
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      pairs.push({ home: rank1s[i], away: rank2s[(i + 1) % n] });
    }
  } else if (n === 1) {
    // Only one pool has both a rank1 and rank2 qualifier — there is no
    // cross-pool option at all, so this pairing is unavoidable.
    pairs.push({ home: rank1s[0], away: rank2s[0] });
  }

  // Any leftover rank1/rank2 (uneven counts beyond what the rotation above
  // covered) plus all rank3+ get paired sequentially.
  const usedIds = new Set(pairs.flatMap((p) => [p.home?.teamId, p.away?.teamId]));
  const leftovers = [...rank1s, ...rank2s, ...rank3PlusFlat].filter((q) => !usedIds.has(q.teamId));
  for (let i = 0; i < leftovers.length; i += 2) {
    if (leftovers[i + 1]) pairs.push({ home: leftovers[i], away: leftovers[i + 1] });
  }
  return pairs;
};

// Auto-generates the knockout bracket from pool qualifiers. Call only after
// arePoolsComplete() is true. Overwrites any existing knockoutFixtures —
// intended as a "start fresh" action, with manual editing available after.
export const autoGenerateKnockoutBracket = async (tournamentId, startStage, includeThirdPlace) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  if (!arePoolsComplete(tournament)) throw new Error('All pool matches must be completed first');

  const allQualifiers = (tournament.pools ?? []).flatMap((p) => getPoolQualifiers(p));
  const pairs = buildSeededPairs(allQualifiers);

  const stageIndex = STAGE_ORDER.indexOf(startStage);
  if (stageIndex === -1) throw new Error('Invalid start stage');

  const fixtures = [];
  // First-round fixtures, seeded from pool qualifiers.
  pairs.forEach((pair, i) => {
    fixtures.push({
      id: 'ko_' + Date.now() + '_' + i,
      stage: startStage,
      slot: i + 1,
      homeTeamName: pair.home?.teamName,
      awayTeamName: pair.away?.teamName,
      homeSourcePool: pair.home?.poolName,
      homeSourcePoolRank: pair.home?.poolRank,
      awaySourcePool: pair.away?.poolName,
      awaySourcePoolRank: pair.away?.poolRank,
      status: 'scheduled',
    });
  });

  // Subsequent rounds — empty placeholder slots that fill in as earlier
  // rounds complete (handled by advanceWinnerInBracket below).
  let prevRoundSize = pairs.length;
  for (let s = stageIndex + 1; s < STAGE_ORDER.length; s++) {
    const roundSize = Math.ceil(prevRoundSize / 2);
    if (roundSize < 1) break;
    for (let i = 0; i < roundSize; i++) {
      fixtures.push({
        id: 'ko_' + Date.now() + '_' + STAGE_ORDER[s] + '_' + i,
        stage: STAGE_ORDER[s],
        slot: i + 1,
        homeSourceFixtureId: fixtures.find((f) => f.stage === STAGE_ORDER[s - 1] && f.slot === i * 2 + 1)?.id,
        awaySourceFixtureId: fixtures.find((f) => f.stage === STAGE_ORDER[s - 1] && f.slot === i * 2 + 2)?.id,
        status: 'scheduled',
      });
    }
    prevRoundSize = roundSize;
    if (roundSize === 1) break;
  }

  if (includeThirdPlace) {
    fixtures.push({
      id: 'ko_thirdplace_' + Date.now(),
      stage: 'Third Place Match',
      slot: 1,
      status: 'scheduled',
    });
  }

  await database().ref(`tournaments/${tournamentId}`).update({
    knockoutFixtures: fixtures,
    knockoutStartStage: startStage,
    includeThirdPlaceMatch: !!includeThirdPlace,
  });
};

// Manual bracket setup — organizer builds fixtures by hand instead of
// auto-generating from pools (e.g. pure Knockout format tournaments).
export const setManualKnockoutFixture = async (tournamentId, fixture) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const existing = tournament.knockoutFixtures ?? [];
  const idx = existing.findIndex((f) => f.id === fixture.id);
  const updated = idx === -1 ? [...existing, fixture] : existing.map((f) => (f.id === fixture.id ? fixture : f));
  await database().ref(`tournaments/${tournamentId}`).update({ knockoutFixtures: updated });
};

// Edits a bracket slot's team assignment — ONLY allowed before that
// fixture's match has started, enforcing "Edit Bracket before knockout
// matches begin" from the requirements.
export const editKnockoutFixtureTeams = async (tournamentId, fixtureId, homeTeamName, awayTeamName) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const fixture = (tournament.knockoutFixtures ?? []).find((f) => f.id === fixtureId);
  if (!fixture) throw new Error('Fixture not found');
  if (fixture.status !== 'scheduled') throw new Error('Cannot edit — this match has already started or completed');

  const updated = (tournament.knockoutFixtures ?? []).map((f) =>
    f.id === fixtureId ? { ...f, homeTeamName, awayTeamName } : f
  );
  await database().ref(`tournaments/${tournamentId}`).update({ knockoutFixtures: updated });
};

// Call after a knockout match completes — pushes the winner's name into
// whichever later-round fixture slot was waiting on this match, resolving
// "Winner of QF1" placeholders into real team names automatically.
export const advanceWinnerInBracket = async (tournamentId, completedFixtureId, winnerTeamName) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  const updated = (tournament.knockoutFixtures ?? []).map((f) => {
    let changed = false;
    let next = { ...f };
    if (f.homeSourceFixtureId === completedFixtureId) { next.homeTeamName = winnerTeamName; changed = true; }
    if (f.awaySourceFixtureId === completedFixtureId) { next.awayTeamName = winnerTeamName; changed = true; }
    return changed ? next : f;
  });
  await database().ref(`tournaments/${tournamentId}`).update({ knockoutFixtures: updated });
};

export const startKnockoutMatch = async (tournamentId, fixtureId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const updated = (tournament.knockoutFixtures ?? []).map((f) =>
    f.id === fixtureId ? { ...f, status: 'live' } : f
  );
  await database().ref(`tournaments/${tournamentId}`).update({ knockoutFixtures: updated });
};

// Links a fixture (in tournament.matches, a pool's matches, or
// knockoutFixtures — wherever it actually lives) back to the real
// matches/{matchId} record once BattingSetupScreen finishes creating it.
// Without this, a fixture is "live" with no matchId at all until the
// match completes, so leaving the setup wizard partway and coming back
// has nothing to resume — Continue either shows "Match not found"
// (knockout) or silently starts a second match for the same fixture
// (league/pool), since match.matchId is undefined either way.
export const attachMatchIdToFixture = async (tournamentId, tournamentMatchId, matchId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) return;

  if ((tournament.matches ?? []).some((m) => m.id === tournamentMatchId)) {
    await database().ref(`tournaments/${tournamentId}`).update({
      matches: (tournament.matches ?? []).map((m) =>
        m.id === tournamentMatchId ? { ...m, status: 'live', matchId } : m
      ),
    });
    return;
  }

  const poolWithMatch = (tournament.pools ?? []).find((p) =>
    (p.matches ?? []).some((m) => m.id === tournamentMatchId)
  );
  if (poolWithMatch) {
    await database().ref(`tournaments/${tournamentId}`).update({
      pools: (tournament.pools ?? []).map((p) =>
        p.poolId === poolWithMatch.poolId
          ? { ...p, matches: (p.matches ?? []).map((m) => m.id === tournamentMatchId ? { ...m, status: 'live', matchId } : m) }
          : p
      ),
    });
    return;
  }

  if ((tournament.knockoutFixtures ?? []).some((f) => f.id === tournamentMatchId)) {
    await database().ref(`tournaments/${tournamentId}`).update({
      knockoutFixtures: (tournament.knockoutFixtures ?? []).map((f) =>
        f.id === tournamentMatchId ? { ...f, status: 'live', matchId } : f
      ),
    });
  }
};

// ───────────────────────────────────────────────────────────
// CAPTAIN INVITES
// ───────────────────────────────────────────────────────────

const generateInviteCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Organizer creates a placeholder team + invite code. The team appears in
// tournament.teams immediately (with 0 players) so it's visible in Teams/
// Matches tabs right away; the captain's later submission just fills in
// the players via approveOrUseSubmittedTeam / auto-approve below.
export const createCaptainInvite = async (tournamentId, teamName) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  const teamId = 'invited_' + Date.now().toString(36);
  const inviteCode = generateInviteCode();

  const newTeam = {
    teamId, teamName: teamName.trim(), players: [],
    played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0,
  };
  const newInvite = { teamId, teamName: teamName.trim(), inviteCode, status: 'pending' };

  await database().ref(`tournaments/${tournamentId}`).update({
    teams: [...(tournament.teams ?? []), newTeam],
    captainInvites: [...(tournament.captainInvites ?? []), newInvite],
  });

  return inviteCode;
};

// Looks up which tournament + team an invite code belongs to — this is
// what the Captain's app screen calls when they open an invite link/enter
// a code, before they've been shown anything about the tournament.
export const resolveInviteCode = async (inviteCode) => {
  const snap = await database().ref('tournaments').orderByChild('createdAt').once('value');
  const children = [];
  snap.forEach((child) => { children.push(child); return undefined; });

  for (const child of children) {
    const t = child.val();
    const invite = (t.captainInvites ?? []).find((inv) => inv.inviteCode === inviteCode);
    if (invite) {
      return { tournamentId: child.key, tournamentName: t.name, teamId: invite.teamId, teamName: invite.teamName, status: invite.status };
    }
  }
  return null;
};

// Captain submits their squad. Auto-applies to the team immediately
// (organizer can still review afterward — see approveCaptainSubmission
// below is optional per the requirement "Organizer can review and approve
// (optional) or directly use the submitted team").
export const submitCaptainTeam = async (tournamentId, teamId, players) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  const updatedTeams = (tournament.teams ?? []).map((t) =>
    t.teamId === teamId ? { ...t, players } : t
  );
  const updatedInvites = (tournament.captainInvites ?? []).map((inv) =>
    inv.teamId === teamId ? { ...inv, status: 'submitted', submittedPlayers: players, submittedAt: Date.now() } : inv
  );

  await database().ref(`tournaments/${tournamentId}`).update({
    teams: updatedTeams,
    captainInvites: updatedInvites,
  });

  // NEW: index this tournament under the captain's OWN account too, so it
  // shows up in their My Tournaments list — not just the organizer's.
  // getMyTournaments() only reads users/{uid}/tournaments, which is
  // otherwise only populated for the organizer at createTournament time.
  const user = getCurrentUser();
  if (user) {
    await database().ref(`users/${user.uid}/tournaments/${tournamentId}`).set(true);
  }
};

// Organizer's optional explicit approval step — marks the invite approved.
// The team's players are already live (set at submission time), so this
// is purely a status/UX marker for the organizer's review workflow.
export const approveCaptainSubmission = async (tournamentId, teamId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const updatedInvites = (tournament.captainInvites ?? []).map((inv) =>
    inv.teamId === teamId ? { ...inv, status: 'approved' } : inv
  );
  await database().ref(`tournaments/${tournamentId}`).update({ captainInvites: updatedInvites });
};

export const deleteTournament = async (tournamentId) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await database().ref(`tournaments/${tournamentId}`).remove();
  await database().ref(`users/${user.uid}/tournaments/${tournamentId}`).remove();
};


// Returns a read-only preview of a tournament for a captain who has an
// invite code but isn't yet a participant — just enough info to orient
// them (name, venue, dates, existing teams + their rosters) without
// exposing organizer-only controls.
export const getTournamentPreview = async (tournamentId) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const t = snap.val();
  if (!t) return null;
  return {
    name: t.name,
    venue: t.venue,
    startDate: t.startDate,
    endDate: t.endDate,
    tournamentFormat: t.tournamentFormat,
    teams: (t.teams ?? []).map((team) => ({
      teamName: team.teamName,
      players: (team.players ?? []).map((p) => ({ name: p.name })),
    })),
  };
};

// ───────────────────────────────────────────────────────────
// TIERED MATCH HISTORY — free tiers vs rewarded-ad-gated tiers
// ───────────────────────────────────────────────────────────

// tier: 'today' | 'week' | 'month60' | 'custom' | 'lifetime'
// Free tiers: 'today', 'week'. Gated tiers: 'month60', 'custom', 'lifetime'
// — the CALLER is responsible for showing the rewarded ad gate BEFORE
// calling this with a gated tier; this function only applies the date
// filter, it doesn't know about ad state.
export const getMatchHistoryTiered = async (tier, customStart, customEnd) => {
  const linkedPlayerId = await getMyLinkedPlayerId();
  const allMatches = linkedPlayerId
    ? await getMatchesForPlayer(linkedPlayerId)
    : await getMatchHistory();

  if (tier === 'lifetime') return allMatches;

  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  let cutoff;
  switch (tier) {
    case 'today': cutoff = now - DAY; break;
    case 'week': cutoff = now - 7 * DAY; break;
    case 'month60': cutoff = now - 60 * DAY; break;
    case 'custom': {
      const start = customStart ? new Date(customStart).getTime() : 0;
      const end = customEnd ? new Date(customEnd).getTime() + DAY : now;
      return allMatches.filter((m) => (m.createdAt ?? 0) >= start && (m.createdAt ?? 0) <= end);
    }
    default: cutoff = now - DAY;
  }
  return allMatches.filter((m) => (m.createdAt ?? 0) >= cutoff);
};

// ───────────────────────────────────────────────────────────
// ROLES: Organizer / Captain / Scorer
// ───────────────────────────────────────────────────────────

export const getMyTournamentRole = (tournament) => {
  const user = getCurrentUser();
  if (!user) return null;
  if (tournament.createdBy === user.uid) return 'organizer';
  const scorerList = Object.values(tournament.scorers ?? {}) as Array<{ uid?: string }>;
  const isScorer = scorerList.some((s) => s.uid === user.uid);
  if (isScorer) return 'scorer';
  const isCaptain = (tournament.captainInvites ?? []).some(
    (inv) => inv.status !== 'pending' && tournament.teams?.some((t) => t.teamId === inv.teamId)
  );
  // Note: this checks "is ANY captain invite fulfilled" as a coarse signal;
  // for precise "is THIS user the captain of THIS team," compare against
  // the invite's linked account — see isMyAssignedTeam below for that.
  return isCaptain ? 'captain' : null;
};

// Precise check: does this specific team belong to the currently signed-in
// captain? Compares the team's captain-invite submission against my own
// linked player/account, since captainInvites don't store accountId
// directly — they're resolved via the phone number used to submit.
export const isMyAssignedTeam = async (tournament, teamId) => {
  const user = getCurrentUser();
  if (!user) return false;
  const myPlayerId = await getMyLinkedPlayerId();
  if (!myPlayerId) return false;
  const team = (tournament.teams ?? []).find((t) => t.teamId === teamId);
  if (!team) return false;
  return (team.players ?? []).some((p) => p.globalPlayerId === myPlayerId && p.isCaptain);
};

// ───────────────────────────────────────────────────────────
// SCORER ASSIGNMENT
// ───────────────────────────────────────────────────────────

export const assignScorer = async (tournamentId, phone, name) => {
  const key = phone.replace(/\D/g, '');
  const stableUid = 'phone_' + key;
  await database().ref(`tournaments/${tournamentId}/scorers/${key}`).set({
    uid: stableUid,
    name: name || key,
    assignedAt: Date.now(),
  });
};

export const removeScorer = async (tournamentId, phone) => {
  const key = phone.replace(/\D/g, '');
  await database().ref(`tournaments/${tournamentId}/scorers/${key}`).remove();
};

export const isAssignedScorer = (tournament) => {
  const user = getCurrentUser();
  if (!user) return false;
  const scorerList = Object.values(tournament.scorers ?? {}) as Array<{ uid?: string }>;
  return scorerList.some((s) => s.uid === user.uid);
};

// ───────────────────────────────────────────────────────────
// TEAM LOCK
// ───────────────────────────────────────────────────────────

export const setTeamLockMode = async (tournamentId, mode) => {
  await database().ref(`tournaments/${tournamentId}`).update({ teamLockMode: mode });
};

export const setTeamsLocked = async (tournamentId, locked) => {
  await database().ref(`tournaments/${tournamentId}`).update({ teamsLocked: locked });
};

// Central check used before any captain-side player edit — returns true if
// the tournament's current teamLockMode+state means rosters can't be
// changed anymore.
export const areTeamsLockedNow = (tournament) => {
  if (tournament.teamsLocked) return true; // manual lock always wins
  const mode = tournament.teamLockMode;
  if (mode === 'onStart') return tournament.status === 'live' || tournament.status === 'completed';
  if (mode === 'afterLeague') {
    // "League stage" here means all pool matches complete (Pool+Knockout)
    // or, for a plain League format, treat as equivalent to onStart.
    return tournament.tournamentFormat === 'Pool + Knockout'
      ? arePoolsComplete(tournament)
      : (tournament.status === 'live' || tournament.status === 'completed');
  }
  if (mode === 'beforeKnockout') return (tournament.knockoutFixtures ?? []).length > 0;
  return false; // 'manual' mode with teamsLocked=false, or no mode set
};

// ───────────────────────────────────────────────────────────
// MATCH ASSIGNMENT — only the assigned scorer can score a given match
// ───────────────────────────────────────────────────────────

// Works for a fixture from any of the three sources — the overall
// tournament.matches list, a pool's matches, or knockoutFixtures — since
// pool/knockout fixtures reuse this same assign-scorer flow too.
export const assignScorerToMatch = async (tournamentId, matchId, phone) => {
  const key = phone ? phone.replace(/\D/g, '') : null;
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');

  if ((tournament.matches ?? []).some((m) => m.id === matchId)) {
    const updatedMatches = (tournament.matches ?? []).map((m) =>
      m.id === matchId ? { ...m, assignedScorerPhone: key } : m
    );
    await database().ref(`tournaments/${tournamentId}`).update({ matches: updatedMatches });
    return;
  }

  const poolWithMatch = (tournament.pools ?? []).find((p) => (p.matches ?? []).some((m) => m.id === matchId));
  if (poolWithMatch) {
    const updatedPools = (tournament.pools ?? []).map((p) =>
      p.poolId === poolWithMatch.poolId
        ? { ...p, matches: (p.matches ?? []).map((m) => m.id === matchId ? { ...m, assignedScorerPhone: key } : m) }
        : p
    );
    await database().ref(`tournaments/${tournamentId}`).update({ pools: updatedPools });
    return;
  }

  if ((tournament.knockoutFixtures ?? []).some((f) => f.id === matchId)) {
    const updatedFixtures = (tournament.knockoutFixtures ?? []).map((f) =>
      f.id === matchId ? { ...f, assignedScorerPhone: key } : f
    );
    await database().ref(`tournaments/${tournamentId}`).update({ knockoutFixtures: updatedFixtures });
  }
};

// True if the current signed-in user is allowed to score this specific
// match: the organizer always can; a scorer only if THIS match is
// specifically assigned to their phone. A match with no scorer assigned
// yet is organizer-only — it does NOT fall open to any signed-in user.
export const canScoreThisMatch = (tournament, match) => {
  const user = getCurrentUser();
  if (!user) return false;
  if (tournament.createdBy === user.uid) return true;
  if (!match.assignedScorerPhone) return false; // unassigned matches are organizer-only until a scorer is assigned
  const stableUidForAssigned = 'phone_' + match.assignedScorerPhone;
  return user.uid === stableUidForAssigned;
};

// ───────────────────────────────────────────────────────────
// TEAM REGISTRATION STATUS / PROGRESS
// ───────────────────────────────────────────────────────────

// Returns one of: 'pending' | 'captainJoined' | 'playersAdded' | 'complete' | 'locked'
export const getTeamRegistrationStatus = (tournament, team) => {
  if (tournament.teamsLocked) return 'locked';
  const invite = (tournament.captainInvites ?? []).find((inv) => inv.teamId === team.teamId);
  const playerCount = (team.players ?? []).length;
  if (!invite) {
    // Team was added directly by organizer (no captain invite flow) —
    // judge completeness purely by player count.
    return playerCount >= 11 ? 'complete' : (playerCount > 0 ? 'playersAdded' : 'pending');
  }
  if (invite.status === 'pending') return 'pending';
  if (playerCount >= 11) return 'complete';
  return 'playersAdded'; // captain joined and started adding, but <11 so far
};

export const getTeamProgressLabel = (team) => {
  const count = (team.players ?? []).length;
  return `${count} / 11 players`;
};

// ───────────────────────────────────────────────────────────
// PUBLIC TOURNAMENT DISCOVERY
// ───────────────────────────────────────────────────────────

export const getPublicTournaments = async () => {
  const snap = await database().ref('tournaments').orderByChild('createdAt').once('value');
  const list = [];
  snap.forEach((child) => {
    list.push({ id: child.key, ...child.val() });
    return undefined;
  });
  // Priority: Live > Upcoming > Completed, most recent first within each group.
  const priority = (t) => (t.status === 'live' ? 0 : t.status === 'upcoming' ? 1 : 2);
  return list.sort((a, b) => {
    const pa = priority(a), pb = priority(b);
    if (pa !== pb) return pa - pb;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
};

export const searchPublicTournaments = (tournaments, query) => {
  const q = query.trim().toLowerCase();
  if (!q) return tournaments;
  return tournaments.filter((t) =>
    (t.name ?? '').toLowerCase().includes(q) ||
    (t.organisationName ?? '').toLowerCase().includes(q) ||
    (t.venue ?? '').toLowerCase().includes(q)
  );
};

// ───────────────────────────────────────────────────────────
// DATE-BASED TOURNAMENT STATUS (Home page display only)
// ───────────────────────────────────────────────────────────
// This is additive — it does NOT replace tournament.status, which is
// still used elsewhere (bracket gating, organizer-set match state, etc.).
// It exists purely to answer "should this show on the Home carousel,
// and as Live or Upcoming" based on actual dates, per spec Section 20/21.

const parseTournamentDate = (dateStr) => {
  if (!dateStr) return null;
  // Tournament dates are entered as DD/MM/YYYY throughout the app.
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (!day || !month || !year) return null;
  return new Date(year, month - 1, day);
};

export const getTournamentDisplayStatus = (tournament) => {
  const start = parseTournamentDate(tournament.startDate);
  const end = parseTournamentDate(tournament.endDate);
  if (!start || !end) return tournament.status ?? 'upcoming'; // fallback if dates are malformed/missing

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999); // inclusive through the full end date

  if (now < start) return 'upcoming';
  if (now <= end) return 'live';
  return 'completed';
};

// Home carousel: only Live + Upcoming, sorted Live first. Search and
// MyTournaments/organizer views are unaffected — they keep using
// getPublicTournaments() directly, unfiltered.
export const getHomePageTournaments = (tournaments) => {
  return tournaments
    .filter((t) => getTournamentDisplayStatus(t) !== 'completed')
    .sort((a, b) => {
      const pa = getTournamentDisplayStatus(a) === 'live' ? 0 : 1;
      const pb = getTournamentDisplayStatus(b) === 'live' ? 0 : 1;
      return pa - pb;
    });
};

// ───────────────────────────────────────────────────────────
// DEFAULT TEST TEAM — a single, shared, non-owned fallback opponent
// ───────────────────────────────────────────────────────────
const TEST_TEAM_ID = 'test-team-default';

export const getOrCreateTestTeam = async () => {
  const snap = await database().ref(`teams/${TEST_TEAM_ID}`).once('value');
  if (snap.exists()) return snap.val();

  const testTeam = {
    id: TEST_TEAM_ID,
    name: 'Test Team',
    logo: null,
    isTestTeam: true, // never treated as "my team"; never migrated/linked to any real account
    ownerId: null,
    players: Array.from({ length: 12 }, (_, i) => ({
      id: i,
      name: `Player ${i + 1}`,
      // Deliberately no phoneNumber and no globalPlayerId — these players
      // must never be linkable to a real phone-based account, so they can
      // never pollute a real user's My Matches / Match History / stats.
      playerType: 'guest',
      globalPlayerId: null,
    })),
    createdAt: Date.now(),
  };
  await database().ref(`teams/${TEST_TEAM_ID}`).set(testTeam);
  return testTeam;
};

// ───────────────────────────────────────────────────────────
// STORAGE — shared upload helper for locally-picked images
// ───────────────────────────────────────────────────────────

// Uploads a local file (e.g. from react-native-image-picker) to Firebase
// Storage and returns its public download URL. Used by screens that let a
// user pick a profile photo or team logo, so the DB stores a stable
// https:// URL instead of a device-local file:// URI that breaks on other
// devices / after the picked file is cleaned up.
export const uploadLocalImageToStorage = async (localUri: string, storagePath: string): Promise<string> => {
  const storageMod = require('@react-native-firebase/storage').default;
  const ref = storageMod().ref(storagePath);
  await ref.putFile(localUri);
  return await ref.getDownloadURL();
};