import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import Card from '../../components/Card';

const OPTIONS = ['Single Camera', 'Multiple Camera', 'Front Camera', 'Rear Camera', 'External Camera', 'Screen Recording'];

// Decorative only — each row just cycles through the app's floodlights
// palette so an otherwise flat placeholder list doesn't read as broken or
// unstyled. Doesn't affect which options exist or their order.
const OPTION_ACCENTS = [COLORS.red, COLORS.orange, COLORS.yellow, COLORS.blue, COLORS.purple, COLORS.teal];

export default function CameraModeScreen({ navigation }: any) {
  return (
    <View style={s.container}>
      <Header title="Camera Mode" onBack={() => navigation.goBack()} />
      <View style={s.list}>
        {OPTIONS.map((o, i) => (
          <Card
            key={o}
            tone="base"
            elevation="sm"
            padded={false}
            accent={OPTION_ACCENTS[i % OPTION_ACCENTS.length]}
            style={s.item}
          >
            <Text style={s.itemTxt}>{o}</Text>
            <View style={s.tag}><Text style={s.tagTxt}>Coming Soon</Text></View>
          </Card>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, gap: 10 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  itemTxt: { color: COLORS.text, fontWeight: 'bold' },
  tag: { backgroundColor: COLORS.card2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.round },
  tagTxt: { color: COLORS.textMuted, fontSize: 11 },
});
