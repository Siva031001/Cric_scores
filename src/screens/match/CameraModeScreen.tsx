import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

const OPTIONS = ['Single Camera', 'Multiple Camera', 'Front Camera', 'Rear Camera', 'External Camera', 'Screen Recording'];

export default function CameraModeScreen({ navigation }: any) {
  return (
    <View style={s.container}>
      <Header title="Camera Mode" onBack={() => navigation.goBack()} />
      <View style={s.list}>
        {OPTIONS.map((o) => (
          <View key={o} style={s.item}>
            <Text style={s.itemTxt}>{o}</Text>
            <View style={s.tag}><Text style={s.tagTxt}>Coming Soon</Text></View>
          </View>
        ))}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.lg, gap: 10 },
  item: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, padding: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  itemTxt: { color: COLORS.text, fontWeight: 'bold' },
  tag: { backgroundColor: COLORS.card2, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.round },
  tagTxt: { color: COLORS.textMuted, fontSize: 11 },
});