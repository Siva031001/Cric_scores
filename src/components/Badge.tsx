import React, { useEffect, useRef } from 'react';
import { Animated, Text, View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { COLORS, RADIUS, TYPE, MOTION } from '../constants/theme';

/**
 * Small status pill: LIVE, Upcoming, Completed, Scheduled, Done.
 *
 * Presentational only — the caller decides what status to pass. This does not
 * derive status from anything, so it cannot affect the tournament/match status
 * logic that decides it.
 *
 * `pulse` animates opacity on the leading dot. Opacity runs on the native
 * driver, so it never touches layout and never blocks a tap.
 */
interface Props {
  label: string;
  tone?: 'live' | 'success' | 'warning' | 'info' | 'neutral' | 'error';
  /** Show a leading dot. Implied by tone="live". */
  dot?: boolean;
  pulse?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE: Record<string, string> = {
  live: COLORS.live,
  success: COLORS.success,
  warning: COLORS.warning,
  info: COLORS.info,
  error: COLORS.error,
  neutral: COLORS.textSecondary,
};

export default function Badge({ label, tone = 'neutral', dot, pulse, style }: Props) {
  const color = TONE[tone] ?? COLORS.textSecondary;
  const showDot = dot ?? tone === 'live';
  const shouldPulse = pulse ?? tone === 'live';

  const blink = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!shouldPulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: MOTION.pulse, useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: MOTION.pulse, useNativeDriver: true }),
      ])
    );
    loop.start();
    // Stopped on unmount so a backgrounded screen isn't left animating.
    return () => loop.stop();
  }, [shouldPulse, blink]);

  return (
    <View style={[styles.pill, { backgroundColor: color + '1f', borderColor: color + '55' }, style]}>
      {showDot && (
        <Animated.View style={[styles.dot, { backgroundColor: color, opacity: shouldPulse ? blink : 1 }]} />
      )}
      <Text style={[TYPE.label, { color }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: RADIUS.round, borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
