import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { getPlayerPublicProfiles } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';

// Purely decorative colour cycle for the avatar ring — same technique used on
// the squad-management screens (CreateTeamScreen/TeamDetailScreen) so a long
// roster reads as a set of individuals rather than one flat list. Only ever
// feeds style props, never compared or branched on.
const ACCENT_CYCLE = [COLORS.primary, COLORS.teal, COLORS.orange, COLORS.blue, COLORS.purple, COLORS.yellow];

// Read-only squad list for a tournament team, reachable by any viewer.
//
// Deliberately NOT TeamDetailScreen: that screen loads via getMyTeams(), i.e.
// only the signed-in user's OWN teams, so a viewer opening another organiser's
// team would just see "Team not found". It also shows role, batting/bowling
// style and captain/keeper badges, whereas this list is specified to show only
// a photo and a name.
//
// The roster comes in through route params from the tournament the viewer is
// already looking at (tournament.teams[].players), so no extra tournament read
// is needed. Photos are the one thing that must be fetched: they live on
// players/{globalPlayerId}, mirrored there from the owner's profile by
// syncProfileToLinkedPlayer, because a profile itself is readable only by its
// owner.
export default function TeamPlayersScreen({ route, navigation }: any) {
  const { teamName, players } = route.params ?? {};
  const roster: any[] = Array.isArray(players) ? players : [];
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ids = roster.map((p) => p?.globalPlayerId).filter(Boolean);
        const map = await getPlayerPublicProfiles(ids);
        if (!cancelled) setProfiles(map);
      } catch (e) {
        // A failed photo lookup must not hide the squad — fall back to initials.
        console.warn('Could not load player photos:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roster.length]);

  const renderPlayer = ({ item, index }: any) => {
    const gid = item?.globalPlayerId ?? null;
    const profile = gid ? profiles[gid] : null;
    const photo = profile?.photo ?? null;
    const name = profile?.name || item?.name || 'Player';
    const accent = ACCENT_CYCLE[index % ACCENT_CYCLE.length];
    return (
      <TouchableOpacity
        style={[s.row, { borderLeftWidth: 3, borderLeftColor: accent }]}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('PlayerStats', { globalPlayerId: gid, name, photo })}
      >
        <View pointerEvents="none" style={s.rowEdge} />
        <View style={[s.avatar, { borderColor: accent + '55' }]}>
          {photo
            ? <Image source={{ uri: photo }} style={s.avatarImg} />
            : <Text style={[s.avatarText, { color: accent }]}>{name.charAt(0).toUpperCase()}</Text>}
        </View>
        {/* Only the name is shown, per spec — no role, style or contact detail. */}
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        <Text style={s.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={s.container}>
      <Header title={teamName ?? 'Team'} onBack={() => navigation.goBack()} />
      {loading && roster.length > 0 ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
      ) : roster.length === 0 ? (
        <EmptyState
          icon="👥"
          title="No players added to this team yet"
          subtitle="The organiser adds a squad from the tournament's Teams tab."
        />
      ) : (
        <FlatList
          data={roster}
          keyExtractor={(item, i) => String(item?.globalPlayerId ?? item?.id ?? i)}
          renderItem={renderPlayer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.list}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg, gap: 6 },

  list: { padding: SPACING.lg, paddingBottom: SPACING.xl },
  // Squad row: photo + name only, so the name carries the whole row.
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    padding: 12, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.sm,
  },
  rowEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  avatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.primary + '55',
  },
  avatarImg: { width: 46, height: 46 },
  avatarText: { ...TYPE.h2, color: COLORS.primaryLight },
  name: { ...TYPE.title, color: COLORS.text, flex: 1 },
  chevron: { color: COLORS.textMuted, fontSize: 22, lineHeight: 24, paddingHorizontal: 2 },
});
