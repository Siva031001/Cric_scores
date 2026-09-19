import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator,
} from 'react-native';
import { getMyTournaments, getCurrentUser, getTournamentDisplayStatus } from '../../utils/firebase';
import { Tournament } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import AppIcon from '../../components/AppIcon';
import Badge from '../../components/Badge';

export default function MyTournamentScreen({ navigation }: any) {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

    useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      setLoading(true);
      try {
        const data = await getMyTournaments();
        // This screen represents tournaments the user PLAYS in, not ones
        // they organize — organizer-owned tournaments are already shown
        // separately via the Homepage's own "My Tournaments" filter chip.
        // If a tournament is both created by the user and they're also a
        // participant, organizer ownership takes priority (it's excluded
        // here and only appears in the organizer view).
        const myUid = getCurrentUser()?.uid;
        const playedTournaments = data.filter((t: any) => t.createdBy !== myUid);
        setTournaments(playedTournaments);
      } catch (e) { console.error(e); }
      finally { setLoading(false); }
    });
    return unsub;
  }, [navigation]);

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Header
        title="My Tournaments"
        onBack={() => navigation.goBack()}
        rightText="New"
        onRight={() => navigation.navigate('CreateTournament')}
      />
      {/* Soft colour blobs behind the list — same plain tinted-View technique
          used across the app, non-interactive and purely decorative. Starts
          below the header's own opaque background so it never overlaps the
          title. */}
      {tournaments.length > 0 && (
        <View pointerEvents="none" style={styles.heroBlobWrap}>
          <View style={[styles.heroBlob, { backgroundColor: COLORS.blue, top: -30, left: -30 }]} />
          <View style={[styles.heroBlob, { backgroundColor: COLORS.teal, top: -10, right: -50 }]} />
        </View>
      )}
      {tournaments.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="No Tournaments"
          subtitle="Create your first tournament"
          btnText="Create Tournament"
          onBtn={() => navigation.navigate('CreateTournament')}
        />
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const displayStatus = getTournamentDisplayStatus(item);
            return (
            <TouchableOpacity
              style={[styles.card, { borderLeftColor: displayStatus === 'live' ? COLORS.live : displayStatus === 'completed' ? COLORS.success : COLORS.info }]}
              onPress={() => navigation.navigate('TournamentDetail', { tournamentId: item.id })}
              activeOpacity={0.85}>
              <View pointerEvents="none" style={styles.cardEdge} />
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Badge
                  label={displayStatus === 'live' ? 'LIVE' : displayStatus === 'completed' ? 'Done' : 'Upcoming'}
                  tone={displayStatus === 'live' ? 'live' : displayStatus === 'completed' ? 'success' : 'info'}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <AppIcon emoji="🏢" size={13} color={COLORS.textSecondary} />
                    <Text style={[styles.cardSub, { marginBottom: 0 }]}>{item.organisationName}</Text>
              </View>
                    {item.venue ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <AppIcon emoji="📍" size={13} color={COLORS.textSecondary} />
                <Text style={[styles.cardSub, { marginBottom: 0 }]}>{item.venue}</Text>
              </View>
              ) : null}
              <View style={styles.cardFooter}>
                <Text style={styles.cardInfo}>
                  {item.teams?.length ?? 0} Teams • {item.matches?.length ?? 0} Matches
                </Text>
                <Text style={styles.cardFormat}>{item.format ?? '20 Overs'}</Text>
              </View>
            </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  // Starts at ~ the header's own height (paddingTop 50 + paddingBottom +
  // title line) so the blobs never draw over the header's title/back button.
  heroBlobWrap: { position: 'absolute', top: 95, left: 0, right: 0, height: 140, overflow: 'hidden' },
  heroBlob: { position: 'absolute', width: 150, height: 150, borderRadius: 75, opacity: 0.12 },
  list: { padding: SPACING.lg, gap: 12 },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft,
    // Status-coloured stripe; the colour itself is set inline from the
    // already-computed displayStatus.
    borderLeftWidth: 3,
    overflow: 'hidden',
    ...SHADOW.md,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm },
  cardName: { ...TYPE.h2, color: COLORS.text, flex: 1 },
  // Kept because the stylesheet keys are still referenced elsewhere in the
  // file's history; harmless and cheap to retain.
  badge: { backgroundColor: COLORS.card2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.round },
  liveBadge: { backgroundColor: COLORS.live + '33' },
  doneBadge: { backgroundColor: COLORS.success + '33' },
  badgeText: { ...TYPE.label, fontSize: 10, color: COLORS.text },
  cardSub: { ...TYPE.body, color: COLORS.textSecondary, marginBottom: 4 },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: SPACING.sm, paddingTop: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft,
  },
  cardInfo: { ...TYPE.caption, color: COLORS.textSecondary },
  cardFormat: { ...TYPE.label, fontSize: 10, color: COLORS.primary, backgroundColor: COLORS.primarySoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.round, overflow: 'hidden' },
});