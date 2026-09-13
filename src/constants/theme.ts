// ── Design tokens ────────────────────────────────────────────
// Single source of truth for colour, spacing, radius, typography, elevation
// and motion.
//
// EVERY key that existed before is still here with a compatible value, because
// 42 files import from this module. Values were re-tuned, not renamed or
// removed — renaming a token would be a silent visual break somewhere far away.
//
// The palette stays dark. That is right for a live-sports product, matches the
// broadcast overlay, and avoids introducing a theme system the app does not
// have (and was explicitly not asked for).
//
// Why the app looked plain, and what changed:
//   1. No elevation existed anywhere in the codebase — every card was flat.
//      SHADOW now provides a graded scale.
//   2. No typography scale existed; each screen picked sizes ad hoc, so a
//      score read at nearly the same weight as its label. TYPE fixes the
//      hierarchy, with tabular numerals so live digits don't jitter.
//   3. One flat card colour on a near-black background gave no depth.
//      There are now layered surfaces.

export const COLORS = {
  // ── Brand ──
  // A deeper, richer pitch green. `primary` keeps its role as the single
  // accent for actions and emphasis.
  primary: '#22c55e',
  primaryDark: '#16a34a',
  primaryLight: '#4ade80',
  /** Very low-opacity primary, for tinted surfaces and selected chips. */
  primarySoft: 'rgba(34,197,94,0.14)',

  // ── Surfaces, darkest to lightest ──
  background: '#0a0a14',
  /** Default card surface. */
  card: '#14141f',
  /** Raised surface: nested cards, chips, inputs on a card. */
  card2: '#1c1c2b',
  /** Highest surface: modals, sheets, menus. */
  surface3: '#24243a',
  border: '#2b2b42',
  /** Hairline separators inside a card, where `border` is too heavy. */
  borderSoft: 'rgba(255,255,255,0.06)',

  // ── Text ──
  text: '#ffffff',
  textSecondary: '#a3a3c2',
  textMuted: '#6b6b8a',

  // ── Semantic ──
  red: '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  blue: '#3b82f6',
  purple: '#a855f7',
  teal: '#14b8a6',
  /** Live / on-air. Deliberately distinct from `red` so a live badge never
   *  reads as an error. */
  live: '#ff2d55',
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',

  // ── Ink on coloured fills ──
  // A filled primary button needs dark text, not white: white on this green
  // fails contrast. These are deliberately near-black rather than pure black so
  // the fill still reads as coloured underneath.
  onPrimary: '#04140a',
  onAccent: '#1a1400',

  // ── Overlays ──
  scrim: 'rgba(0,0,0,0.72)',
  /** Hairline highlight along a card's top edge — cheap, convincing depth. */
  edgeHighlight: 'rgba(255,255,255,0.07)',
};

export const SPACING = {
  xs: 5,
  sm: 10,
  md: 15,
  lg: 20,
  xl: 30,
  /** Section gap on scrolling screens. */
  xxl: 40,
};

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  round: 100,
};

// ── Typography ───────────────────────────────────────────────
// Sizes and weights only — no font family, since none is bundled and adding
// one is a native change beyond a visual pass.
//
// `fontVariant: ['tabular-nums']` on the numeric styles is load-bearing for a
// scoring app: with proportional digits a score jumps horizontally as it goes
// 9 -> 10, which is very visible when it updates every ball.
export const TYPE = {
  /** Score, and nothing else. */
  display: { fontSize: 46, fontWeight: '800' as const, letterSpacing: -1, fontVariant: ['tabular-nums' as const] },
  /** Secondary large numerals: overs, target. */
  displaySm: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.5, fontVariant: ['tabular-nums' as const] },
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.4 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.2 },
  title: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 14, fontWeight: '500' as const },
  bodyStrong: { fontSize: 14, fontWeight: '700' as const },
  /** Section and field labels. Uppercase + tracking reads as deliberate. */
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8, textTransform: 'uppercase' as const },
  caption: { fontSize: 12, fontWeight: '500' as const },
  /** Column heading in a stats table. Same weight and tracking as `label`
   *  but WITHOUT uppercasing, because cricket notation is case-sensitive:
   *  `4s`/`6s` must not render as `4S`/`6S`. */
  colLabel: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
  /** Any figure in a table or stat row. */
  num: { fontSize: 14, fontWeight: '700' as const, fontVariant: ['tabular-nums' as const] },
  numSm: { fontSize: 12, fontWeight: '600' as const, fontVariant: ['tabular-nums' as const] },
  button: { fontSize: 15, fontWeight: '700' as const },
};

// ── Elevation ────────────────────────────────────────────────
// iOS shadow* and Android elevation together, since neither alone works on
// both. Kept subtle: on a near-black background a heavy shadow reads as dirt
// rather than depth.
export const SHADOW = {
  none: {},
  sm: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22, shadowRadius: 3, elevation: 2,
  },
  md: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  lg: {
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38, shadowRadius: 18, elevation: 12,
  },
  /** Coloured glow for the primary action and the live badge. */
  glow: (color: string) => ({
    shadowColor: color, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
  }),
};

// ── Motion ───────────────────────────────────────────────────
// Durations for the Animated API already available in react-native. Fast on
// purpose: this app is used one-handed while a match is in progress, and an
// animation that delays a tap is worse than no animation.
export const MOTION = {
  fast: 120,
  base: 200,
  slow: 320,
  /** Live-indicator pulse, one direction. */
  pulse: 900,
};
