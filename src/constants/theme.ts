// ── Design tokens ────────────────────────────────────────────
// Single source of truth for colour, spacing, radius, typography, elevation
// and motion.
//
// EVERY key that existed before is still here with a compatible type, because
// 40+ files import from this module. Values were re-tuned (and a few purely
// additive tokens introduced), not renamed or removed — renaming a token
// would be a silent visual break somewhere far away.
//
// ── The "Floodlights" palette ──
// The old palette was a single green accent on a near-black background —
// correct, but monochrome. This pass keeps the dark base (still right for a
// live-sports product, still matches the broadcast overlay, still avoids a
// theme system the app doesn't have) and replaces the accent system with a
// vivid, multi-hue set inspired by stadium floodlights and scoreboard LEDs:
// an electric violet brand colour, plus punchy coral/amber/cyan/teal
// semantic colours used far more liberally than before. `primary` still
// keeps its role as the single accent for the app's main actions; `success`,
// `live` etc. remain distinct tokens so recolouring `primary` cannot change
// what "won" or "on air" means anywhere.
//
// Carried over from the previous pass:
//   1. Elevation (SHADOW) — every card is layered, not flat.
//   2. A typography scale with tabular numerals on every numeric style, so
//      live digits don't jitter as they update.
//   3. Layered surfaces (background/card/card2/surface3) for real depth.

export const COLORS = {
  // ── Brand ──
  // Electric violet: energetic, unmistakably different from the semantic
  // colours below, and — unlike the old green — passes contrast with a
  // plain white ink, so onPrimary can be a real colour instead of a
  // near-black workaround.
  primary: '#7C5CFF',
  primaryDark: '#5B3DF0',
  primaryLight: '#B9A8FF',
  /** Very low-opacity primary, for tinted surfaces and selected chips. */
  primarySoft: 'rgba(124,92,255,0.16)',

  // ── Surfaces, darkest to lightest ──
  // Same structure and near-black depth as before, with a faint violet
  // undertone (instead of flat neutral) so the new brand colour feels native
  // to the surfaces it sits on rather than dropped on top of them.
  background: '#0a0a16',
  /** Default card surface. */
  card: '#161425',
  /** Raised surface: nested cards, chips, inputs on a card. */
  card2: '#1f1c33',
  /** Highest surface: modals, sheets, menus. */
  surface3: '#292440',
  border: '#332d54',
  /** Hairline separators inside a card, where `border` is too heavy. */
  borderSoft: 'rgba(255,255,255,0.07)',

  // ── Text ──
  text: '#ffffff',
  textSecondary: '#ada8c9',
  textMuted: '#726d94',

  // ── Semantic ──
  // Brighter and warmer across the board — these now carry a lot of the
  // "colourful" identity of the app (menu icons, stat highlights, chips),
  // not just rare status flags.
  red: '#FF4D6D',
  orange: '#FF8A3D',
  yellow: '#FFC94A',
  blue: '#3AA0FF',
  purple: '#B14CFF',
  teal: '#00D9B5',
  /** Live / on-air. Deliberately distinct from `red` so a live badge never
   *  reads as an error. */
  live: '#FF2D6B',
  success: '#2ED66B',
  warning: '#FFB020',
  error: '#FF4D6D',
  info: '#3AA0FF',

  // ── Ink on coloured fills ──
  // A filled primary button now takes plain white — the new violet is dark
  // enough for white text to read cleanly, unlike the old bright green,
  // which needed near-black ink instead. Kept as its own token (not just
  // `text`) so a future accent swap only has to satisfy contrast here.
  onPrimary: '#ffffff',
  onAccent: '#1a1400',

  // ── Overlays ──
  scrim: 'rgba(6,4,16,0.78)',
  /** Hairline highlight along a card's top edge — cheap, convincing depth. */
  edgeHighlight: 'rgba(255,255,255,0.08)',
};

// Two-tone pairs for decorative gradient-ish surfaces (poster banners, hero
// headers, empty-state blobs) built from plain overlapping tinted Views —
// no gradient library dependency. Purely additive; nothing existing
// referenced these before, so nothing existing can regress from adding them.
export const GRADIENTS: Record<string, [string, string]> = {
  violet: ['#7C5CFF', '#B14CFF'],
  sunset: ['#FF8A3D', '#FF4D6D'],
  ocean: ['#3AA0FF', '#00D9B5'],
  gold: ['#FFC94A', '#FF8A3D'],
  berry: ['#FF2D6B', '#B14CFF'],
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
