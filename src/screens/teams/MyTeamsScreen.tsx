import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, ActivityIndicator, Image, Alert, Modal } from 'react-native';
import { getMyTeams, deleteTeam } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import { AdBanner } from '../../components/AdPlaceholder';
import EmptyState from '../../components/EmptyState';

export default function MyTeamsScreen({ navigation, route }: any) {
  const selectMode = route?.params?.selectMode ?? false;
  const tournamentId = route?.params?.tournamentId ?? null;
  const [teams, setTeams] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamTab, setTeamTab] = useState<'my'|'other'>('my');

  const handleSelectForTournament = async (team: any) => {
  try {
    // Use an atomic transaction on the teams array so two concurrent adds
    // (e.g. from two devices) cannot clobber each other.
    const database = require('@react-native-firebase/database').default;
    const tournamentRef = database().ref('tournaments/' + tournamentId);
    const existsSnap = await tournamentRef.once('value');
    if (!existsSnap.exists()) { Alert.alert('Error', 'Tournament not found'); return; }
    let alreadyAdded = false;
    const result = await tournamentRef.child('teams').transaction((currentTeams: any) => {
      if (currentTeams?.some((t: any) => t.teamName === team.name)) {
        alreadyAdded = true;
        return undefined;
      }
      const newTeam = {
        teamId: team.id,
        teamName: team.name,
        logo: team.logo ?? undefined,
        players: team.players ?? [],
        played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0,
      };
      return [...(currentTeams ?? []), newTeam];
    });
    if (alreadyAdded || !result.committed) {
      Alert.alert('Already Added', team.name + ' is already in this tournament');
      return;
    }
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
      activeOpacity={0.85}
      onPress={() => selectMode ? handleSelectForTournament(item) : navigation.navigate('TeamDetail', { teamId: item.id })}
    >
      <View pointerEvents="none" style={s.cardEdge} />
      {/* Same violet/blue split already used for the "My Team"/"Other" badge
          below — reused here so the crest ring matches its own badge colour
          instead of always being violet. */}
      <View style={[s.logoBox, item.teamType === 'other' ? s.logoBoxOther : s.logoBoxMy]}>
        {item.logo ? <Image source={{ uri: item.logo }} style={s.logoImg} /> : (
          <Text style={[s.logoText, item.teamType === 'other' && s.logoTextOther]}>{item.name.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={s.info}>
        <View style={s.nameRow}>
          <Text style={s.teamName} numberOfLines={1}>{item.name}</Text>
          <View style={[s.typeBadge, item.teamType === 'other' ? s.typeBadgeOther : s.typeBadgeMy]}>
            <Text style={s.typeBadgeTxt}>{item.teamType === 'other' ? 'Other' : 'My Team'}</Text>
          </View>
        </View>
        <Text style={s.teamSub} numberOfLines={1}>
          {item.players?.length ?? 0} players
          {item.players?.find((p: any) => p.isCaptain) ? ` • C: ${item.players.find((p: any) => p.isCaptain)?.name}` : ''}
        </Text>
      </View>
      {!selectMode && (
  <>
    <TouchableOpacity style={s.editBtn} activeOpacity={0.7} onPress={() => navigation.navigate('CreateTeam', { existingTeam: item })}>
      <Text style={s.editIcon}>Edit</Text>
    </TouchableOpacity>
    <TouchableOpacity style={s.deleteBtn} activeOpacity={0.7} onPress={() => handleDelete(item)}>
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
        rightText="New"
        onRight={() => navigation.navigate('CreateTeam', selectMode ? { fromTournament: true, tournamentId } : undefined)}
    />

      {/* Sub Tabs */}
      <View style={s.subTabs}>
        <TouchableOpacity style={[s.subTab, teamTab === 'my' && s.subTabActive]} activeOpacity={0.8} onPress={() => setTeamTab('my')}>
          <Text style={[s.subTabTxt, teamTab === 'my' && s.subTabTxtActive]} numberOfLines={1}>My Teams ({myTeams.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.subTab, teamTab === 'other' && s.subTabActive]} activeOpacity={0.8} onPress={() => setTeamTab('other')}>
          <Text style={[s.subTabTxt, teamTab === 'other' && s.subTabTxtActive]} numberOfLines={1}>Other Teams ({otherTeams.length})</Text>
        </TouchableOpacity>
      </View>

      {displayTeams.length === 0 ? (
        <EmptyState
          icon="👥"
          title={teamTab === 'my' ? 'No My Teams yet' : 'No Other Teams yet'}
          subtitle={teamTab === 'my' ? 'Create teams you play in' : 'Add opponent or other teams'}
          btnText="Create Team"
          onBtn={() => navigation.navigate('CreateTeam')}
        />
      ) : (
        <FlatList
          data={displayTeams}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <TeamCard item={item} />}
        />
      )}
      <View style={s.adBar}>
        <AdBanner />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },

  // ── Segmented tabs ──
  // A pill segment reads as a switch; the old bottom-border underline was easy
  // to miss on a dark background and drew a hard line across the screen.
  subTabs: {
    flexDirection: 'row',
    gap: 4,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderRadius: RADIUS.round,
    padding: 4,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    ...SHADOW.sm,
  },
  subTab: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: RADIUS.round },
  subTabActive: { backgroundColor: COLORS.primary },
  subTabTxt: { ...TYPE.caption, fontWeight: '700', color: COLORS.textSecondary },
  subTabTxtActive: { color: COLORS.onPrimary },

  list: { padding: SPACING.lg, gap: SPACING.sm, paddingBottom: SPACING.xl },

  // ── Team card ──
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    gap: 12,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  // Ring + gap so a logo photo reads as a crest rather than a cropped square.
  logoBox: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.primarySoft,
    justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2, borderColor: COLORS.primary,
  },
  logoBoxMy: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  logoBoxOther: { backgroundColor: COLORS.blue + '1f', borderColor: COLORS.blue, ...SHADOW.glow(COLORS.blue) },
  logoImg: { width: '100%', height: '100%' },
  logoText: { ...TYPE.h2, color: COLORS.primaryLight },
  logoTextOther: { color: COLORS.blue },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // The name is the biggest thing in the row; its meta line sits well below it.
  teamName: { ...TYPE.title, color: COLORS.text, flexShrink: 1 },
  teamSub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 3 },
  typeBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: RADIUS.round, borderWidth: 1,
  },
  typeBadgeMy: { backgroundColor: COLORS.primary + '1f', borderColor: COLORS.primary + '55' },
  typeBadgeOther: { backgroundColor: COLORS.blue + '1f', borderColor: COLORS.blue + '55' },
  typeBadgeTxt: { ...TYPE.label, fontSize: 9, color: COLORS.textSecondary },

  // ── Row actions ──
  editBtn: {
    backgroundColor: COLORS.primarySoft,
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: RADIUS.round,
    borderWidth: 1, borderColor: COLORS.primary + '55',
  },
  editIcon: { ...TYPE.caption, fontSize: 11, fontWeight: '700', color: COLORS.primary },
  deleteBtn: {
    backgroundColor: COLORS.error + '1a',
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: RADIUS.round,
    borderWidth: 1, borderColor: COLORS.error + '55',
  },
  deleteIcon: { ...TYPE.caption, fontSize: 11, fontWeight: '700', color: COLORS.error },

  adBar: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderSoft,
  },
});