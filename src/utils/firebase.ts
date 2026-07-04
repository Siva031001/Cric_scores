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
  ref.on('value', snap => callback(snap.val()));
  return () => ref.off('value');
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
  ref.on('value', snap => callback(snap.val()));
  return () => ref.off('value');
};

// ── getMatchHistory — parallel reads via Promise.all ────────
export const getMatchHistory = async () => {
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

export const updateTournament = async (id, data) => {
  await database().ref(`tournaments/${id}`).update(data);
};

export const getMyTournaments = async () => {
  const user = getCurrentUser();
  if (!user) return [];
  const indexSnap = await database().ref(`users/${user.uid}/tournaments`).once('value');
  const ids = [];
  indexSnap.forEach(child => ids.push(child.key));
  const tournaments = [];
  for (const id of ids) {
    const snap = await database().ref(`tournaments/${id}`).once('value');
    if (snap.val()) tournaments.push(snap.val());
  }
  return tournaments;
};

export const subscribeToTournament = (id, callback) => {
  const ref = database().ref(`tournaments/${id}`);
  ref.on('value', snap => callback(snap.val()));
  return () => ref.off('value');
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

export const ensureMyPlayerLinked = async (displayName) => {
  const existing = await getMyLinkedPlayerId();
  if (existing) return existing;
  return await createPlayerMaster(displayName, 'registered');
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
  const user = getCurrentUser();
  if (!user) return [];
  const indexSnap = await database().ref('users/' + user.uid + '/matches').once('value');
  const matchIds = [];
  indexSnap.forEach(child => matchIds.push(child.key));
  const matches = [];
  for (const id of matchIds) {
    const snap = await database().ref('matches/' + id).once('value');
    const m = snap.val();
    if (!m) continue;
    const appearsIn = [m.innings1, m.innings2].some(inn => {
      if (!inn) return false;
      const bat = Object.values(inn.batsmanStats ?? {}).some((s) => s?.globalPlayerId === globalPlayerId);
      const bowl = Object.values(inn.bowlerStats ?? {}).some((s) => s?.globalPlayerId === globalPlayerId);
      const field = Object.values(inn.fieldingStats ?? {}).some((s) => s?.globalPlayerId === globalPlayerId);
      return bat || bowl || field;
    });
    if (appearsIn) matches.push(m);
  }
  return matches.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
};

// ───────────────────────────────────────────────────────────
// TOURNAMENT MATCH COMPLETION
// ───────────────────────────────────────────────────────────

const calcOvers = (overs, balls) => (overs ?? 0) + (balls ?? 0) / 6;

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

  const updatedTeams = (tournament.teams ?? []).map((t) => {
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
  });

  const updatedMatches = (tournament.matches ?? []).map((m) =>
    m.id === tournamentMatchId
      ? { ...m, status: 'completed', matchId, winner }
      : m
  );

  await database().ref(`tournaments/${tournamentId}`).update({
    teams: updatedTeams,
    matches: updatedMatches,
  });
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
