import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { getMatchHistory } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

type Bucket = 'active' | 'scheduled' | 'completed' | 'draft';

export default function MyLiveStreamsScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<any[]>([]);
  const [tab, setTab] = useState<Bucket>('active');

  useEffect(() => {
    getMatchHistory()
      .then((d) => setMatches((d ?? []).filter((m: any) => m.isLive !== undefined || m.isStreaming !== undefined)))
      .catch(() => setMatches([]))
      .finally(() => setLoading(false));
  }, []);

  // Bucketing against the CURRENT schema:
  // active     = status live AND currently streaming
  // scheduled  = status live but streaming not yet started (isLive true, isStreaming false)
  // completed  = status completed AND was ever streamed
  // draft      = TODO: no "scheduled for later" concept exists yet in this app's
  //              match model (matches are created and go live immediately) —
  //              this bucket is a placeholder until a "Schedule Live" flow (§17) exists.
  const buckets: Record<Bucket, any[]> = {
    active: matches.filter((m) => m.status === 'live' && m.isStreaming),
    scheduled: matches.filter((m) => m.status === 'live' && !m.isStreaming),
    completed: matches.filter((m) => m.status === 'completed' && (m.streamUrl || m.isStreaming !== undefined)),
    draft: [],
  };

  const TABS: { key: Bucket; label: string }[] = [
    { key: 'active', label: 'Active' },
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'completed', label: 'Completed' },
    { key: 'draft', label: 'Draft' },
  ];

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const list = buckets[tab];

  return (
    <View style={s.container}>
      <Header title="My Live Streams" onBack={() => navigation.goBack()} />
      <View style={s.tabs}>
        {TABS.map((t) => (
          <TouchableOpacity key={t.key} style={[s.tab, tab === t.key && s.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[s.tabTxt, tab === t.key && s.tabTxtActive]}>{t.label} ({buckets[t.key].length})</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={s.scroll}>
        {tab === 'draft' ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>Scheduled/Draft Streams</Text>
            <Text style={s.emptySub}>Coming soon — this will let you schedule a live stream ahead of time instead of starting it immediately.</Text>
          </View>
        ) : list.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No {tab} streams</Text>
            <Text style={s.emptySub}>Streams you start will appear here.</Text>
          </View>
        ) : (
          list.map((m: any) => (
            <TouchableOpacity
              key={m.id}
              style={s.card}
              onPress={() => navigation.navigate(m.status === 'completed' ? 'Scorecard' : 'StreamingDashboard', { matchId: m.id })}
            >
              <View style={s.cardTop}>
                <Text style={s.cardTeams}>{m.team1} vs {m.team2}</Text>
                <View style={[s.badge, tab === 'active' && s.badgeLive, tab === 'completed' && s.badgeDone]}>
                  <Text style={s.badgeTxt}>{tab === 'active' ? 'LIVE' : tab === 'scheduled' ? 'Ready' : 'Done'}</Text>
                </View>
              </View>
              {m.venue ? <Text style={s.cardVenue}>{m.venue}</Text> : null}
              <Text style={s.cardMeta}>Match ID: {m.id}</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabTxt: { color: COLORS.textSecondary, fontSize: 11, fontWeight: 'bold' },
  tabTxtActive: { color: COLORS.primary },
  scroll: { flex: 1, padding: SPACING.lg },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTeams: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  badge: { backgroundColor: COLORS.card2, paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.round },
  badgeLive: { backgroundColor: COLORS.red + '33' },
  badgeDone: { backgroundColor: COLORS.primary + '33' },
  badgeTxt: { color: COLORS.text, fontSize: 10, fontWeight: 'bold' },
  cardVenue: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  cardMeta: { color: COLORS.textMuted, fontSize: 11 },
  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTxt: { color: COLORS.text, fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: SPACING.xl },
});