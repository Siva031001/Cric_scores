import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import Badge from '../../components/Badge';

// Design-only per instructions — payment integration deliberately deferred.
// Layout follows the reference pricing pattern (per-match / time-based /
// theme-tier), adapted to smaller tiers appropriate for this app's current scale.
const PLANS = [
  { title: 'Per Match', price: '₹99', features: ['1 live match', 'Basic score themes'] },
  { title: 'Daily', price: '₹499', features: ['Unlimited streaming for 24 hours', 'Basic score themes'] },
  { title: 'Monthly', price: '₹1,499', features: ['Unlimited match streaming', 'Basic score themes'] },
  { title: 'Monthly Premium', price: '₹2,499', popular: true, features: ['Unlimited match streaming', 'All premium score themes'] },
  { title: 'Yearly', price: '₹9,999', features: ['Unlimited match streaming', 'Basic score themes'] },
  { title: 'Yearly Premium', price: '₹14,999', features: ['Unlimited match streaming', 'All premium score themes'] },
];

export default function StreamingPlansScreen({ navigation }: any) {
  return (
    <View style={s.container}>
      <Header title="Streaming Plans" onBack={() => navigation.goBack()} />
      <View style={s.comingSoonBanner}>
        <Text style={s.comingSoonTxt}>💎 Coming Soon</Text>
        <Text style={s.comingSoonSub}>Payment for streaming plans isn't live yet — pricing shown below is a preview.</Text>
      </View>
      <ScrollView style={s.scroll}>
        <View style={s.grid}>
          {PLANS.map((p) => (
            // A pricing card is a plain elevated surface, so the shared Card
            // takes over the border/elevation/edge-highlight work this screen
            // used to hand-roll. The popular tier gets Card's own accent-stripe
            // + glow treatment instead of a flat solid fill, matching how
            // emphasis is carried everywhere else in the app.
            <Card
              key={p.title}
              tone={p.popular ? 'raised' : 'base'}
              elevation={p.popular ? 'md' : 'sm'}
              accent={p.popular ? COLORS.teal : undefined}
            >
              {p.popular && <Badge label="Most Popular" tone="warning" style={s.popularTag} />}
              <Text style={[s.cardTitle, p.popular && s.cardTitlePopular]}>{p.title}</Text>
              <Text style={[s.cardPrice, p.popular && s.cardPricePopular]}>{p.price}</Text>
              {p.features.map((f, i) => (
                <Text key={i} style={s.cardFeature}>• {f}</Text>
              ))}
            </Card>
          ))}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Same accent-stripe + glow banner treatment used for milestone/callout
  // banners elsewhere (e.g. LiveViewScreen's milestone banner) instead of a
  // flat tinted box.
  comingSoonBanner: {
    backgroundColor: COLORS.card2, margin: SPACING.lg, marginBottom: 0, padding: 14,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.teal + '55',
    borderLeftWidth: 3, borderLeftColor: COLORS.teal, alignItems: 'center', ...SHADOW.md,
  },
  comingSoonTxt: { color: COLORS.teal, fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  comingSoonSub: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center' },
  scroll: { flex: 1 },
  grid: { padding: SPACING.lg, gap: 12 },
  popularTag: { alignSelf: 'flex-start', marginBottom: 10 },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  cardTitlePopular: { color: COLORS.teal },
  cardPrice: { color: COLORS.primary, fontSize: 26, fontWeight: 'bold', marginBottom: 10 },
  cardPricePopular: { color: COLORS.teal },
  cardFeature: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
});
