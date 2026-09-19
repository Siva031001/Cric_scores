import React, { useRef } from 'react';
import {
  Animated, Text, TouchableWithoutFeedback, StyleSheet, View,
  ViewStyle, StyleProp, ActivityIndicator,
} from 'react-native';
import { COLORS, RADIUS, TYPE, SHADOW, MOTION } from '../constants/theme';

/**
 * Button with consistent height, radius, typography and press feedback.
 *
 * Presentational only: it takes an onPress and calls it. It adds no logic of
 * its own — no debouncing, no async handling, no navigation — so swapping a
 * TouchableOpacity for this cannot change behaviour.
 *
 * Variants exist so hierarchy is a choice rather than an accident:
 *   primary     Create, Save, Start Match
 *   secondary   Edit, View
 *   ghost       low-emphasis inline actions
 *   destructive Delete
 *   sport       in-match actions (wicket, wide, no-ball) — caller passes tint
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'sport';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface Props {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** Tint for `sport`, and the glow colour for `primary`. */
  tint?: string;
  full?: boolean;
  left?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const HEIGHT: Record<ButtonSize, number> = { sm: 34, md: 46, lg: 54 };
const PAD: Record<ButtonSize, number> = { sm: 12, md: 18, lg: 22 };

export default function Button({
  label, onPress, variant = 'primary', size = 'md',
  disabled = false, loading = false, tint, full = false, left, style,
}: Props) {
  // Native driver, scale only — never animates layout, so it cannot delay or
  // swallow a tap. Matters most on the scoring screen.
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) =>
    Animated.timing(scale, { toValue: to, duration: MOTION.fast, useNativeDriver: true }).start();

  const accent = tint ?? COLORS.primary;
  const inert = disabled || loading;

  const skin: ViewStyle =
    variant === 'primary' ? { backgroundColor: accent }
    : variant === 'secondary' ? { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border }
    : variant === 'ghost' ? { backgroundColor: 'transparent' }
    : variant === 'destructive' ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.error }
    : { backgroundColor: accent + '22', borderWidth: 1, borderColor: accent };

  const fg =
    variant === 'primary' ? COLORS.onPrimary
    : variant === 'secondary' ? COLORS.text
    : variant === 'ghost' ? COLORS.primary
    : variant === 'destructive' ? COLORS.error
    : accent;

  return (
    <TouchableWithoutFeedback
      onPress={inert ? undefined : onPress}
      onPressIn={() => !inert && press(0.96)}
      onPressOut={() => !inert && press(1)}
      disabled={inert}
    >
      <Animated.View
        style={[
          styles.base,
          skin,
          { height: HEIGHT[size], paddingHorizontal: PAD[size], transform: [{ scale }] },
          variant === 'primary' && !inert ? SHADOW.glow(accent) : null,
          full && styles.full,
          inert && styles.inert,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={fg} />
        ) : (
          <View style={styles.row}>
            {left}
            <Text style={[TYPE.button, { color: fg }, size === 'sm' && styles.smText]} numberOfLines={1}>
              {label}
            </Text>
          </View>
        )}
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  // Rounder than the old RADIUS.md: a slightly softer, friendlier shape reads
  // as fresher across every button in the app since every variant shares
  // this base.
  base: { borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  full: { alignSelf: 'stretch' },
  smText: { fontSize: 13 },
  // 0.45 keeps a disabled label legible while clearly inactive; RN's default
  // TouchableOpacity behaviour gives no disabled affordance at all.
  inert: { opacity: 0.45 },
});
