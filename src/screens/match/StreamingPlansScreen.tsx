import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

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
            <View key={p.title} style={[s.card, p.popular && s.cardPopular]}>
              {p.popular && (
                <View style={s.popularTag}><Text style={s.popularTagTxt}>Most Popular</Text></View>
              )}
              <Text style={[s.cardTitle, p.popular && { color: '#fff' }]}>{p.title}</Text>
              <Text style={[s.cardPrice, p.popular && { color: '#fff' }]}>{p.price}</Text>
              {p.features.map((f, i) => (
                <Text key={i} style={[s.cardFeature, p.popular && { color: 'rgba(255,255,255,0.85)' }]}>• {f}</Text>
              ))}
            </View>
          ))}
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  comingSoonBanner: { backgroundColor: COLORS.teal + '22', margin: SPACING.lg, marginBottom: 0, padding: 14, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.teal + '55', alignItems: 'center' },
  comingSoonTxt: { color: COLORS.teal, fontSize: 15, fontWeight: 'bold', marginBottom: 4 },
  comingSoonSub: { color: COLORS.textSecondary, fontSize: 12, textAlign: 'center' },
  scroll: { flex: 1 },
  grid: { padding: SPACING.lg, gap: 12 },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: COLORS.border },
  cardPopular: { backgroundColor: COLORS.teal, borderColor: COLORS.teal },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: 'bold', marginBottom: 6 },
  cardPrice: { color: COLORS.primary, fontSize: 26, fontWeight: 'bold', marginBottom: 10 },
  cardFeature: { color: COLORS.textSecondary, fontSize: 12, marginBottom: 4 },
  popularTag: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.round, marginBottom: 10 },
  popularTagTxt: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
});