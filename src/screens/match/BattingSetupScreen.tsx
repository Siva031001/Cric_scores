import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity,
  StyleSheet, ScrollView, Alert,
} from 'react-native';
import { createMatch, attachMatchIdToFixture } from '../../utils/firebase';
import { createEmptyInnings } from '../../utils/cricketLogic';
import { Player } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import AppIcon from '../../components/AppIcon';

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
      if (id === nonStrikerId) {
        Alert.alert('Error', 'Must be different from Non-Striker');
        return;
      }
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
        team1Logo: team1Logo ?? null,
        team2Logo: team2Logo ?? null,
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
      // Link the fixture back to this real match, so leaving the setup
      // wizard partway and coming back can actually resume it — without
      // this, tournament.matches/pools/knockoutFixtures never learn the
      // real matchId until the match COMPLETES, and Continue either shows
      // "Match not found" or starts a duplicate match for the same fixture.
      if (tournamentId && tournamentMatchId) {
        try {
          await attachMatchIdToFixture(tournamentId, tournamentMatchId, matchId);
        } catch (e) {
          console.warn('Could not link match to tournament fixture:', e);
        }
      }
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
        <Card tone="base" elevation="md" accent={COLORS.primary} style={styles.tossCard}>
          <View style={styles.tossRow}>
            <AppIcon emoji="🪙" size={14} color={COLORS.warning} />
            <Text style={styles.tossText}>
              {tossWinner} won toss • chose to {tossChoice}
            </Text>
          </View>
          <View style={styles.tossRow}>
            <AppIcon emoji="🏏" size={14} color={COLORS.primary} />
            <Text style={styles.battingFirst}>
              {battingTeam} batting first
            </Text>
          </View>
        </Card>
      )}

      {/* Teams */}
      <Card tone="base" elevation="md" style={styles.teamsCard}>
        <View style={styles.teamsRow}>
          <View style={styles.teamInfo}>
            <Text style={styles.teamRole}>BATTING</Text>
            <Text style={styles.teamName}>{battingTeam}</Text>
          </View>
          <View style={styles.vsBadge}>
            <Text style={styles.vs}>VS</Text>
          </View>
          <View style={styles.teamInfo}>
            <Text style={styles.teamRole}>BOWLING</Text>
            <Text style={styles.teamName}>{bowlingTeam}</Text>
          </View>
        </View>
      </Card>

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
      <Card tone="base" elevation="md" style={styles.card}>
        <View style={styles.tabBar}>
          {TABS.map(t => (
            <TouchableOpacity key={t.key}
              style={[styles.tab, activeTab === t.key && styles.tabActive]}
              onPress={() => setActiveTab(t.key)}>
              <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
                {t.label}
              </Text>
              <Text style={[styles.tabTeam, activeTab === t.key && styles.tabTeamActive]}>
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
          const isDisabled =
            (activeTab === 'nonstriker' && strikerId === player.id) ||
            (activeTab === 'striker' && nonStrikerId === player.id);

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
                  <AppIcon emoji="✓" size={14} color={COLORS.background} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </Card>

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
  // Toss outcome is context, not an action: a left-accented card rather than a
  // fully green panel competing with the Start button.
  tossCard: {
    margin: SPACING.lg, marginBottom: 0,
    padding: SPACING.md, gap: 6,
  },
  tossRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tossText: { ...TYPE.caption, color: COLORS.textSecondary },
  battingFirst: { ...TYPE.bodyStrong, color: COLORS.text },
  teamsCard: { margin: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md },
  teamsRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamInfo: { flex: 1, alignItems: 'center' },
  teamRole: { ...TYPE.label, fontSize: 10, color: COLORS.primary, marginBottom: 4 },
  teamName: { ...TYPE.title, color: COLORS.text, textAlign: 'center' },
  vsBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  vs: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  summaryRow: {
    flexDirection: 'row', marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md, gap: 8,
  },
  // Three at-a-glance slots. Raised surface + hairline border so they read as
  // filled-in state, not as buttons.
  summaryBox: {
    flex: 1, backgroundColor: COLORS.card2, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, paddingHorizontal: 8,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  summaryLabel: { ...TYPE.label, fontSize: 9, color: COLORS.textMuted, marginBottom: 4 },
  summaryValue: { ...TYPE.bodyStrong, fontSize: 12, color: COLORS.text, textAlign: 'center' },
  card: { margin: SPACING.lg, marginTop: 0, padding: SPACING.md },
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, padding: 4, gap: 4, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  tab: { flex: 1, paddingVertical: SPACING.sm, alignItems: 'center', borderRadius: RADIUS.sm },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.background },
  tabTeam: { ...TYPE.caption, fontSize: 9, color: COLORS.textMuted, marginTop: 2 },
  tabTeamActive: { color: COLORS.background, opacity: 0.7 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card2, padding: 12,
    borderRadius: RADIUS.md, marginBottom: SPACING.sm - 2,
    borderWidth: 1, borderColor: COLORS.borderSoft, gap: 12,
  },
  playerRowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  playerRowDisabled: { opacity: 0.4 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatarSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  avatarText: { ...TYPE.title, color: COLORS.text },
  playerInfo: { flex: 1 },
  playerName: { ...TYPE.body, color: COLORS.textSecondary },
  playerNameSelected: { ...TYPE.bodyStrong, color: COLORS.text },
  playerRole: { ...TYPE.caption, fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  checkCircle: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  // The single most important action on the screen, so it carries the glow.
  startBtn: {
    backgroundColor: COLORS.primary, margin: SPACING.lg,
    height: 56, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW.glow(COLORS.primary),
  },
  startBtnDisabled: { backgroundColor: COLORS.primaryDark, shadowOpacity: 0, elevation: 0 },
  startBtnText: { ...TYPE.button, fontSize: 17, color: COLORS.background },
});