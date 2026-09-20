import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { getPlayerCareerStats, getPlayerPublicProfile } from '../../utils/firebase';
import { AdRewardedGate } from '../../components/AdPlaceholder';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW, GRADIENTS } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';

// Read-only career statistics for any player.
//
// Flow, per spec: the advertisement is shown FIRST and the statistics are only
// revealed after it finishes. The stats load in the background while the ad is
// up, so there is no second wait afterwards.
//
// Skipping the ad is allowed to reveal the stats — AdRewardedGate's onSkip is
// otherwise a dead end, and the ad here is a monetisation step, not an
// entitlement check. Change to keeping them hidden if the intent is stricter.
export default function PlayerStatsScreen({ route, navigation }: any) {
  const { globalPlayerId, name, photo } = route.params ?? {};
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAd, setShowAd] = useState(true);
  // The caller passes whatever name it had on hand (often frozen into an old
  // match roster). Prefer the player's own current record when it has one.
  const [liveName, setLiveName] = useState<string | null>(null);
  const [livePhoto, setLivePhoto] = useState<string | null>(null);
  const displayName = liveName ?? name;
  const displayPhoto = livePhoto ?? photo;

  useEffect(() => {
    if (!globalPlayerId) return;
    getPlayerPublicProfile(globalPlayerId).then((p) => {
      if (p?.name) setLiveName(p.name);
      if (p?.photo) setLivePhoto(p.photo);
    }).catch(() => {});
  }, [globalPlayerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!globalPlayerId) {
        // A guest player who has never been linked to an account has no
        // cross-match identity, so there is nothing to aggregate.
        if (!cancelled) { setLoading(false); setError('unlinked'); }
        return;
      }
      try {
        const r = await getPlayerCareerStats(globalPlayerId);
        if (!cancelled) setStats(r);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Could not load statistics');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [globalPlayerId]);

  const Row = ({ label, value, index }: { label: string; value: any; index?: number }) => (
    <View style={[s.statRow, typeof index === 'number' && index % 2 === 1 && s.statRowAlt]}>
      <Text style={s.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={s.statValue} numberOfLines={1}>{value}</Text>
    </View>
  );

  const b = stats?.batting;
  const w = stats?.bowling;
  const f = stats?.fielding;
  // A zero average/strike rate is meaningless when they never batted, and a
  // zero bowling average is meaningless without a wicket — show '-' instead of
  // a misleading 0.
  const dash = (n: number, meaningful: boolean) => (meaningful ? String(n) : '-');

  return (
    <View style={s.container}>
      <Header title={displayName ?? 'Player'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        <View style={s.hero}>
          {/* Two overlapping tinted circles behind the avatar fake a soft
              gradient glow, matching the treatment used on Home/My Matches —
              absolute + clipped by hero's own overflow:hidden, so this cannot
              move the avatar, name or subtitle below it. */}
          <View pointerEvents="none" style={[s.heroBlob, { backgroundColor: GRADIENTS.ocean[0], left: -30, top: -20 }]} />
          <View pointerEvents="none" style={[s.heroBlob, { backgroundColor: GRADIENTS.ocean[1], right: -30, top: 10 }]} />
          <View style={s.avatar}>
            {displayPhoto
              ? <Image source={{ uri: displayPhoto }} style={s.avatarImg} />
              : <Text style={s.avatarText}>{(displayName ?? 'P').charAt(0).toUpperCase()}</Text>}
          </View>
          <Text style={s.heroName} numberOfLines={2}>{displayName ?? 'Player'}</Text>
          {stats ? <Text style={s.heroSub}>{stats.matches} match{stats.matches === 1 ? '' : 'es'} played</Text> : null}
        </View>

        {showAd ? (
          <View style={s.center}><Text style={s.emptyHint}>Loading statistics...</Text></View>
        ) : loading ? (
          <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>
        ) : error === 'unlinked' ? (
          <View style={s.center}>
            <Text style={s.emptyText}>No statistics yet</Text>
            <Text style={s.emptyHint}>
              This player hasn't registered with their mobile number, so their matches aren't linked to a profile yet.
            </Text>
          </View>
        ) : error ? (
          <View style={s.center}>
            <Text style={s.emptyText}>Could not load statistics</Text>
            <Text style={s.emptyHint}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={[s.card, s.cardBatting]}>
              <View pointerEvents="none" style={s.cardEdge} />
              <View style={s.cardHead}>
                <View style={[s.cardIconBox, { backgroundColor: COLORS.primary + '1f' }]}>
                  <AppIcon emoji="🏏" size={16} color={COLORS.primary} />
                </View>
                <Text style={[s.section, { color: COLORS.primary }]}>Batting</Text>
              </View>
              <Row label="Matches" value={b.matches} index={0} />
              <Row label="Innings" value={b.innings} index={1} />
              <Row label="Runs" value={b.runs} index={2} />
              <Row label="Balls" value={b.balls} index={3} />
              <Row label="High Score" value={dash(b.highScore, b.innings > 0)} index={4} />
              <Row label="Average" value={dash(b.average, b.innings - b.notOut > 0)} index={5} />
              <Row label="Strike Rate" value={dash(b.strikeRate, b.balls > 0)} index={6} />
              <Row label="Not Out" value={b.notOut} index={7} />
              <Row label="100s / 50s / 25s" value={`${b.hundreds} / ${b.fifties} / ${b.twentyFives}`} index={8} />
              <Row label="4s / 6s" value={`${b.fours} / ${b.sixes}`} index={9} />
              <Row label="Ducks" value={b.ducks} index={10} />
            </View>

            <View style={[s.card, s.cardBowling]}>
              <View pointerEvents="none" style={s.cardEdge} />
              <View style={s.cardHead}>
                <View style={[s.cardIconBox, { backgroundColor: COLORS.blue + '1f' }]}>
                  <AppIcon emoji="🎯" size={16} color={COLORS.blue} />
                </View>
                <Text style={[s.section, { color: COLORS.blue }]}>Bowling</Text>
              </View>
              <Row label="Matches" value={w.matches} index={0} />
              <Row label="Innings" value={w.innings} index={1} />
              <Row label="Overs" value={`${Math.floor(w.balls / 6)}.${w.balls % 6}`} index={2} />
              <Row label="Runs" value={w.runs} index={3} />
              <Row label="Wickets" value={w.wickets} index={4} />
              <Row label="Best" value={w.bestFigure} index={5} />
              <Row label="Average" value={dash(w.average, w.wickets > 0)} index={6} />
              <Row label="Economy" value={dash(w.economy, w.balls > 0)} index={7} />
              <Row label="Strike Rate" value={dash(w.strikeRate, w.wickets > 0)} index={8} />
              <Row label="Maidens" value={w.maidens} index={9} />
              <Row label="Dots" value={w.dots} index={10} />
              <Row label="2w / 4w" value={`${w.twoWickets} / ${w.fourWickets}`} index={11} />
            </View>

            <View style={[s.card, s.cardFielding]}>
              <View pointerEvents="none" style={s.cardEdge} />
              <View style={s.cardHead}>
                <View style={[s.cardIconBox, { backgroundColor: COLORS.purple + '1f' }]}>
                  <AppIcon emoji="🤚" size={16} color={COLORS.purple} />
                </View>
                <Text style={[s.section, { color: COLORS.purple }]}>Fielding</Text>
              </View>
              <Row label="Catches" value={f.catches} index={0} />
              <Row label="Stumpings" value={f.stumpings} index={1} />
              <Row label="Run Outs" value={f.runOuts} index={2} />
            </View>
          </>
        )}
      </ScrollView>

      <AdRewardedGate
        visible={showAd}
        onComplete={() => setShowAd(false)}
        onSkip={() => setShowAd(false)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: SPACING.xxl, gap: 6 },
  emptyText: { ...TYPE.title, color: COLORS.text, textAlign: 'center' },
  emptyHint: { ...TYPE.caption, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: SPACING.lg },

  // ── Player hero ──
  hero: { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg, overflow: 'hidden' },
  // Decorative gradient-fake blob, clipped by hero's own overflow:hidden so it
  // can only sit behind the avatar/name, never push them.
  heroBlob: { position: 'absolute', width: 120, height: 120, borderRadius: 60, opacity: 0.14 },
  avatar: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2, borderColor: COLORS.primary,
    ...SHADOW.glow(COLORS.primary),
  },
  avatarImg: { width: 84, height: 84 },
  avatarText: { ...TYPE.displaySm, color: COLORS.primaryLight },
  heroName: { ...TYPE.h1, color: COLORS.text, textAlign: 'center' },
  heroSub: { ...TYPE.caption, color: COLORS.textSecondary },

  // ── Stat groups ──
  // One card per discipline, each with a single accent so batting, bowling and
  // fielding are told apart at a glance while scrolling.
  section: { ...TYPE.label, color: COLORS.primary },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 2,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.md,
  },
  // A touch of the accent's own glow behind each card, echoing the shared
  // Card component's `accent` treatment — on top of the left accent stripe,
  // not instead of it.
  cardBatting: { borderLeftWidth: 3, borderLeftColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  cardBowling: { borderLeftWidth: 3, borderLeftColor: COLORS.blue, ...SHADOW.glow(COLORS.blue) },
  cardFielding: { borderLeftWidth: 3, borderLeftColor: COLORS.purple, ...SHADOW.glow(COLORS.purple) },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  cardIconBox: { width: 30, height: 30, borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center' },

  // ── Stat rows ──
  // Label muted and value bold + tabular, so the figures form a clean right
  // column that can be scanned without reading the labels.
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 9, gap: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft,
  },
  // Zebra tint — background only, so alternating rows can't shift the label/
  // value columns.
  statRowAlt: { backgroundColor: COLORS.card2 },
  statLabel: { ...TYPE.body, color: COLORS.textSecondary, flexShrink: 1 },
  statValue: { ...TYPE.num, fontSize: 15, color: COLORS.text },
});
