import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, TYPE, SPACING } from '../constants/theme';

/**
 * Screen header. Every screen renders one of these — the navigator runs with
 * headerShown:false — so this is the single highest-leverage place to change
 * how the app reads.
 *
 * Props and behaviour are unchanged: same five props, same onBack/onRight
 * callbacks, same conditional rendering. Visual only.
 */
interface Props {
  title: string;
  onBack?: () => void;
  rightText?: string;
  onRight?: () => void;
  rightColor?: string;
}

export default function Header({ title, onBack, rightText, onRight, rightColor }: Props) {
  return (
    <View style={styles.header}>
      <TouchableOpacity style={styles.side} onPress={onBack} hitSlop={HIT}>
        {/* Chevron in a circular surface: a bare glyph on a dark background was
            easy to miss, and gives no press target cue. */}
        {onBack && (
          <View style={styles.backBtn}>
            <Text style={styles.back}>‹</Text>
          </View>
        )}
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>{title}</Text>
      <TouchableOpacity style={[styles.side, styles.rightSide]} onPress={onRight} hitSlop={HIT}>
        {rightText && (
          <View style={styles.rightPill}>
            <Text style={[styles.rightText, rightColor ? { color: rightColor } : {}]} numberOfLines={1}>
              {rightText}
            </Text>
          </View>
        )}
      </TouchableOpacity>
      {/* Two-tone accent line instead of a flat hairline — every screen in
          the app renders one of these, so it is the cheapest way to give the
          whole app a consistent, colourful signature edge. Purely decorative,
          non-interactive, and sits below the hairline so it doesn't change
          the header's height or hit areas. */}
      <View pointerEvents="none" style={styles.accentLine}>
        <View style={[styles.accentHalf, { backgroundColor: COLORS.primary }]} />
        <View style={[styles.accentHalf, { backgroundColor: COLORS.live }]} />
      </View>
    </View>
  );
}

const HIT = { top: 8, bottom: 8, left: 8, right: 8 };

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingTop: 50,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
    position: 'relative',
  },
  accentLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, flexDirection: 'row', opacity: 0.55 },
  accentHalf: { flex: 1 },
  side: { width: 62, justifyContent: 'center' },
  rightSide: { alignItems: 'flex-end' },
  backBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: COLORS.card2,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  // Optical centring: the '‹' glyph sits low and right in its box.
  back: { color: COLORS.text, fontSize: 26, lineHeight: 28, marginTop: -3, marginLeft: -2 },
  title: { ...TYPE.h2, flex: 1, color: COLORS.text, textAlign: 'center' },
  rightPill: {
    paddingHorizontal: 11, paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.primarySoft,
  },
  rightText: { ...TYPE.caption, color: COLORS.primary, fontWeight: '700' },
});
