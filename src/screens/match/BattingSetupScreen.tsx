import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView, Alert,
} from 'react-native';
import { createMatch } from '../../utils/firebase';
import { createEmptyInnings } from '../../utils/cricketLogic';
import { Player } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

type SelectionTab = 'striker' | 'nonstriker' | 'bowler';

export default function BattingSetupScreen({ route, navigation }: any) {
  const {
    team1, team2, overs, venue, ballType,
    team1Players, team2Players,
    team1Logo, team2Logo,
    tossWinner, tossChoice,
    tournamentId, tournamentMatchId,
    playersPerSide
  } = route.params;

  // Determine batting and bowling teams based on toss
  // If tossWinner chose Bat → that team bats first
  // If tossWinner chose Bowl → other team bats first
  const battingTeam = tossWinner && tossChoice
    ? (tossChoice === 'Bat' ? tossWinner : (tossWinner === team1 ? team2 : team1))
    : team1;

  const bowlingTeam = battingTeam === team1 ? team2 : team1;
  const battingPlayers: Player[] = battingTeam === team1 ? team1Players : team2Players;
  const bowlingPlayers: Player[] = battingTeam === team1 ? team2Players : team1Players;

  // Reorder teams so batting team is always "team1" in the match
  const finalTeam1 = battingTeam;
  const finalTeam2 = bowlingTeam;
  const finalTeam1Players = battingPlayers;
  const finalTeam2Players = bowlingPlayers;

  const [activeTab, setActiveTab] = useState<SelectionTab>('striker');
  const [strikerId, setStrikerId] = useState<number | null>(null);
  const [nonStrikerId, setNonStrikerId] = useState<number | null>(null);
  const [bowlerId, setBowlerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const getName = (players: Player[], id: number | null) =>
    id === null ? '—' : players.find(p => p.id === id)?.name ?? '—';

  const handleSelect = (id: number) => {
    if (activeTab === 'striker') {
      setStrikerId(id);
      setActiveTab('nonstriker');
    } else if (activeTab === 'nonstriker') {
      if (id === strikerId) {
        Alert.alert('Error', 'Must be different from Striker');
        return;
      }
      setNonStrikerId(id);
      setActiveTab('bowler');
    } else {
      setBowlerId(id);
    }
  };

  const handleStart = async () => {
    if (strikerId === null) { Alert.alert('Error', 'Please select Striker'); return; }
    if (nonStrikerId === null) { Alert.alert('Error', 'Please select Non-Striker'); return; }
    if (bowlerId === null) { Alert.alert('Error', 'Please select Bowler'); return; }

    setLoading(true);
    try {
      const now = new Date();
      const innings1 = createEmptyInnings(strikerId, nonStrikerId, bowlerId);
      // innings2: strikerId/nonStrikerId will be set during 2nd innings batting setup
      const innings2 = createEmptyInnings(-1, -2, 0); // -1/-2 = no player assigned yet
      const matchId = await createMatch({
        team1: finalTeam1,
        team2: finalTeam2,
        team1Players: finalTeam1Players,
        team2Players: finalTeam2Players,
        totalOvers: parseInt(overs, 10),
        venue: venue ?? '',
        ballType: ballType ?? 'Tennis Ball',
        tossWinner,
        tossChoice,
        matchDate: now.toLocaleDateString('en-IN'),
        matchTime: now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
        currentInnings: 1,
        innings1,
        innings2,
        status: 'live',
        tournamentId: tournamentId ?? null,
        tournamentMatchId: tournamentMatchId ?? null,
        playersPerSide: playersPerSide ?? 11,
      });
      navigation.replace('Scoring', { matchId });
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed');
    } finally { setLoading(false); }
  };

  const currentPlayers = activeTab === 'bowler' ? bowlingPlayers : battingPlayers;

  const TABS = [
    { key: 'striker' as SelectionTab, label: '🏏 Striker', team: battingTeam },
    { key: 'nonstriker' as SelectionTab, label: '🏃 Non-Striker', team: battingTeam },
    { key: 'bowler' as SelectionTab, label: '🎯 Bowler', team: bowlingTeam },
  ];

  return (
    <ScrollView style={styles.container}>
      <Header title="Match Setup" onBack={() => navigation.goBack()} />

      {/* Toss Result */}
      {tossWinner && tossChoice && (
        <View style={styles.tossCard}>
          <Text style={styles.tossText}>
            🪙 {tossWinner} won toss • chose to {tossChoice}
          </Text>
          <Text style={styles.battingFirst}>
            🏏 {battingTeam} batting first
          </Text>
        </View>
      )}

      {/* Teams */}
      <View style={styles.teamsCard}>
        <View style={styles.teamInfo}>
          <Text style={styles.teamRole}>BATTING</Text>
          <Text style={styles.teamName}>{battingTeam}</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.teamInfo}>
          <Text style={styles.teamRole}>BOWLING</Text>
          <Text style={styles.teamName}>{bowlingTeam}</Text>
        </View>
      </View>

      {/* Selection Summary */}
      <View style={styles.summaryRow}>
        {[
          { label: '🏏 Striker', value: getName(battingPlayers, strikerId) },
          { label: '🏃 Non-Str', value: getName(battingPlayers, nonStrikerId) },
          { label: '🎯 Bowler', value: getName(bowlingPlayers, bowlerId) },
        ].map((s, i) => (
          <View key={i} style={styles.summaryBox}>
            <Text style={styles.summaryLabel}>{s.label}</Text>
            <Text style={styles.summaryValue} numberOfLines={1}>{s.value}</Text>
          </View>
        ))}
      </View>

      {/* Player Selection */}
      <View style={styles.card}>
        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}>
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
              <Text style={[styles.tabTeam, activeTab === t.key && { color: 'rgba(255,255,255,0.7)' }]}>
                {t.team}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {currentPlayers.map(player => {
          const isSelected =
            (activeTab === 'striker' && strikerId === player.id) ||
            (activeTab === 'nonstriker' && nonStrikerId === player.id) ||
            (activeTab === 'bowler' && bowlerId === player.id);
          const isDisabled = activeTab === 'nonstriker' && strikerId === player.id;

          return (
            <TouchableOpacity
              key={player.id}
              style={[
                styles.playerRow,
                isSelected && styles.playerRowSelected,
                isDisabled && styles.playerRowDisabled,
              ]}
              onPress={() => !isDisabled && handleSelect(player.id)}
              disabled={isDisabled}>
              <View style={[styles.avatar, isSelected && styles.avatarSelected]}>
                <Text style={styles.avatarText}>
                  {player.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.playerInfo}>
                <Text style={[styles.playerName, isSelected && styles.playerNameSelected]}>
                  {player.name}
                  {player.isCaptain ? ' 👑' : ''}
                  {player.isWicketKeeper ? ' 🧤' : ''}
                </Text>
                {player.role && (
                  <Text style={styles.playerRole}>{player.role}</Text>
                )}
              </View>
              {isSelected && (
                <View style={styles.checkCircle}>
                  <Text style={styles.checkMark}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.startBtn, loading && styles.startBtnDisabled]}
        onPress={handleStart}
        disabled={loading}>
        <Text style={styles.startBtnText}>
          {loading ? 'Starting...' : '🏏 Start Match!'}
        </Text>
      </TouchableOpacity>

      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  tossCard: {
    backgroundColor: COLORS.primary + '22',
    margin: SPACING.lg, marginBottom: 0,
    borderRadius: RADIUS.md, padding: 12,
    borderWidth: 1, borderColor: COLORS.primary,
    alignItems: 'center',
  },
  tossText: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold' },
  battingFirst: { color: COLORS.text, fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  teamsCard: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', backgroundColor: COLORS.card,
    margin: SPACING.lg, marginBottom: 8,
    borderRadius: RADIUS.md, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  teamInfo: { flex: 1, alignItems: 'center' },
  teamRole: { color: COLORS.primary, fontSize: 10, fontWeight: 'bold', marginBottom: 4 },
  teamName: { color: COLORS.text, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  vs: { color: COLORS.textSecondary, fontSize: 16, fontWeight: 'bold', paddingHorizontal: 10 },
  summaryRow: {
    flexDirection: 'row', marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md, gap: 8,
  },
  summaryBox: {
    flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.sm,
    padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  summaryLabel: { color: COLORS.textSecondary, fontSize: 10, marginBottom: 4 },
  summaryValue: { color: COLORS.text, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  card: {
    backgroundColor: COLORS.card, margin: SPACING.lg, marginTop: 0,
    borderRadius: RADIUS.md, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.card2,
    borderRadius: RADIUS.md, padding: 4, gap: 4, marginBottom: 12,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontSize: 11, fontWeight: 'bold' },
  tabTextActive: { color: '#fff' },
  tabTeam: { color: COLORS.textMuted, fontSize: 9, marginTop: 2 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card2, padding: 12,
    borderRadius: RADIUS.md, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border, gap: 12,
  },
  playerRowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '22' },
  playerRowDisabled: { opacity: 0.4 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center',
  },
  avatarSelected: { backgroundColor: COLORS.primary },
  avatarText: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  playerInfo: { flex: 1 },
  playerName: { color: COLORS.textSecondary, fontSize: 14 },
  playerNameSelected: { color: COLORS.text, fontWeight: 'bold' },
  playerRole: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  checkCircle: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  startBtn: {
    backgroundColor: COLORS.primary, margin: SPACING.lg,
    padding: 18, borderRadius: RADIUS.md, alignItems: 'center',
  },
  startBtnDisabled: { backgroundColor: COLORS.textMuted },
  startBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});