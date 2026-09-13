import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, ActivityIndicator } from 'react-native';
import { getPlayerCareerStats } from '../../utils/firebase';
import { AdRewardedGate } from '../../components/AdPlaceholder';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

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
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
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
          <Text style={s.heroName}>{name ?? 'Player'}</Text>
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
            <Text style={s.section}>Batting</Text>
            <View style={s.card}>
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

            <Text style={s.section}>Bowling</Text>
            <View style={s.card}>
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

            <Text style={s.section}>Fielding</Text>
            <View style={s.card}>
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
  center: { justifyContent: 'center', alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
  emptyHint: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', paddingHorizontal: 20 },
  hero: { alignItems: 'center', gap: 8, marginBottom: 20 },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  avatarImg: { width: 76, height: 76 },
  avatarText: { color: COLORS.primary, fontSize: 30, fontWeight: 'bold' },
  heroName: { color: COLORS.text, fontSize: 20, fontWeight: 'bold' },
  heroSub: { color: COLORS.textSecondary, fontSize: 12 },
  section: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold', marginBottom: 8, marginTop: 6 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.border + '55' },
  statLabel: { color: COLORS.textSecondary, fontSize: 13 },
  statValue: { color: COLORS.text, fontSize: 13, fontWeight: 'bold' },
});
