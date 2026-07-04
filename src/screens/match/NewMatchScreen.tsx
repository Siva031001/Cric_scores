import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Image, ActivityIndicator,
} from 'react-native';
import { findTeamByName, getMyTeams } from '../../utils/firebase';
import { Team } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

export default function NewMatchScreen({ route, navigation }: any) {
  const [team1Name, setTeam1Name] = useState('');
  const [team2Name, setTeam2Name] = useState('');
  const [team1Data, setTeam1Data] = useState<Team | null>(null);
  const [team2Data, setTeam2Data] = useState<Team | null>(null);
  const [overs, setOvers] = useState('20');
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
    if (!overs || parseInt(overs) < 1) {
      Alert.alert('Error', 'Please enter valid overs');
      return;
    }
    navigation.navigate('PlayerSetup', {
      team1: team1Data.name,
      team2: team2Data.name,
      overs,
      venue,
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
      <View style={styles.teamsRow}>
        {/* Team 1 */}
        <View style={styles.teamBox}>
          <Text style={styles.teamLabel}>Team 1</Text>
          <TouchableOpacity
            style={styles.logoCircle}
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
              ? <Text style={styles.foundText}>✅ {team1Data.players.length} players</Text>
              : null}
        </View>

        <Text style={styles.vs}>VS</Text>

        {/* Team 2 */}
        <View style={styles.teamBox}>
          <Text style={styles.teamLabel}>Team 2</Text>
          <TouchableOpacity
            style={styles.logoCircle}
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
              ? <Text style={styles.foundText}>✅ {team2Data.players.length} players</Text>
              : null}
        </View>
      </View>

      {/* My Teams Quick Select */}
      {myTeams.length > 0 && (
        <View style={styles.quickBox}>
          <Text style={styles.quickTitle}>Quick Select from My Teams</Text>
          {myTeams.map(team => (
            <View key={team.id} style={styles.quickRow}>
              <Text style={styles.quickName}>{team.name}</Text>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={() => { setTeam1Name(team.name); setTeam1Data(team); }}>
                <Text style={styles.quickBtnText}>Team 1</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.quickBtn, styles.quickBtn2]}
                onPress={() => { setTeam2Name(team.name); setTeam2Data(team); }}>
                <Text style={styles.quickBtnText}>Team 2</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Venue */}
      <View style={styles.fieldBox}>
        <Text style={styles.fieldLabel}>📍 Venue (Optional)</Text>
        <TextInput
          style={styles.fieldInput}
          placeholder="Enter venue"
          placeholderTextColor={COLORS.textMuted}
          value={venue}
          onChangeText={setVenue}
        />
      </View>

      {/* Overs */}
      <View style={styles.fieldBox}>
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
      </View>

      {/* Start Button */}
      <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
        <Text style={styles.startBtnText}>🏏 Start Match</Text>
      </TouchableOpacity>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  teamsRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-around', padding: SPACING.lg,
  },
  teamBox: { flex: 1, alignItems: 'center', gap: 8 },
  teamLabel: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  logoCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.card, borderWidth: 2,
    borderColor: COLORS.primary, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  logoPlus: { color: COLORS.primary, fontSize: 28, fontWeight: 'bold' },
  teamInput: {
    color: COLORS.text, fontSize: 14, fontWeight: 'bold',
    borderBottomWidth: 1, borderBottomColor: COLORS.primary,
    paddingVertical: 5, width: '90%',
  },
  foundText: { color: COLORS.primary, fontSize: 11 },
  vs: { color: COLORS.textSecondary, fontSize: 16, fontWeight: 'bold', paddingTop: 55 },
  quickBox: {
    backgroundColor: COLORS.card, margin: SPACING.lg,
    borderRadius: RADIUS.md, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  quickTitle: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 10 },
  quickRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 8,
  },
  quickName: { color: COLORS.text, fontSize: 14, flex: 1, fontWeight: 'bold' },
  quickBtn: {
    backgroundColor: COLORS.primary, paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: RADIUS.round,
  },
  quickBtn2: { backgroundColor: COLORS.blue },
  quickBtnText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  fieldBox: { paddingHorizontal: SPACING.lg, marginBottom: 15 },
  fieldLabel: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
  fieldInput: {
    backgroundColor: COLORS.card, color: COLORS.text,
    padding: 13, borderRadius: RADIUS.md,
    fontSize: 15, borderWidth: 1, borderColor: COLORS.border,
  },
  oversRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  oversBtn: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: RADIUS.round, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  oversBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  oversBtnText: { color: COLORS.textSecondary, fontWeight: 'bold' },
  oversBtnTextActive: { color: '#fff' },
  oversInput: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: RADIUS.round, backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, width: 70, textAlign: 'center',
  },
  startBtn: {
    backgroundColor: COLORS.primary, margin: SPACING.lg,
    padding: 16, borderRadius: RADIUS.md, alignItems: 'center',
  },
  startBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});