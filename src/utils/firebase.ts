// @ts-nocheck

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
// ─────────────────────────────────────────────────────────────
import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';

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

export const subscribeToProfile = (callback) => {
  const user = getCurrentUser();
  if (!user) return () => {};
  const ref = database().ref(`users/${user.uid}/profile`);
  const listener = (snap) => callback(snap.val());
  ref.on('value', listener);
  return () => ref.off('value', listener);
};

export const deleteAccount = async () => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await database().ref(`users/${user.uid}`).remove();
  await user.delete();
};

export const saveTeam = async (teamData) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const existing = await getMyTeams();
  const duplicate = existing.find(t => t.name?.toLowerCase() === teamData.name?.toLowerCase());
  if (duplicate) throw new Error('Team already exists: ' + teamData.name);
  const teamId = Math.random().toString(36).substring(2, 8).toUpperCase();
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
  snap.forEach(child => teams.push(child.val()));
  return teams;
};

export const findTeamByName = async (name) => {
  const teams = await getMyTeams();
  return teams.find(t => t.name.toLowerCase() === name.toLowerCase()) ?? null;
};

export const deleteTeam = async (teamId) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  await database().ref(`users/${user.uid}/teams/${teamId}`).remove();
};

export const createMatch = async (matchData) => {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  const matchId = Math.random().toString(36).substring(2, 8).toUpperCase();
  await database().ref(`matches/${matchId}`).set({
    ...matchData, id: matchId, scorerId: user.uid, createdAt: Date.now(),
    tournamentId: matchData.tournamentId ?? null,
    tournamentMatchId: matchData.tournamentMatchId ?? null,
  });
  await database().ref(`users/${user.uid}/matches/${matchId}`).set(true);

  // NEW: index this match under every participating player's globalPlayerId,
  // so each player's own My Matches / Match History can find it — not just
  // the account that happened to score it.
  const allPlayers = [...(matchData.team1Players ?? []), ...(matchData.team2Players ?? [])];
  const playerIndexUpdates = {};
  allPlayers.forEach((p) => {
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

export const subscribeToMatch = (matchId, callback) => {
  const ref = database().ref(`matches/${matchId}`);
  const listener = (snap) => callback(snap.val());
  ref.on('value', listener);
  return () => ref.off('value', listener);   // ✅ removes only THIS listener
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
  indexSnap.forEach(child => matchIds.push(child.key));
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
  indexSnap.forEach(child => matchIds.push(child.key));
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
  const id = Math.random().toString(36).substring(2, 8).toUpperCase();
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

export const renamePool = async (tournamentId, poolId, newName) => {
  const snap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = snap.val();
  if (!tournament) throw new Error('Tournament not found');
  const pools = (tournament.pools ?? []).map((p) =>
    p.poolId === poolId ? { ...p, poolName: newName.trim() } : p
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
  indexSnap.forEach(child => ids.push(child.key));
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

export const createPlayerMaster = async (name, type, phoneNumber = null) => {
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

export const getMyLinkedPlayerId = async () => {
  const user = getCurrentUser();
  if (!user) return null;
  const snap = await database().ref('players').orderByChild('accountId').equalTo(user.uid).once('value');
  let foundId = null;
  snap.forEach(child => { if (!foundId) foundId = child.key; });
  return foundId;
};

export const retroactivelyLinkGuestPlayers = async (phoneNumber: string, globalPlayerId: string) => {
  const key = phoneNumber.replace(/\D/g, '');
  if (!key || !globalPlayerId) return;
  const user = getCurrentUser();
  if (!user) return;
  const snap = await database().ref('players').orderByChild('phoneNumber').equalTo(key).once('value');
  const updates: Record<string, any> = {};
  snap.forEach((child: any) => {
    const v = child.val();
    if (v?.playerType === 'GUEST' && v?.accountId == null) {
      updates[child.key + '/accountId'] = user.uid;   // ← was globalPlayerId, must be Firebase uid
      updates[child.key + '/playerType'] = 'REGISTERED';
      updates[child.key + '/linkedAt'] = Date.now();
    }
  });
  if (Object.keys(updates).length > 0) {
    await database().ref('players').update(updates);
  }
};

export const ensureMyPlayerLinked = async (displayName, phoneNumber = null) => {
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

export const getMatchesForPlayer = async (globalPlayerId) => {
  if (!globalPlayerId) return [];
  // Use the player-scoped index (populated in createMatch) instead of the
  // scorer-scoped users/{uid}/matches index — this is what makes matches
  // visible to every participant, not just whoever scored the match.
  const indexSnap = await database().ref('playerMatchIndex/' + globalPlayerId).once('value');
  const matchIds: string[] = [];
  indexSnap.forEach(child => matchIds.push(child.key));
  if (matchIds.length === 0) return [];
  const snaps = await Promise.all(matchIds.map(id => database().ref('matches/' + id).once('value')));
  return snaps.map(s => s.val()).filter(Boolean)
    .sort((a: any, b: any) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
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
  });
  return found;
};


// ───────────────────────────────────────────────────────────
// TOURNAMENT MATCH COMPLETION
// ───────────────────────────────────────────────────────────

const calcOvers = (overs, balls) => (overs ?? 0) + (balls ?? 0) / 6;

// Shared points/NRR calculator, reused for both the overall team list AND
// pool-scoped standings, so the exact same formula updates both consistently.
const computeUpdatedStanding = (t, { team1, team2, runs1, runs2, denomOvers1, denomOvers2, isTie, team1Won, team2Won }) => {
  if (t.teamName !== team1 && t.teamName !== team2) return t;
  const isTeam1 = t.teamName === team1;
  const ownRuns = isTeam1 ? runs1 : runs2;
  const oppRuns = isTeam1 ? runs2 : runs1;
  const ownOvers = isTeam1 ? denomOvers1 : denomOvers2;
  const oppOvers = isTeam1 ? denomOvers2 : denomOvers1;

  const won = isTie ? false : (isTeam1 ? team1Won : team2Won);
  const lost = isTie ? false : !won;

  const prevRunsFor = t.nrrRunsFor ?? 0;
  const prevOversFor = t.nrrOversFor ?? 0;
  const prevRunsAgainst = t.nrrRunsAgainst ?? 0;
  const prevOversAgainst = t.nrrOversAgainst ?? 0;
  const newRunsFor = prevRunsFor + ownRuns;
  const newOversFor = prevOversFor + ownOvers;
  const newRunsAgainst = prevRunsAgainst + oppRuns;
  const newOversAgainst = prevOversAgainst + oppOvers;
  const newNrr = (newOversFor > 0 ? newRunsFor / newOversFor : 0) - (newOversAgainst > 0 ? newRunsAgainst / newOversAgainst : 0);

  return {
    ...t,
    played: (t.played ?? 0) + 1,
    won: (t.won ?? 0) + (won ? 1 : 0),
    lost: (t.lost ?? 0) + (lost ? 1 : 0),
    tied: (t.tied ?? 0) + (isTie ? 1 : 0),
    points: (t.points ?? 0) + (won ? 2 : isTie ? 1 : 0),
    nrrRunsFor: newRunsFor,
    nrrOversFor: newOversFor,
    nrrRunsAgainst: newRunsAgainst,
    nrrOversAgainst: newOversAgainst,
    nrr: newNrr,
  };
};

export const completeTournamentMatch = async (tournamentId, tournamentMatchId, matchResult) => {
  if (!tournamentId || !tournamentMatchId) return;
  const tSnap = await database().ref(`tournaments/${tournamentId}`).once('value');
  const tournament = tSnap.val();
  if (!tournament) return;

  const { team1, team2, innings1, innings2, winner, matchId, totalOvers } = matchResult;
  const runs1 = innings1?.runs ?? 0;
  const runs2 = innings2?.runs ?? 0;
  const oversFaced1 = calcOvers(innings1?.overs, innings1?.balls);
  const oversFaced2 = calcOvers(innings2?.overs, innings2?.balls);
  const allOut1 = (innings1?.wickets ?? 0) >= 10;
  const allOut2 = (innings2?.wickets ?? 0) >= 10;
  const denomOvers1 = allOut1 ? (totalOvers ?? oversFaced1) : oversFaced1;
  const denomOvers2 = allOut2 ? (totalOvers ?? oversFaced2) : oversFaced2;

  const isTie = winner === 'Match tied';
  const team1Won = !isTie && winner?.includes(team1 + ' won');
  const team2Won = !isTie && winner?.includes(team2 + ' won');

  const ctx = { team1, team2, runs1, runs2, denomOvers1, denomOvers2, isTie, team1Won, team2Won };

  const updatedTeams = (tournament.teams ?? []).map((t) => computeUpdatedStanding(t, ctx));

  // Try the overall tournament.matches list first...
  let matchedInOverall = false;
  const updatedMatches = (tournament.matches ?? []).map((m) => {
    if (m.id === tournamentMatchId) { matchedInOverall = true; return { ...m, status: 'completed', matchId, winner }; }
    return m;
  });

  // ...and if not found there, this match belongs to a pool — locate and
  // update that pool's own matches + standings instead.
  let updatedPools = tournament.pools ?? [];
  if (!matchedInOverall && updatedPools.length > 0) {
    updatedPools = updatedPools.map((p) => {
      const matchIndex = (p.matches ?? []).findIndex((m) => m.id === tournamentMatchId);
      if (matchIndex === -1) return p;
      const newPoolMatches = p.matches.map((m) =>
        m.id === tournamentMatchId ? { ...m, status: 'completed', matchId, winner } : m
      );
      const newStandings = (p.standings ?? []).map((t) => computeUpdatedStanding(t, ctx));
      return { ...p, matches: newPoolMatches, standings: newStandings };
    });
  }

  // Third path: this tournamentMatchId belongs to a knockout fixture.
  let updatedFixtures = tournament.knockoutFixtures ?? [];
  if (!matchedInOverall && updatedFixtures.length > 0) {
    const fixture = updatedFixtures.find((f) => f.id === tournamentMatchId);
    if (fixture) {
      updatedFixtures = updatedFixtures.map((f) =>
        f.id === tournamentMatchId ? { ...f, status: 'completed', matchId, winner } : f
      );
    }
  }

  await database().ref(`tournaments/${tournamentId}`).update({
    teams: updatedTeams,
    matches: updatedMatches,
    pools: updatedPools,
    knockoutFixtures: updatedFixtures,
  });

  // After saving, advance the winner into the next round's placeholder slot.
  const completedFixture = updatedFixtures.find((f) => f.id === tournamentMatchId && f.status === 'completed');
  if (completedFixture) {
    const winningTeamName = winner.includes(team1 + ' won') ? team1 : winner.includes(team2 + ' won') ? team2 : null;
    if (winningTeamName) {
      await advanceWinnerInBracket(tournamentId, tournamentMatchId, winningTeamName);
    }
  }
};

// ───────────────────────────────────────────────────────────
// AI MATCH SUMMARY — Gemini REST call
// ───────────────────────────────────────────────────────────

const buildMatchSummaryPrompt = (match) => {
  const i1 = match.innings1 ?? {};
  const i2 = match.innings2 ?? {};

  const topBatter = (inn, players) => {
    const entries = Object.values(inn.batsmanStats ?? {});
    const best = entries.filter(Boolean).sort((a, b) => (b?.runs ?? 0) - (a?.runs ?? 0))[0];
    if (!best || (best.runs ?? 0) === 0) return null;
    const name = players?.find(p => p.id === best.playerId)?.name ?? 'A batter';
    return name + ' (' + best.runs + ' off ' + best.balls + ')';
  };
  const topBowler = (inn, players) => {
    const entries = Object.values(inn.bowlerStats ?? {});
    const best = entries.filter(Boolean).sort((a, b) => (b?.wickets ?? 0) - (a?.wickets ?? 0))[0];
    if (!best || (best.wickets ?? 0) === 0) return null;
    const name = players?.find(p => p.id === best.playerId)?.name ?? 'A bowler';
    return name + ' (' + best.wickets + '/' + best.runs + ')';
  };

  const i1Top = topBatter(i1, match.team1Players);
  const i2Top = topBatter(i2, match.team2Players);
  const i1BestBowl = topBowler(i1, match.team2Players);
  const i2BestBowl = topBowler(i2, match.team1Players);

  return [
    'Write a short, exciting 3-4 sentence cricket match summary in the style of a sports journalist, based on this data. Do not invent any facts not given below.',
    'Team 1: ' + match.team1 + ' scored ' + (i1.runs ?? 0) + '/' + (i1.wickets ?? 0) + ' in ' + (i1.overs ?? 0) + '.' + (i1.balls ?? 0) + ' overs.',
    'Team 2: ' + match.team2 + ' scored ' + (i2.runs ?? 0) + '/' + (i2.wickets ?? 0) + ' in ' + (i2.overs ?? 0) + '.' + (i2.balls ?? 0) + ' overs.',
    'Result: ' + (match.winner ?? 'No result'),
    i1Top ? ('Top scorer for ' + match.team1 + ': ' + i1Top) : '',
    i2Top ? ('Top scorer for ' + match.team2 + ': ' + i2Top) : '',
    i1BestBowl ? ('Best bowler vs ' + match.team1 + ': ' + i1BestBowl) : '',
    i2BestBowl ? ('Best bowler vs ' + match.team2 + ': ' + i2BestBowl) : '',
  ].filter(Boolean).join('\n');
};

export const generateMatchSummary = async (matchId, match) => {
  try {
    const aiMod = require('./aiConfig');
    const GEMINI_API_KEY = aiMod.GEMINI_API_KEY ?? aiMod.default?.GEMINI_API_KEY ?? '';
    const prompt = buildMatchSummaryPrompt(match);
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
      }
    );
    if (!res.ok) { const errText = await res.text(); throw new Error('Gemini API error ' + res.status + ': ' + errText); }
    const data = await res.json();
    const summaryText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summaryText) throw new Error('No summary text in Gemini response');
    await database().ref('matches/' + matchId).update({ summaryText, summaryGeneratedAt: Date.now() });
    return summaryText;
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
      const player = bowlingPlayers?.find((p: any) => p.name === displayName);
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
const getPoolQualifiers = (pool) => {
  const sorted = [...(pool.standings ?? [])].sort((a, b) => b.points - a.points || (b.nrr ?? 0) - (a.nrr ?? 0));
  return sorted.slice(0, pool.qualifyCount).map((t, idx) => ({ ...t, poolRank: idx + 1, poolName: pool.poolName }));
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
  // Standard seeding: Rank1[i] vs Rank2[opposite pool], rotating so a pool's
  // #1 never faces its own #2.
  const n = Math.max(rank1s.length, rank2s.length);
  for (let i = 0; i < n; i++) {
    const home = rank1s[i];
    // Pair with a rank-2 team from a DIFFERENT pool where possible.
    const awayCandidateIdx = rank2s.findIndex((r2, idx) => !pairs.some((p) => p.away === r2) && r2.poolName !== home?.poolName);
    const away = awayCandidateIdx !== -1 ? rank2s[awayCandidateIdx] : rank2s.find((r2) => !pairs.some((p) => p.away === r2));
    if (home && away) pairs.push({ home, away });
  }
  // Any leftover rank1/rank2 (uneven counts) plus all rank3+ get paired sequentially.
  const usedNames = new Set(pairs.flatMap((p) => [p.home?.teamName, p.away?.teamName]));
  const leftovers = [...rank1s, ...rank2s, ...rank3PlusFlat].filter((q) => !usedNames.has(q.teamName));
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
  snap.forEach((child) => { children.push(child); return false; });

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