import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  Image, ActivityIndicator,
} from 'react-native';
import { getMyTeams } from '../../utils/firebase';
import { Team, Player } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
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

  const players = team.players ?? [];
  const captain = players.find(p => p.isCaptain);
  const wk = players.find(p => p.isWicketKeeper);

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
        <Text style={styles.teamName} numberOfLines={2}>{team.name}</Text>
        <View style={styles.teamSubPill}>
          <Text style={styles.teamSub}>{players.length} Players</Text>
        </View>
      </View>

      {/* Key Players */}
      <View style={styles.keyRow}>
        <View style={styles.keyBox}>
          <View pointerEvents="none" style={styles.cardEdge} />
          <View style={[styles.keyIconBox, { backgroundColor: COLORS.yellow + '1f' }]}>
          <AppIcon emoji="👑" size={20} color={COLORS.yellow} />
          </View>
          <Text style={styles.keyLabel}>Captain</Text>
          <Text style={styles.keyValue} numberOfLines={1}>{captain?.name ?? 'Not set'}</Text>
       </View>
        <View style={styles.keyBox}>
        <View pointerEvents="none" style={styles.cardEdge} />
        <View style={[styles.keyIconBox, { backgroundColor: COLORS.blue + '1f' }]}>
        <AppIcon emoji="🧤" size={20} color={COLORS.blue} />
        </View>
        <Text style={styles.keyLabel}>Wicket Keeper</Text>
        <Text style={styles.keyValue} numberOfLines={1}>{wk?.name ?? 'Not set'}</Text>
      </View>
      </View>

      {/* Player List */}
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={styles.sectionBar} />
          <Text style={styles.sectionTitle}>Squad ({players.length})</Text>
        </View>
        {players.map((player: Player, index: number) => (
          <View key={player.id} style={styles.playerRow}>
            <View pointerEvents="none" style={styles.cardEdge} />
            <View style={styles.playerNum}>
              <Text style={styles.playerNumText}>{index + 1}</Text>
            </View>
            <View style={styles.playerInfo}>
              <View style={styles.playerNameRow}>
                <Text style={styles.playerName} numberOfLines={1}>{player.name}</Text>
                {player.isCaptain && (
                  <Text style={styles.badge}>C</Text>
                )}
                {player.isWicketKeeper && (
                  <Text style={[styles.badge, styles.wkBadge]}>WK</Text>
                )}
              </View>
              <Text style={styles.playerSub} numberOfLines={1}>
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
  notFound: { ...TYPE.title, color: COLORS.text },

  // ── Crest hero ──
  teamHeader: { alignItems: 'center', paddingVertical: SPACING.lg, paddingHorizontal: SPACING.lg },
  logoBox: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.primarySoft, justifyContent: 'center',
    alignItems: 'center', overflow: 'hidden',
    marginBottom: SPACING.md, borderWidth: 3, borderColor: COLORS.primary,
    ...SHADOW.glow(COLORS.primary),
  },
  logoImg: { width: '100%', height: '100%' },
  logoText: { ...TYPE.display, fontSize: 38, color: COLORS.primaryLight },
  teamName: { ...TYPE.h1, color: COLORS.text, marginBottom: SPACING.sm, textAlign: 'center' },
  // The player count sits in a tinted pill so it reads as a stat, not a caption
  // competing with the team name.
  teamSubPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: RADIUS.round,
    backgroundColor: COLORS.card2,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  teamSub: { ...TYPE.caption, fontWeight: '700', color: COLORS.textSecondary },

  // ── Key players ──
  keyRow: {
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, marginBottom: SPACING.lg,
  },
  keyBox: {
    flex: 1, backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg, padding: SPACING.md,
    alignItems: 'center', borderWidth: 1,
    borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  keyIconBox: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  keyIcon: { fontSize: 24, marginBottom: 6 },
  keyLabel: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted, marginBottom: 4 },
  keyValue: { ...TYPE.title, color: COLORS.text, textAlign: 'center' },

  // ── Squad ──
  section: { paddingHorizontal: SPACING.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  sectionBar: { width: 3, height: 18, borderRadius: 2, backgroundColor: COLORS.primary },
  sectionTitle: { ...TYPE.h2, color: COLORS.text },
  playerRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: 12, marginBottom: 8, gap: 12,
    borderWidth: 1, borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  playerNum: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.card2, justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  // Tabular so a two-digit shirt number does not shift the name column.
  playerNumText: { ...TYPE.numSm, color: COLORS.textSecondary },
  playerInfo: { flex: 1 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerName: { ...TYPE.title, color: COLORS.text, flexShrink: 1 },
  badge: {
    ...TYPE.label, fontSize: 9,
    backgroundColor: COLORS.yellow, color: '#1a1400',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
  },
  wkBadge: { backgroundColor: COLORS.blue, color: '#ffffff' },
  playerSub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 3 },
});