// Pure, display-only cricket arithmetic — hand-ported from
// src/utils/cricketLogic.ts and src/utils/matchAnalytics.ts (and, for the
// exact ballHistory result-code shapes, src/engine/legacy.ts's
// toLegacyResult). No scoring decision is made here: this file only turns
// numbers Firebase already has into the strings a broadcast graphic shows.
// There is no build link between this plain-JS web app and the RN app's
// TypeScript engine, so these formulas are kept in sync by eye — exactly
// the same tradeoff admin/src/main.jsx already accepted for its own
// (previously buggy, now-fixed) run-rate display.

export const statKey = (id) => 'p' + id;

export const getOversString = (overs, balls) => `${overs ?? 0}.${balls ?? 0}`;

export const getRunRate = (runs, overs, balls) => {
  const total = (overs ?? 0) + (balls ?? 0) / 6;
  if (total <= 0) return '0.00';
  return ((runs ?? 0) / total).toFixed(2);
};

export const getRequiredRunRate = (target, runs, totalOvers, overs, balls) => {
  const remaining = target - (runs ?? 0);
  const oversLeft = totalOvers - (overs ?? 0) - (balls ?? 0) / 6;
  if (oversLeft <= 0) return '---';
  return (remaining / oversLeft).toFixed(2);
};

export const getStrikeRate = (runs, balls) => {
  if (!balls) return '0.0';
  return ((runs / balls) * 100).toFixed(1);
};

export const getEconomyRate = (runs, overs, balls) => {
  const total = (overs ?? 0) + (balls ?? 0) / 6;
  if (total <= 0) return '0.0';
  return (runs / total).toFixed(1);
};

export const ballsRemaining = (totalOvers, overs, balls) =>
  Math.max(0, totalOvers * 6 - ((overs ?? 0) * 6 + (balls ?? 0)));

/**
 * Runs a single ballHistory entry's legacy `result` code added to the team
 * total. Codes come straight from src/engine/legacy.ts's toLegacyResult:
 *   "4"/"1"/"0"      -> runs off the bat
 *   "W" / "W(RO)"    -> wicket, no completed runs
 *   "<n>W(RO)"       -> a run-out where <n> runs were completed first
 *   "WD" / "WD<n>"   -> wide (1 automatic + <n> extra)
 *   "NB" / "NB<n>"   -> no-ball (1 automatic + <n> extra)
 *   "LB<n>" / "B<n>" -> leg-byes / byes
 *   "PEN<n>"         -> penalty runs (old, pre-engine matches only — see
 *                       src/engine/legacy.ts's fromLegacyHistory, which
 *                       still parses this token for migration; NOT a
 *                       delivery, does not consume a ball)
 */
export const runsFromResult = (result) => {
  if (typeof result !== 'string') return 0;
  if (result === 'W' || result === 'W(RO)') return 0;
  const ro = result.match(/^(\d+)W\(RO\)$/);
  if (ro) return Number(ro[1]);
  if (result.startsWith('WD')) return 1 + (Number(result.slice(2)) || 0);
  if (result.startsWith('NB')) return 1 + (Number(result.slice(2)) || 0);
  if (result.startsWith('LB')) return Number(result.slice(2)) || 0;
  if (result.startsWith('B')) return Number(result.slice(1)) || 0;
  if (result.startsWith('PEN')) return Number(result.slice(3)) || 5;
  const n = Number(result);
  return Number.isFinite(n) ? n : 0;
};

export const isWicketResult = (result) => {
  if (typeof result !== 'string') return false;
  // Exactly "W", "W(RO)", or "<n>W(RO)" — NOT a startsWith('W') check, which
  // would wrongly match "WD"/"WD2" (wide) too.
  return result === 'W' || result === 'W(RO)' || /^\d+W\(RO\)$/.test(result);
};

/** A legal delivery is one that counts toward the over — not a wide/no-ball,
 *  not a PEN (penalty — not a delivery at all, doesn't consume a ball), and
 *  not a NEW_BATSMAN bookkeeping marker. */
export const isLegalDelivery = (ball) => {
  if (!ball || ball.type === 'NEW_BATSMAN') return false;
  const r = ball.result;
  return typeof r === 'string' && !r.startsWith('WD') && !r.startsWith('NB') && !r.startsWith('PEN');
};

/**
 * Current partnership: team runs added, and legal balls bowled, since the
 * most recent wicket in ballHistory (or since the innings began, if none
 * yet). This walks the SAME ballHistory every other screen already reads —
 * it is not a second running total the overlay maintains independently.
 *
 * Caveat: a retirement (RETIRED_HURT/RETIRED_OUT) is never pushed to
 * ballHistory at all (confirmed against src/engine/reduce.ts — only a BALL
 * event does that), so if the current pair's stay was interrupted by one,
 * this can look back past it and merge two partnerships into one. Pass
 * hasActiveRetirement (e.g. innings.retired?.some(r => !r.returned)) so
 * callers can show the number as approximate rather than presenting it as
 * exact when it might not be.
 */
export const currentPartnership = (ballHistory, hasActiveRetirement) => {
  const balls = ballHistory ?? [];
  let runs = 0;
  let ballsFaced = 0;
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (b?.type === 'NEW_BATSMAN') continue;
    if (isWicketResult(b?.result)) break;
    runs += runsFromResult(b?.result);
    if (isLegalDelivery(b)) ballsFaced += 1;
  }
  return { runs, balls: ballsFaced, approximate: !!hasActiveRetirement };
};

/**
 * Fall of wickets: [{ wicketNumber, score, over, retired }], derived by
 * replaying ballHistory forward. A retirement never appears in ballHistory
 * (see currentPartnership's caveat above), so if the innings' real wicket
 * count (totalWickets) is higher than what ballHistory accounts for, the
 * difference is retirements — listed with no score/over we have no way to
 * know, rather than silently left off the list entirely.
 */
export const fallOfWickets = (ballHistory, totalWickets) => {
  const balls = ballHistory ?? [];
  const fow = [];
  let score = 0;
  let wickets = 0;
  for (const b of balls) {
    if (b?.type === 'NEW_BATSMAN') continue;
    score += runsFromResult(b?.result);
    if (isWicketResult(b?.result)) {
      wickets += 1;
      fow.push({ wicketNumber: wickets, score, over: b.over != null ? `${b.over}.${(b.ball ?? 0) + 1}` : null, retired: false });
    }
  }
  if (typeof totalWickets === 'number' && totalWickets > wickets) {
    for (let i = wickets + 1; i <= totalWickets; i++) {
      fow.push({ wicketNumber: i, score: null, over: null, retired: true });
    }
  }
  return fow;
};

export const nameOf = (players, id) => players?.find((p) => p.id === id)?.name ?? ('P' + (id + 1));
