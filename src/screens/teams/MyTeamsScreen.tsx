import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Image, Alert, Modal } from 'react-native';
import { getMyTeams, deleteTeam } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

export default function MyTeamsScreen({ navigation, route }: any) {
  const selectMode = route?.params?.selectMode ?? false;
  const tournamentId = route?.params?.tournamentId ?? null;
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamTab, setTeamTab] = useState<'my'|'other'>('my');

  const handleSelectForTournament = async (team: any) => {
  try {
    const { updateTournament, subscribeToTournament } = require('../../utils/firebase');
    // Read current tournament once to append without clobbering concurrent edits.
    const database = require('@react-native-firebase/database').default;
    const snap = await database().ref('tournaments/' + tournamentId).once('value');
    const tournament = snap.val();
    if (!tournament) { Alert.alert('Error', 'Tournament not found'); return; }
    if (tournament.teams?.some((t: any) => t.teamName === team.name)) {
      Alert.alert('Already Added', team.name + ' is already in this tournament');
      return;
    }
    const newTeam = {
      teamId: team.id,
      teamName: team.name,
      logo: team.logo ?? undefined,
      players: team.players ?? [],
      played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0,
    };
    await updateTournament(tournamentId, { teams: [...(tournament.teams ?? []), newTeam] });
    Alert.alert('Added!', team.name + ' added with ' + (team.players?.length ?? 0) + ' players', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  } catch (e: any) {
    Alert.alert('Error', e?.message ?? 'Could not add team');
  }
};

  const load = async () => {
    setLoading(true);
    try { const data = await getMyTeams(); setTeams(data ?? []); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const unsub = navigation.addListener('focus', load);
    return unsub;
  }, [navigation]);

  const handleDelete = (team: any) => {
    Alert.alert('Delete Team', `Delete "${team.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteTeam(team.id); load(); } },
    ]);
  };

  const myTeams = teams.filter((t: any) => !t.teamType || t.teamType === 'my');
  const otherTeams = teams.filter((t: any) => t.teamType === 'other');
  const displayTeams = teamTab === 'my' ? myTeams : otherTeams;

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const TeamCard = ({ item }: any) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => selectMode ? handleSelectForTournament(item) : navigation.navigate('TeamDetail', { teamId: item.id })}
    >
      <View style={s.logoBox}>
        {item.logo ? <Image source={{ uri: item.logo }} style={s.logoImg} /> : <Text style={s.logoText}>{item.name.charAt(0).toUpperCase()}</Text>}
      </View>
      <View style={s.info}>
        <View style={{flexDirection:'row', alignItems:'center', gap:6}}>
          <Text style={s.teamName}>{item.name}</Text>
          <View style={[s.typeBadge, item.teamType === 'other' ? s.typeBadgeOther : s.typeBadgeMy]}>
            <Text style={s.typeBadgeTxt}>{item.teamType === 'other' ? 'Other' : 'My Team'}</Text>
          </View>
        </View>
        <Text style={s.teamSub}>
          {item.players?.length ?? 0} players
          {item.players?.find((p: any) => p.isCaptain) ? ` • C: ${item.players.find((p: any) => p.isCaptain)?.name}` : ''}
        </Text>
      </View>
      {!selectMode && (
  <>
    <TouchableOpacity style={s.editBtn} onPress={() => navigation.navigate('CreateTeam', { existingTeam: item })}>
      <Text style={s.editIcon}>Edit</Text>
    </TouchableOpacity>
    <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item)}>
      <Text style={s.deleteIcon}>Del</Text>
    </TouchableOpacity>
  </>
  )}
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <Header
        title={selectMode ? "Select Team for Tournament" : "Teams"}
        onBack={() => navigation.goBack()}
        rightText="+ New"
        onRight={() => navigation.navigate('CreateTeam', selectMode ? { fromTournament: true, tournamentId } : undefined)}
    />

      {/* Sub Tabs */}
      <View style={s.subTabs}>
        <TouchableOpacity style={[s.subTab, teamTab === 'my' && s.subTabActive]} onPress={() => setTeamTab('my')}>
          <Text style={[s.subTabTxt, teamTab === 'my' && s.subTabTxtActive]}>My Teams ({myTeams.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.subTab, teamTab === 'other' && s.subTabActive]} onPress={() => setTeamTab('other')}>
          <Text style={[s.subTabTxt, teamTab === 'other' && s.subTabTxtActive]}>Other Teams ({otherTeams.length})</Text>
        </TouchableOpacity>
      </View>

      {displayTeams.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTxt}>{teamTab === 'my' ? 'No My Teams yet' : 'No Other Teams yet'}</Text>
          <Text style={s.emptySub}>{teamTab === 'my' ? 'Create teams you play in' : 'Add opponent or other teams'}</Text>
          <TouchableOpacity style={s.createBtn} onPress={() => navigation.navigate('CreateTeam')}>
            <Text style={s.createBtnTxt}>+ Create Team</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={displayTeams}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          renderItem={({ item }) => <TeamCard item={item} />}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  subTabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  subTab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  subTabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  subTabTxt: { color: COLORS.textSecondary, fontSize: 13, fontWeight: 'bold' },
  subTabTxtActive: { color: COLORS.primary },
  list: { padding: SPACING.lg, gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  logoBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  logoImg: { width: '100%', height: '100%' },
  logoText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  info: { flex: 1 },
  teamName: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  teamSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 3 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: RADIUS.round },
  typeBadgeMy: { backgroundColor: COLORS.primary + '33' },
  typeBadgeOther: { backgroundColor: COLORS.blue + '33' },
  typeBadgeTxt: { color: COLORS.text, fontSize: 9, fontWeight: 'bold' },
  editBtn: { backgroundColor: COLORS.card2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border },
  editIcon: { color: COLORS.primary, fontSize: 11, fontWeight: 'bold' },
  deleteBtn: { backgroundColor: COLORS.red + '22', paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.red + '55' },
  deleteIcon: { color: COLORS.red, fontSize: 11, fontWeight: 'bold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl },
  emptyTxt: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 24, textAlign: 'center' },
  createBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 12, borderRadius: RADIUS.round },
  createBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});