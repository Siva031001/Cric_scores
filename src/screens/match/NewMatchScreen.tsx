import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Image, ActivityIndicator,
} from 'react-native';
import { findTeamByName, getMyTeams } from '../../utils/firebase';
import { Team } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import Button from '../../components/Button';
import AppIcon from '../../components/AppIcon';

export default function NewMatchScreen({ route, navigation }: any) {
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [team1Data, setTeam1Data] = useState<Team | null>(null);
  const [team2Data, setTeam2Data] = useState<Team | null>(null);
  const [overs, setOvers] = useState('20');
  const [ballType, setBallType] = useState<'Leather Ball'|'Tennis Ball'|'Turf'>('Tennis Ball');
  const [playersPerSide, setPlayersPerSide] = useState(11);
  const [venue, setVenue] = useState('');
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [searching1, setSearching1] = useState(false);
  const [searching2, setSearching2] = useState(false);

  useEffect(() => {
    if (route.params?.savedTeam) {
      const { savedTeam, teamSlot } = route.params;
      if (teamSlot === 1) {
        setTeam1Name(savedTeam.name);
        setTeam1Data(savedTeam);
      } else {
        setTeam2Name(savedTeam.name);
        setTeam2Data(savedTeam);
      }
    }
  }, [route.params]);

  useEffect(() => {
    getMyTeams().then(setMyTeams).catch(console.error);
  }, []);

  const searchTeam = async (name: string, slot: 1 | 2) => {
    if (!name.trim()) return;
    slot === 1 ? setSearching1(true) : setSearching2(true);
    try {
      const found = await findTeamByName(name.trim());
      if (found) {
        // Make sure logo and all data is loaded
        if (slot === 1) {
          setTeam1Name(found.name);
          setTeam1Data(found);
        } else {
          setTeam2Name(found.name);
          setTeam2Data(found);
        }
        Alert.alert('✅ Team Found!', `"${found.name}" loaded with ${found.players.length} players.`);
      } else {
        Alert.alert(
          'Team Not Found',
          `"${name}" is not in your teams. Create it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Create Team',
              onPress: () => navigation.navigate('CreateTeam', {
                fromNewMatch: true,
                teamSlot: slot,
                prefillName: name.trim(),
              }),
            },
          ]
        );
      }
    } catch (e) { console.error(e); }
    finally { slot === 1 ? setSearching1(false) : setSearching2(false); }
  };

  const handleStart = () => {
    if (!team1Name.trim() || !team2Name.trim()) {
      Alert.alert('Error', 'Please enter both team names');
      return;
    }
    if (!team1Data) {
      Alert.alert('Error', `Search or create team "${team1Name}" first`);
      return;
    }
    if (!team2Data) {
      Alert.alert('Error', `Search or create team "${team2Name}" first`);
      return;
    }
    if (team1Data.id === team2Data.id) {
      Alert.alert('Error', 'Team 1 and Team 2 cannot be the same team');
      return;
    }
    const oversNum = parseInt(overs, 10);
    if (!overs || isNaN(oversNum) || oversNum < 1 || oversNum > 50) {
      Alert.alert('Error', 'Please enter a valid number of overs (1-50)');
      return;
    }
    navigation.navigate('PlayerSetup', {
      team1: team1Data.name,
      team2: team2Data.name,
      overs,
      venue,
      ballType,
      playersPerSide: ballType === 'Turf' ? playersPerSide : 11,
      team1Players: team1Data.players,
      team2Players: team2Data.players,
      team1Logo: team1Data.logo,
      team2Logo: team2Data.logo,
    });
  };

  return (
    <ScrollView style={styles.container}>
      <Header
        title="New Match"
        onBack={() => navigation.goBack()}
        rightText="My Teams"
        onRight={() => navigation.navigate('MyTeams')}
      />

      {/* Teams Row */}
      <Card tone="base" elevation="md" padded={false} style={styles.teamsCard}>
        {/* Soft two-tone blobs behind the team slots — purely decorative,
            echoes the violet/coral pairing used across the redesigned
            components (Button glow, Header accent line). */}
        <View pointerEvents="none" style={[styles.teamsBlob, styles.teamsBlobLeft]} />
        <View pointerEvents="none" style={[styles.teamsBlob, styles.teamsBlobRight]} />
        <View style={styles.teamsRow}>
        {/* Team 1 */}
        <View style={styles.teamBox}>
          <Text style={[styles.teamLabel, styles.teamLabel1]}>Team 1</Text>
          <TouchableOpacity
            style={[styles.logoCircle, team1Data?.logo ? styles.logoCircleFilled1 : null]}
            onPress={() => navigation.navigate('CreateTeam', {
              fromNewMatch: true, teamSlot: 1, prefillName: team1Name,
            })}>
            {team1Data?.logo ? (
              <Image source={{ uri: team1Data.logo }} style={styles.logoImg} />
            ) : (
              <Text style={styles.logoPlus}>+</Text>
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.teamInput}
            placeholder="Team Name"
            placeholderTextColor={COLORS.textMuted}
            value={team1Name}
            onChangeText={setTeam1Name}
            onEndEditing={() => searchTeam(team1Name, 1)}
            textAlign="center"
          />
          {searching1
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : team1Data
              ? <View style={styles.foundRow}>
                  <AppIcon emoji="✅" size={12} color={COLORS.success} />
                  <Text style={styles.foundText}>{team1Data.players.length} players</Text>
                </View>
              : null}
        </View>

        <View style={styles.vsBadge}>
          <Text style={styles.vs}>VS</Text>
        </View>

        {/* Team 2 */}
        <View style={styles.teamBox}>
          <Text style={[styles.teamLabel, styles.teamLabel2]}>Team 2</Text>
          <TouchableOpacity
            style={[styles.logoCircle, team2Data?.logo ? styles.logoCircleFilled2 : null]}
            onPress={() => navigation.navigate('CreateTeam', {
              fromNewMatch: true, teamSlot: 2, prefillName: team2Name,
            })}>
            {team2Data?.logo ? (
              <Image source={{ uri: team2Data.logo }} style={styles.logoImg} />
            ) : (
              <Text style={styles.logoPlus}>+</Text>
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.teamInput}
            placeholder="Team Name"
            placeholderTextColor={COLORS.textMuted}
            value={team2Name}
            onChangeText={setTeam2Name}
            onEndEditing={() => searchTeam(team2Name, 2)}
            textAlign="center"
          />
          {searching2
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : team2Data
              ? <View style={styles.foundRow}>
                  <AppIcon emoji="✅" size={12} color={COLORS.success} />
                  <Text style={styles.foundText}>{team2Data.players.length} players</Text>
                </View>
              : null}
        </View>
        </View>
      </Card>

      {/* My Teams Quick Select */}
      {myTeams.length > 0 && (
        <Card tone="base" elevation="md" accent={COLORS.blue} style={styles.quickBox}>
          <Text style={styles.quickTitle}>Quick Select from My Teams</Text>
          {myTeams.map(team => (
            <View key={team.id} style={styles.quickRow}>
              <Text style={styles.quickName} numberOfLines={1}>{team.name}</Text>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => { setTeam1Name(team.name); setTeam1Data(team); }}>
                <Text style={styles.quickBtnText}>Team 1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtn2]}
                onPress={() => { setTeam2Name(team.name); setTeam2Data(team); }}>
                <Text style={[styles.quickBtnText, styles.quickBtnText2]}>Team 2</Text>
              </TouchableOpacity>
            </View>
          ))}
        </Card>
      )}

      {/* Venue */}
      <Card tone="base" elevation="md" accent={COLORS.teal} style={styles.fieldBox}>
        <Text style={styles.fieldLabel}>📍 Venue (Optional)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Enter venue"
          placeholderTextColor={COLORS.textMuted}
          value={venue}
          onChangeText={setVenue}
        />
      </Card>

      {/* Overs */}
      <Card tone="base" elevation="md" accent={COLORS.orange} style={styles.fieldBox}>
        <Text style={styles.fieldLabel}>🕐 Overs</Text>
        <View style={styles.oversRow}>
          {['5', '10', '15', '20', '50'].map(o => (
            <TouchableOpacity
              key={o}
              style={[styles.oversBtn, overs === o && styles.oversBtnActive]}
              onPress={() => setOvers(o)}>
              <Text style={[styles.oversBtnText, overs === o && styles.oversBtnTextActive]}>
                {o}
              </Text>
            </TouchableOpacity>
          ))}
          <TextInput
            style={styles.oversInput}
            placeholder="Other"
            placeholderTextColor={COLORS.textMuted}
            value={['5', '10', '15', '20', '50'].includes(overs) ? '' : overs}
            onChangeText={setOvers}
            keyboardType="numeric"
            maxLength={3}
          />
        </View>
      </Card>

      <Card tone="base" elevation="md" accent={COLORS.purple} style={styles.fieldBox}>
        <Text style={styles.fieldLabel}>🏏 Ball Type</Text>
        {ballType === 'Turf' && (
  <View style={styles.subGroup}>
    <Text style={styles.fieldLabel}>Players Per Side</Text>
    <View style={styles.subGroupRow}>
      {[4, 5, 6, 7, 8, 9, 10, 11].map((n) => (
        <TouchableOpacity
          key={n}
          style={[styles.oversBtn, playersPerSide === n && styles.oversBtnActive]}
          onPress={() => setPlayersPerSide(n)}
        >
          <Text style={[styles.oversBtnText, playersPerSide === n && styles.oversBtnTextActive]}>{n}</Text>
        </TouchableOpacity>
      ))}
    </View>
  </View>
)}
          <View style={styles.oversRow}>
        {(['Leather Ball','Tennis Ball','Turf'] as const).map(b => (
      <TouchableOpacity
        key={b}
        style={[styles.oversBtn, ballType === b && styles.oversBtnActive]}
        onPress={() => setBallType(b)}>
        <Text style={[styles.oversBtnText, ballType === b && styles.oversBtnTextActive]}>{b}</Text>
      </TouchableOpacity>
        ))}
         </View>
        </Card>

      {/* Start Button */}
      <Button
        label="Start Match"
        onPress={handleStart}
        variant="primary"
        size="lg"
        full
        left={<AppIcon emoji="🏏" size={20} color={COLORS.onPrimary} />}
        style={styles.startBtn}
      />

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // The two teams are the headline of this screen, so they sit on their own
  // elevated card instead of floating on the background.
  teamsCard: { marginHorizontal: SPACING.lg, marginTop: SPACING.sm, marginBottom: SPACING.md, paddingVertical: SPACING.lg, paddingHorizontal: SPACING.sm, overflow: 'hidden' },
  // Two soft, oversized tinted discs sitting behind the team slots. Purely
  // decorative (pointerEvents="none", absolute, behind everything else) —
  // the same cheap "gradient-ish" technique StatCard uses for its corner tint.
  teamsBlob: { position: 'absolute', top: -40, width: 140, height: 140, borderRadius: 70, opacity: 0.14 },
  teamsBlobLeft: { left: -40, backgroundColor: COLORS.blue },
  teamsBlobRight: { right: -40, backgroundColor: COLORS.orange },
  teamsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-around',
  },
  teamBox: { flex: 1, alignItems: 'center', gap: SPACING.sm },
  teamLabel: { ...TYPE.label, color: COLORS.textSecondary },
  // Each side gets its own hue so "Team 1" vs "Team 2" reads at a glance —
  // decorative colour-coding only, the underlying slot/condition is unchanged.
  teamLabel1: { color: COLORS.blue },
  teamLabel2: { color: COLORS.orange },
  logoCircle: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: COLORS.card2, borderWidth: 2,
    borderColor: COLORS.border, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  // Once a logo is loaded the slot stops advertising itself as empty: solid
  // ring in the team's own colour, no dashes.
  logoCircleFilled1: { borderStyle: 'solid', borderColor: COLORS.blue, ...SHADOW.glow(COLORS.blue) },
  logoCircleFilled2: { borderStyle: 'solid', borderColor: COLORS.orange, ...SHADOW.glow(COLORS.orange) },
  logoImg: { width: '100%', height: '100%' },
  logoPlus: { color: COLORS.primary, fontSize: 30, fontWeight: '700', marginTop: -2 },
  teamInput: {
    ...TYPE.bodyStrong, color: COLORS.text,
    backgroundColor: COLORS.card2,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 10, paddingHorizontal: SPACING.sm, width: '94%',
  },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  foundText: { ...TYPE.caption, fontSize: 11, color: COLORS.success },
  // A circular chip rather than floating text, and vertically centred on the
  // logos instead of nudged down with a magic 55px. Tinted violet so it reads
  // as a deliberate accent rather than a neutral divider.
  vsBadge: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primary + '55',
    alignItems: 'center', justifyContent: 'center', marginTop: 40,
  },
  vs: { ...TYPE.label, fontSize: 11, color: COLORS.primaryLight },
  quickBox: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md },
  quickTitle: { ...TYPE.label, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  quickRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  quickName: { ...TYPE.bodyStrong, color: COLORS.text, flex: 1 },
  quickBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 13,
    paddingVertical: 7, borderRadius: RADIUS.round,
  },
  quickBtn2: { backgroundColor: COLORS.info },
  quickBtnText: { ...TYPE.label, fontSize: 10, color: COLORS.onPrimary },
  quickBtnText2: { color: COLORS.text },
  fieldBox: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md },
  fieldLabel: { ...TYPE.label, fontSize: 12, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  fieldInput: {
    backgroundColor: COLORS.card2, color: COLORS.text,
    paddingHorizontal: SPACING.md, paddingVertical: 15,
    borderRadius: RADIUS.md,
    ...TYPE.body, fontSize: 15, borderWidth: 1, borderColor: COLORS.border,
  },
  // Players-per-side only exists for Turf, so it is set off as a nested
  // sub-setting rather than looking like a peer of Ball Type.
  subGroup: {
    marginBottom: SPACING.md, paddingBottom: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft,
  },
  subGroupRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  oversRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  oversBtn: {
    minWidth: 46, paddingHorizontal: 16, paddingVertical: 11,
    borderRadius: RADIUS.round, backgroundColor: COLORS.card2,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  oversBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  oversBtnText: { ...TYPE.num, color: COLORS.textSecondary },
  oversBtnTextActive: { color: COLORS.onPrimary },
  oversInput: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderRadius: RADIUS.round, backgroundColor: COLORS.card2,
    borderWidth: 1, borderColor: COLORS.border,
    ...TYPE.num, color: COLORS.text, width: 74, textAlign: 'center',
  },
  // Height, radius, glow and label all come from <Button variant="primary">.
  startBtn: { marginHorizontal: SPACING.lg, marginTop: SPACING.xs },
});