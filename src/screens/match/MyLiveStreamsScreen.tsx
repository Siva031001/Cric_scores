import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { getMatchHistory } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import Badge from '../../components/Badge';

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
              style={[s.card, tab === 'active' && s.cardLive]}
              activeOpacity={0.85}
              onPress={() => navigation.navigate(m.status === 'completed' ? 'Scorecard' : 'StreamingDashboard', { matchId: m.id })}
            >
              <View style={s.cardTop}>
                <Text style={s.cardTeams}>{m.team1} vs {m.team2}</Text>
                <Badge
                  label={tab === 'active' ? 'LIVE' : tab === 'scheduled' ? 'Ready' : 'Done'}
                  tone={tab === 'active' ? 'live' : tab === 'completed' ? 'success' : 'info'}
                />
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
  // Segmented pill row instead of underlined tabs: four labels each carrying a
  // count need a container to read as one control.
  tabs: {
    flexDirection: 'row', gap: 6,
    marginHorizontal: SPACING.lg, marginTop: SPACING.sm,
    padding: 4, borderRadius: RADIUS.round,
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: RADIUS.round },
  tabActive: { backgroundColor: COLORS.primary, ...SHADOW.sm },
  // numSm, not label: the trailing "(3)" is a figure and should not jitter as
  // counts change width.
  tabTxt: { ...TYPE.numSm, color: COLORS.textSecondary },
  tabTxtActive: { color: COLORS.onPrimary },
  scroll: { flex: 1, padding: SPACING.lg },
  card: {
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.borderSoft,
    ...SHADOW.sm,
  },
  // On-air stream gets a live-coloured left edge, matching the live card
  // treatment on the home screen. COLORS.live, never COLORS.error.
  cardLive: { borderLeftWidth: 3, borderLeftColor: COLORS.live, borderColor: COLORS.live + '44', ...SHADOW.md },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.xs },
  cardTeams: { ...TYPE.title, color: COLORS.text, flex: 1, marginRight: SPACING.sm },
  cardVenue: { ...TYPE.caption, color: COLORS.textSecondary, marginBottom: 3 },
  cardMeta: { ...TYPE.numSm, fontSize: 11, color: COLORS.textMuted },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: SPACING.lg },
  emptyTxt: { ...TYPE.title, color: COLORS.text, marginBottom: SPACING.sm, textAlign: 'center' },
  emptySub: { ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: SPACING.md },
});
