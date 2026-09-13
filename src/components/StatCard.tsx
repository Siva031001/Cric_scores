import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SHADOW, TYPE } from '../constants/theme';

/**
 * Single statistic. Same four props as before.
 *
 * The value now uses the tabular-numeral type scale so columns of stat cards
 * line up and a changing figure does not shift width.
 */
interface Props {
  label: string;
  value: string | number;
  color?: string;
  small?: boolean;
}

export default function StatCard({ label, value, color, small }: Props) {
  return (
    <View style={[styles.card, small && styles.small, SHADOW.sm]}>
      <View pointerEvents="none" style={styles.edge} />
      <Text style={[styles.value, color ? { color } : {}, small && styles.smallValue]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, small && styles.smallLabel]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    padding: 14,
    alignItems: 'center',
    margin: 4,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    minWidth: 80,
    overflow: 'hidden',
  },
  edge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  small: { padding: 10, minWidth: 60 },
  value: { ...TYPE.displaySm, fontSize: 22, color: COLORS.text },
  smallValue: { fontSize: 16 },
  label: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary, marginTop: 5, textAlign: 'center' },
  smallLabel: { fontSize: 9, marginTop: 3 },
});
