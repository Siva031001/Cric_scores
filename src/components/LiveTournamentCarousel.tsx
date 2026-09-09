import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Image } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';
import { getTournamentDisplayStatus } from '../utils/firebase';

const CARD_WIDTH = Dimensions.get('window').width * 0.72;

// Generates a consistent, distinct gradient-ish two-tone look per tournament
// name, so cards are visually distinguishable from each other without any
// real uploaded image. Same name always produces the same colors.
const BANNER_PALETTES = [
  ['#6366f1', '#8b5cf6'], // indigo → purple
  ['#0ea5e9', '#06b6d4'], // sky → cyan
  ['#f59e0b', '#ef4444'], // amber → red
  ['#10b981', '#059669'], // emerald → green
  ['#ec4899', '#d946ef'], // pink → fuchsia
  ['#3b82f6', '#1d4ed8'], // blue → deep blue
  ['#f97316', '#eab308'], // orange → yellow
  ['#14b8a6', '#0891b2'], // teal → cyan
];

const getBannerPalette = (name: string): [string, string] => {
  const str = name || 'Tournament';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % BANNER_PALETTES.length;
  return BANNER_PALETTES[idx] as [string, string];
};

export default function LiveTournamentCarousel({ tournaments, onPress }: { tournaments: any[]; onPress: (t: any) => void }) {
  if (tournaments.length === 0) {
    return (
      <View style={s.emptyBox}>
        <Text style={s.emptyTxt}>No tournaments to discover yet</Text>
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scrollContent} snapToInterval={CARD_WIDTH + 12} decelerationRate="fast">
      {tournaments.map((t) => (
        <TouchableOpacity key={t.id} style={[s.card, { width: CARD_WIDTH }]} onPress={() => onPress(t)}>
          {t.bannerUrl ? (
            <Image source={{ uri: t.bannerUrl }} style={s.banner} resizeMode="cover" />
          ) : (
            <View style={[s.banner, { backgroundColor: getBannerPalette(t.name)[0] }]}>
              <View style={[s.bannerAccent, { backgroundColor: getBannerPalette(t.name)[1] }]} />
              <Text style={s.bannerInitial}>{(t.name ?? '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {getTournamentDisplayStatus(t) === 'live' && (
            <View style={s.liveBadge}>
              <View style={s.liveDot} />
              <Text style={s.liveTxt}>LIVE</Text>
            </View>
          )}
          <Text style={s.name} numberOfLines={1}>{t.name}</Text>
          <Text style={s.meta} numberOfLines={1}>📍 {t.venue || 'Venue TBD'}</Text>
          <View style={s.metaRow}>
            <Text style={s.metaSmall}>{t.tournamentFormat || 'League'}</Text>
            <Text style={s.metaSmall}>{(t.teams ?? []).length} teams</Text>
            <View style={[s.statusPill, getTournamentDisplayStatus(t) === 'live' && s.statusPillLive, getTournamentDisplayStatus(t) === 'completed' && s.statusPillDone]}>
              <Text style={s.statusPillTxt}>{getTournamentDisplayStatus(t) === 'live' ? 'Live' : getTournamentDisplayStatus(t) === 'completed' ? 'Completed' : 'Upcoming'}</Text>
            </View>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrollContent: { paddingHorizontal: SPACING.lg, gap: 12 },
  emptyBox: { padding: SPACING.lg, alignItems: 'center' },
  emptyTxt: { color: COLORS.textMuted, fontSize: 13 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 12, borderWidth: 1, borderColor: COLORS.border, marginRight: 12 },
  banner: { height: 70, borderRadius: RADIUS.md, justifyContent: 'center', alignItems: 'center', marginBottom: 8, position: 'relative', overflow: 'hidden' },
  bannerAccent: { position: 'absolute', right: -20, top: -20, width: 90, height: 90, borderRadius: 45, opacity: 0.6 },
  bannerInitial: { color: COLORS.primary, fontSize: 28, fontWeight: 'bold' },
  liveBadge: { position: 'absolute', top: 6, right: 6, backgroundColor: COLORS.red, borderRadius: RADIUS.round, paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  liveTxt: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  name: { color: COLORS.text, fontSize: 14, fontWeight: 'bold', marginBottom: 2 },
  meta: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaSmall: { color: COLORS.textMuted, fontSize: 10 },
  statusPill: { backgroundColor: COLORS.card2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: RADIUS.round, marginLeft: 'auto' },
  statusPillLive: { backgroundColor: COLORS.red + '33' },
  statusPillDone: { backgroundColor: COLORS.primary + '33' },
  statusPillTxt: { color: COLORS.text, fontSize: 9, fontWeight: 'bold' },
});