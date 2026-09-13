import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE } from '../constants/theme';
import AppIcon from './AppIcon';
import Button from './Button';

/**
 * Empty state. Props and conditional rendering are unchanged — the button
 * still only appears when both btnText and onBtn are supplied.
 *
 * The icon now sits in a tinted disc rather than floating loose, which stops
 * empty screens looking like a rendering failure.
 */
interface Props {
  icon: string;
  title: string;
  subtitle?: string;
  btnText?: string;
  onBtn?: () => void;
}

export default function EmptyState({ icon, title, subtitle, btnText, onBtn }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <AppIcon emoji={icon} size={40} color={COLORS.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {btnText && onBtn && <Button label={btnText} onPress={onBtn} size="md" />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.xxl },
  iconWrap: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1, borderColor: COLORS.primary + '33',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  title: { ...TYPE.h2, color: COLORS.text, textAlign: 'center', marginBottom: 6 },
  subtitle: {
    ...TYPE.body, color: COLORS.textSecondary, textAlign: 'center',
    marginBottom: SPACING.lg, lineHeight: 21, maxWidth: 280,
  },
});
