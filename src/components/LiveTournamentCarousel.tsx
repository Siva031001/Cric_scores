import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions, Image } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../constants/theme';
import { getTournamentDisplayStatus } from '../utils/firebase';
import Badge from './Badge';

// Poster-style cards, so the banner is the card rather than a strip inside it.
// Taller and wider than before: this is the visual centrepiece of the home
// screen, and a 70px band could not carry an uploaded poster.
const CARD_WIDTH = Dimensions.get('window').width * 0.72;
const CARD_HEIGHT = 210;

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
      {tournaments.map((t) => {
        // Computed once per card instead of calling getTournamentDisplayStatus
        // four times in the JSX. Same function, same argument, same result —
        // no change to how status is derived.
        const status = getTournamentDisplayStatus(t);
        const palette = getBannerPalette(t.name);
        return (
          <TouchableOpacity key={t.id} style={[s.card, { width: CARD_WIDTH, height: CARD_HEIGHT }]} onPress={() => onPress(t)} activeOpacity={0.85}>
            {t.bannerUrl ? (
              <Image source={{ uri: t.bannerUrl }} style={s.banner} resizeMode="cover" />
            ) : (
              <View style={[s.banner, { backgroundColor: palette[0] }]}>
                <View style={[s.bannerAccent, { backgroundColor: palette[1] }]} />
                <View style={[s.bannerAccent2, { backgroundColor: palette[1] }]} />
                <Text style={s.bannerInitial}>{(t.name ?? '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}

            {/* Scrim so white text stays legible over any uploaded poster,
                however bright it is. */}
            <View pointerEvents="none" style={s.scrim} />

            {status === 'live' && <View style={s.badgeSlot}><Badge label="Live" tone="live" /></View>}

            <View style={s.info}>
              <Text style={s.name} numberOfLines={1}>{t.name}</Text>
              <Text style={s.meta} numberOfLines={1}>{t.venue || 'Venue TBD'}</Text>
              <View style={s.metaRow}>
                <View style={s.tag}><Text style={s.tagTxt}>{t.tournamentFormat || 'League'}</Text></View>
                <View style={s.tag}><Text style={s.tagTxt}>{(t.teams ?? []).length} teams</Text></View>
                {status !== 'live' && (
                  <Badge
                    label={status === 'completed' ? 'Completed' : 'Upcoming'}
                    tone={status === 'completed' ? 'success' : 'info'}
                    style={s.pushRight}
                  />
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrollContent: { paddingHorizontal: SPACING.lg, gap: 12, paddingBottom: SPACING.sm },
  emptyBox: { padding: SPACING.lg, alignItems: 'center' },
  emptyTxt: { ...TYPE.body, color: COLORS.textMuted },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    marginRight: 12,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    ...SHADOW.lg,
  },
  // Fills the whole card rather than sitting in a band at the top.
  banner: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  bannerAccent: { position: 'absolute', right: -30, top: -30, width: 140, height: 140, borderRadius: 70, opacity: 0.55 },
  bannerAccent2: { position: 'absolute', left: -40, bottom: -50, width: 160, height: 160, borderRadius: 80, opacity: 0.3 },
  bannerInitial: { fontSize: 64, fontWeight: '800', color: 'rgba(255,255,255,0.28)' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,6,14,0.45)' },
  badgeSlot: { position: 'absolute', top: SPACING.sm, right: SPACING.sm },
  info: { padding: SPACING.md, gap: 3 },
  name: { ...TYPE.h2, color: '#fff' },
  meta: { ...TYPE.caption, color: 'rgba(255,255,255,0.72)', marginBottom: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { backgroundColor: 'rgba(255,255,255,0.16)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.round },
  tagTxt: { ...TYPE.label, fontSize: 9, color: '#fff' },
  pushRight: { marginLeft: 'auto' },
});
