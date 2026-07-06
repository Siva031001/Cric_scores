import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { getMatchHistory } from '../../utils/firebase';
import { Match } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
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
          btnText={!search ? '+ Start Match' : undefined}
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
              onPress={() => navigation.navigate('Scorecard', { matchId: item.id })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardId}>#{item.id}</Text>
                <View style={[
                  styles.statusBadge,
                  item.status === 'live' && styles.liveBadge,
                ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                         
                    <AppIcon emoji={item.status === 'completed' ? '✅' : '🔴'} size={10} color={item.status === 'completed' ? COLORS.primary : COLORS.red} />
                          
                    <Text style={styles.statusText}>{item.status === 'completed' ? 'Done' : item.status === 'live' ? 'Live' : 'Paused'}</Text>
                  </View>
                </View>
              </View>

              <Text style={styles.teams}>
                {item.team1} vs {item.team2}
              </Text>

              {item.venue ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <AppIcon emoji="📍" size={11} color={COLORS.textSecondary} />
                  <Text style={[styles.venue, { marginBottom: 0 }]}>{item.venue}</Text>
                </View>
              ) : null}
              
              {item.matchDate ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                  <AppIcon emoji="📅" size={11} color={COLORS.textSecondary} />
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <AppIcon emoji="🏆" size={12} color={COLORS.yellow} />
                  <Text style={styles.winner}>{item.winner}</Text>
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
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.card, margin: SPACING.lg,
    borderRadius: RADIUS.round, paddingHorizontal: 14,
    paddingVertical: 10, borderWidth: 1,
    borderColor: COLORS.border, gap: 8,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 14, padding: 0 },
  clearBtn: { color: COLORS.textSecondary, fontSize: 16 },
  list: { paddingHorizontal: SPACING.lg, paddingBottom: 20, gap: 12 },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.md,
    padding: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  cardId: { color: COLORS.textSecondary, fontSize: 12 },
  statusBadge: {
    backgroundColor: COLORS.card2, paddingHorizontal: 10,
    paddingVertical: 3, borderRadius: RADIUS.round,
  },
  liveBadge: { backgroundColor: COLORS.red + '33' },
  statusText: { color: COLORS.text, fontSize: 11, fontWeight: 'bold' },
  teams: {
    color: COLORS.text, fontSize: 16,
    fontWeight: 'bold', marginBottom: 4,
  },
  venue: {
    color: COLORS.textSecondary, fontSize: 12,
    marginBottom: 4,
  },
  date: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 6 },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, marginBottom: 6,
  },
  score: { color: COLORS.primary, fontSize: 18, fontWeight: 'bold' },
  scoreVs: { color: COLORS.textSecondary, fontSize: 12 },
  winner: { color: COLORS.yellow, fontSize: 13, fontWeight: 'bold' },
  resultBox: {
    backgroundColor: COLORS.yellow + '22', padding: 6,
    borderRadius: RADIUS.sm, marginTop: 4,
    borderWidth: 1, borderColor: COLORS.yellow + '55',
  },
  resultText: { color: COLORS.yellow, fontSize: 13, fontWeight: 'bold' },
});
