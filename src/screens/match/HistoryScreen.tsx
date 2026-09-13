import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { getMatchHistory } from '../../utils/firebase';
import { Match } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import EmptyState from '../../components/EmptyState';
import AppIcon from '../../components/AppIcon';

export default function HistoryScreen({ navigation }: { navigation: any }) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [filtered, setFiltered] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    getMatchHistory()
      .then(data => {
        setMatches(data ?? []);
        setFiltered(data ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (!text.trim()) {
      setFiltered(matches);
      return;
    }
    const q = text.toLowerCase();
    setFiltered(
      matches.filter(m =>
        m.team1.toLowerCase().includes(q) ||
        m.team2.toLowerCase().includes(q) ||
        (m.venue ?? '').toLowerCase().includes(q)
      )
    );
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Match History"
        onBack={() => navigation.navigate('Home')}
      />

      <View style={styles.searchBox}>
        <AppIcon emoji="🔍" size={16} color={COLORS.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by team name or venue..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={handleSearch}
        />
        {search !== '' && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <AppIcon emoji="✕" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="🏏"
          title="No Matches Found"
          subtitle={
            search
              ? `No matches found for "${search}"`
              : 'Start scoring to see history here'
          }
          btnText={!search ? 'Start Match' : undefined}
          onBtn={!search ? () => navigation.navigate('NewMatch') : undefined}
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Scorecard', { matchId: item.id })}
            >
              <View pointerEvents="none" style={styles.cardEdge} />
              <View style={styles.cardHeader}>
                <Text style={styles.cardId}>#{item.id}</Text>
                <View style={[
                  styles.statusBadge,
                  item.status === 'live' && styles.liveBadge,
                ]}>
                  <View style={styles.badgeInner}>

                    <AppIcon emoji={item.status === 'completed' ? '✅' : '🔴'} size={10} color={item.status === 'completed' ? COLORS.primary : COLORS.red} />

                    <Text style={styles.statusText}>{item.status === 'completed' ? 'Done' : item.status === 'live' ? 'Live' : 'Paused'}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.teams} numberOfLines={1}>
                {item.team1} vs {item.team2}
              </Text>

              {item.venue ? (
                <View style={styles.metaRow}>
                  <AppIcon emoji="📍" size={11} color={COLORS.textMuted} />
                  <Text style={[styles.venue, { marginBottom: 0 }]} numberOfLines={1}>{item.venue}</Text>
                </View>
              ) : null}

              {item.matchDate ? (
                <View style={styles.metaRow}>
                  <AppIcon emoji="📅" size={11} color={COLORS.textMuted} />
                  <Text style={[styles.date, { marginBottom: 0 }]}>{item.matchDate}</Text>
                </View>
              ) : null}

              <View style={styles.scoreRow}>
                <Text style={styles.score}>
                  {item.innings1?.runs ?? 0}/{item.innings1?.wickets ?? 0}
                </Text>
                <Text style={styles.scoreVs}>vs</Text>
                <Text style={styles.score}>
                  {item.innings2?.runs ?? 0}/{item.innings2?.wickets ?? 0}
                </Text>
              </View>

              {item.winner ? (
                <View style={styles.winnerRow}>
                  <AppIcon emoji="🏆" size={12} color={COLORS.yellow} />
                  <Text style={styles.winner} numberOfLines={1}>{item.winner}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', backgroundColor: COLORS.background,
  },

  // ── Search ──
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, margin: SPACING.lg,
    borderRadius: RADIUS.round, paddingHorizontal: 14,
    paddingVertical: 12, borderWidth: 1,
    borderColor: COLORS.border, gap: SPACING.sm,
    ...SHADOW.sm,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, ...TYPE.body, color: COLORS.text, padding: 0 },
  clearBtn: { color: COLORS.textSecondary, fontSize: 16 },

  // ── Match cards ──
  // Elevated, hairline-bordered surfaces with a lit top edge, matching Card and
  // the Home screen. Previously flat rectangles with a heavy 1px border.
  list: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.lg, gap: 12 },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft,
    overflow: 'hidden', ...SHADOW.md,
  },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACING.sm,
  },
  cardId: { ...TYPE.numSm, color: COLORS.textMuted },
  statusBadge: {
    backgroundColor: COLORS.card2, paddingHorizontal: 9,
    paddingVertical: 4, borderRadius: RADIUS.round,
    borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  liveBadge: { backgroundColor: COLORS.live + '1f', borderColor: COLORS.live + '55' },
  badgeInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusText: { ...TYPE.label, fontSize: 10, color: COLORS.text },
  teams: { ...TYPE.h2, fontSize: 17, color: COLORS.text, marginBottom: 5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  venue: {
    ...TYPE.caption, color: COLORS.textSecondary,
    marginBottom: 4, flex: 1,
  },
  date: { ...TYPE.caption, fontSize: 11, color: COLORS.textMuted, marginBottom: 6 },

  // ── Score line ──
  // Sunk into a raised inner panel so the two innings totals read as one
  // paired figure, in tabular numerals so they align card to card.
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.md, marginTop: SPACING.sm, marginBottom: 6,
    backgroundColor: COLORS.card2, borderRadius: RADIUS.md,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
  },
  score: { ...TYPE.displaySm, fontSize: 20, color: COLORS.primaryLight },
  scoreVs: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  winner: { ...TYPE.caption, fontWeight: '700', color: COLORS.yellow, flex: 1 },
  resultBox: {
    backgroundColor: COLORS.yellow + '18', padding: 6,
    borderRadius: RADIUS.sm, marginTop: 4,
    borderWidth: 1, borderColor: COLORS.yellow + '55',
  },
  resultText: { ...TYPE.caption, fontWeight: '700', color: COLORS.yellow },
});
