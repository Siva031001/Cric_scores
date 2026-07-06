import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
import { getMyTeams } from '../../utils/firebase';
import { Team, Player } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';

export default function TeamDetailScreen({ route, navigation }: any) {
  const { teamId } = route.params;
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyTeams().then(teams => {
      const found = teams.find(t => t.id === teamId);
      setTeam(found ?? null);
    }).finally(() => setLoading(false));
  }, [teamId]);

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  if (!team) return (
    <View style={styles.center}>
      <Text style={styles.notFound}>Team not found</Text>
    </View>
  );

  const captain = team.players.find(p => p.isCaptain);
  const wk = team.players.find(p => p.isWicketKeeper);

  return (
    <ScrollView style={styles.container}>
      <Header
        title="Team Details"
        onBack={() => navigation.goBack()}
      />

      {/* Team Header */}
      <View style={styles.teamHeader}>
        <View style={styles.logoBox}>
          {team.logo ? (
            <Image source={{ uri: team.logo }} style={styles.logoImg} />
          ) : (
            <Text style={styles.logoText}>
              {team.name.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <Text style={styles.teamName}>{team.name}</Text>
        <Text style={styles.teamSub}>{team.players.length} Players</Text>
      </View>

      {/* Key Players */}
      <View style={styles.keyRow}>
        <View style={styles.keyBox}>
          <AppIcon emoji="👑" size={24} color={COLORS.yellow} />
          <Text style={styles.keyLabel}>Captain</Text>
          <Text style={styles.keyValue}>{captain?.name ?? 'Not set'}</Text>
       </View>
        <View style={styles.keyBox}>
        <AppIcon emoji="🧤" size={24} color={COLORS.blue} />
        <Text style={styles.keyLabel}>Wicket Keeper</Text>
        <Text style={styles.keyValue}>{wk?.name ?? 'Not set'}</Text>
      </View>
      </View>

      {/* Player List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Squad ({team.players.length})</Text>
        {team.players.map((player: Player, index: number) => (
          <View key={player.id} style={styles.playerRow}>
            <View style={styles.playerNum}>
              <Text style={styles.playerNumText}>{index + 1}</Text>
            </View>
            <View style={styles.playerInfo}>
              <View style={styles.playerNameRow}>
                <Text style={styles.playerName}>{player.name}</Text>
                {player.isCaptain && (
                  <Text style={styles.badge}>C</Text>
                )}
                {player.isWicketKeeper && (
                  <Text style={[styles.badge, styles.wkBadge]}>WK</Text>
                )}
              </View>
              <Text style={styles.playerSub}>
                {player.role ?? 'Batter'} •{' '}
                {player.battingStyle ?? 'Right Hand'} bat
                {player.bowlingStyle ? ` • ${player.bowlingStyle}` : ''}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', backgroundColor: COLORS.background,
  },
  notFound: { color: COLORS.text, fontSize: 16 },
  teamHeader: { alignItems: 'center', paddingVertical: 25 },
  logoBox: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: COLORS.primary, justifyContent: 'center',
    alignItems: 'center', overflow: 'hidden',
    marginBottom: 12, borderWidth: 3, borderColor: COLORS.primary,
  },
  logoImg: { width: '100%', height: '100%' },
  logoText: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  teamName: { color: COLORS.text, fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  teamSub: { color: COLORS.textSecondary, fontSize: 14 },
  keyRow: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: SPACING.lg, marginBottom: 20,
  },
  keyBox: {
    flex: 1, backgroundColor: COLORS.card,
    borderRadius: RADIUS.md, padding: 14,
    alignItems: 'center', borderWidth: 1,
    borderColor: COLORS.border,
  },
  keyIcon: { fontSize: 24, marginBottom: 6 },
  keyLabel: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 },
  keyValue: { color: COLORS.text, fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  section: { paddingHorizontal: SPACING.lg },
  sectionTitle: {
    color: COLORS.text, fontSize: 16,
    fontWeight: 'bold', marginBottom: 12,
  },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: RADIUS.sm,
    padding: 12, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  playerNum: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.card2, justifyContent: 'center',
    alignItems: 'center',
  },
  playerNumText: { color: COLORS.textSecondary, fontSize: 13 },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerName: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  badge: {
    backgroundColor: COLORS.yellow, color: '#000',
    fontSize: 10, fontWeight: 'bold',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 4,
  },
  wkBadge: { backgroundColor: COLORS.blue, color: '#fff' },
  playerSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
});