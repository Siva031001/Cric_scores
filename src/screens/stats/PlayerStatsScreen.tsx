import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { getPlayerCareerStats } from '../../utils/firebase';
import { AdRewardedGate } from '../../components/AdPlaceholder';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
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

  const Row = ({ label, value }: { label: string; value: any }) => (
    <View style={s.statRow}>
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
      <Header title={name ?? 'Player'} onBack={() => navigation.goBack()} />

      <ScrollView contentContainerStyle={{ padding: SPACING.lg }}>
        <View style={s.hero}>
          <View style={s.avatar}>
            {photo
              ? <Image source={{ uri: photo }} style={s.avatarImg} />
              : <Text style={s.avatarText}>{(name ?? 'P').charAt(0).toUpperCase()}</Text>}
          </View>
          <Text style={s.heroName} numberOfLines={2}>{name ?? 'Player'}</Text>
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
              <Row label="Matches" value={b.matches} />
              <Row label="Innings" value={b.innings} />
              <Row label="Runs" value={b.runs} />
              <Row label="Balls" value={b.balls} />
              <Row label="High Score" value={dash(b.highScore, b.innings > 0)} />
              <Row label="Average" value={dash(b.average, b.innings - b.notOut > 0)} />
              <Row label="Strike Rate" value={dash(b.strikeRate, b.balls > 0)} />
              <Row label="Not Out" value={b.notOut} />
              <Row label="100s / 50s / 25s" value={`${b.hundreds} / ${b.fifties} / ${b.twentyFives}`} />
              <Row label="4s / 6s" value={`${b.fours} / ${b.sixes}`} />
              <Row label="Ducks" value={b.ducks} />
            </View>

            <View style={[s.card, s.cardBowling]}>
              <View pointerEvents="none" style={s.cardEdge} />
              <View style={s.cardHead}>
                <View style={[s.cardIconBox, { backgroundColor: COLORS.blue + '1f' }]}>
                  <AppIcon emoji="🎯" size={16} color={COLORS.blue} />
                </View>
                <Text style={[s.section, { color: COLORS.blue }]}>Bowling</Text>
              </View>
              <Row label="Matches" value={w.matches} />
              <Row label="Innings" value={w.innings} />
              <Row label="Overs" value={`${Math.floor(w.balls / 6)}.${w.balls % 6}`} />
              <Row label="Runs" value={w.runs} />
              <Row label="Wickets" value={w.wickets} />
              <Row label="Best" value={w.bestFigure} />
              <Row label="Average" value={dash(w.average, w.wickets > 0)} />
              <Row label="Economy" value={dash(w.economy, w.balls > 0)} />
              <Row label="Strike Rate" value={dash(w.strikeRate, w.wickets > 0)} />
              <Row label="Maidens" value={w.maidens} />
              <Row label="Dots" value={w.dots} />
              <Row label="2w / 4w" value={`${w.twoWickets} / ${w.fourWickets}`} />
            </View>

            <View style={[s.card, s.cardFielding]}>
              <View pointerEvents="none" style={s.cardEdge} />
              <View style={s.cardHead}>
                <View style={[s.cardIconBox, { backgroundColor: COLORS.purple + '1f' }]}>
                  <AppIcon emoji="🤚" size={16} color={COLORS.purple} />
                </View>
                <Text style={[s.section, { color: COLORS.purple }]}>Fielding</Text>
              </View>
              <Row label="Catches" value={f.catches} />
              <Row label="Stumpings" value={f.stumpings} />
              <Row label="Run Outs" value={f.runOuts} />
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
  hero: { alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.lg },
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
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 2,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    overflow: 'hidden',
    ...SHADOW.md,
  },
  cardBatting: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  cardBowling: { borderLeftWidth: 3, borderLeftColor: COLORS.blue },
  cardFielding: { borderLeftWidth: 3, borderLeftColor: COLORS.purple },
  cardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  cardHead: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  cardIconBox: { width: 30, height: 30, borderRadius: RADIUS.sm, alignItems: 'center', justifyContent: 'center' },

  // ── Stat rows ──
  // Label muted and value bold + tabular, so the figures form a clean right
  // column that can be scanned without reading the labels.
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 9, gap: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft,
  },
  statLabel: { ...TYPE.body, color: COLORS.textSecondary, flexShrink: 1 },
  statValue: { ...TYPE.num, fontSize: 15, color: COLORS.text },
});
