import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS } from '../constants/theme';

interface Props {
  label: string;
  value: string | number;
  color?: string;
  small?: boolean;
}

export default function StatCard({ label, value, color, small }: Props) {
  return (
    <View style={[styles.card, small && styles.small]}>
      <Text style={[styles.value, color ? { color } : {}, small && styles.smallValue]}>
        {value}
      </Text>
      <Text style={[styles.label, small && styles.smallLabel]}>{label}</Text>
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
    borderColor: COLORS.border,
    minWidth: 80,
  },
  small: { padding: 10, minWidth: 60 },
  value: { color: COLORS.text, fontSize: 22, fontWeight: 'bold' },
  smallValue: { fontSize: 16 },
  label: { color: COLORS.textSecondary, fontSize: 11, marginTop: 5, textAlign: 'center' },
  smallLabel: { fontSize: 10, marginTop: 3 },
});