import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator,
} from 'react-native';
import { getMyTournaments, getCurrentUser } from '../../utils/firebase';
import { Tournament } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import AppIcon from '../../components/AppIcon';

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
        rightText="+ New"
        onRight={() => navigation.navigate('CreateTournament')}
      />
      {tournaments.length === 0 ? (
        <EmptyState
          icon="🏆"
          title="No Tournaments"
          subtitle="Create your first tournament"
          btnText="+ Create Tournament"
          onBtn={() => navigation.navigate('CreateTournament')}
        />
      ) : (
        <FlatList
          data={tournaments}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => navigation.navigate('TournamentDetail', { tournamentId: item.id })}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{item.name}</Text>
                <View style={[styles.badge,
                  item.status === 'live' && styles.liveBadge,
                  item.status === 'completed' && styles.doneBadge]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <AppIcon
                    emoji={item.status === 'live' ? '🔴' : item.status === 'completed' ? '✅' : '📅'}
                    size={11}
                    color={item.status === 'live' ? COLORS.red : item.status === 'completed' ? COLORS.primary : COLORS.textSecondary}
                    />
                    <Text style={styles.badgeText}>
                    {item.status === 'live' ? 'LIVE' : item.status === 'completed' ? 'Done' : 'Upcoming'}
                    </Text>
                    </View>
                </View>
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
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, gap: 12 },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardName: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', flex: 1 },
  badge: {
    backgroundColor: COLORS.card2, paddingHorizontal: 10,
    paddingVertical: 4, borderRadius: RADIUS.round,
  },
  liveBadge: { backgroundColor: COLORS.red + '33' },
  doneBadge: { backgroundColor: COLORS.primary + '33' },
  badgeText: { color: COLORS.text, fontSize: 11, fontWeight: 'bold' },
  cardSub: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  cardInfo: { color: COLORS.textSecondary, fontSize: 12 },
  cardFormat: { color: COLORS.primary, fontSize: 12, fontWeight: 'bold' },
});