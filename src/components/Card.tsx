import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { COLORS, RADIUS, SPACING, SHADOW } from '../constants/theme';

/**
 * Elevated surface. Purely presentational — no press handling, no state.
 *
 * Exists because the app had no elevation anywhere: every card was a flat
 * rectangle on a near-black background, which is the main reason the UI read
 * as plain. Wrap content in this instead of hand-rolling a bordered View.
 *
 * `tone` picks the surface level, matching the layered COLORS surfaces:
 *   base    — a card on the screen background
 *   raised  — a card inside another card
 *   overlay — modals and sheets
 */
export type CardTone = 'base' | 'raised' | 'overlay';

interface Props {
  children: React.ReactNode;
  tone?: CardTone;
  /** Elevation. 'md' by default; 'none' for dense lists where shadows stack badly. */
  elevation?: 'none' | 'sm' | 'md' | 'lg';
  /** Left accent stripe — used for live/win/loss emphasis. */
  accent?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE_BG: Record<CardTone, string> = {
  base: COLORS.card,
  raised: COLORS.card2,
  overlay: COLORS.surface3,
};

export default function Card({
  children,
  tone = 'base',
  elevation = 'md',
  accent,
  padded = true,
  style,
}: Props) {
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: TONE_BG[tone] },
        SHADOW[elevation],
        // A soft coloured glow behind an accented card, on top of the
        // ordinary elevation shadow — the accent stripe alone read as a
        // rule rather than emphasis. Colour-only; overridden by `elevation`
        // like the rest of the shadow, and by the same 1 borderWidth `card`
        // already carries, so this cannot change hit testing or layout.
        accent ? SHADOW.glow(accent) : null,
        padded && styles.padded,
        accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {/* Hairline highlight along the top edge. A cheap way to suggest a lit
          surface, and far less noisy than a full border. */}
      <View pointerEvents="none" style={styles.edge} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    overflow: 'hidden',
  },
  padded: { padding: SPACING.md },
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: COLORS.edgeHighlight,
  },
});
