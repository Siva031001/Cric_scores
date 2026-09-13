import React from 'react';
import { View, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { COLORS, SPACING, TYPE } from '../constants/theme';

/**
 * Section heading with an optional right-hand slot for an action.
 *
 * Purely presentational. Screens previously used bare <Text> with ad-hoc sizes,
 * which is why sections didn't read as sections. The accent bar gives a
 * consistent anchor down the left edge of a scrolling screen.
 */
interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  /** Colour of the leading bar. Defaults to the brand accent. */
  accent?: string;
  style?: StyleProp<ViewStyle>;
}

export default function SectionHeader({ title, subtitle, right, accent, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <View style={[styles.bar, { backgroundColor: accent ?? COLORS.primary }]} />
      <View style={styles.textCol}>
        <Text style={[TYPE.h2, styles.title]} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.sub} numberOfLines={1}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.md },
  bar: { width: 3, height: 20, borderRadius: 2 },
  textCol: { flex: 1 },
  title: { color: COLORS.text },
  sub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 1 },
});
