// @ts-nocheck
import { Innings, BallResult, BatsmanStats, BowlerStats } from "../types/cricket";

// ── Stat-map key helper ──────────────────────────────────────
// Firebase Realtime Database auto-converts any object whose keys are
// sequential integers starting at 0 (e.g. {0:{...}, 1:{...}, 2:{...}})
// into a JS ARRAY on write/read, filling any missing index with `null`.
// Our batsmanStats/bowlerStats maps are keyed by numeric player id and
// are naturally sparse (only players who've batted/bowled get an entry),
// so without this guard Firebase silently turns them into arrays with
// `null` holes — and those `null`s then get spread into `{}` downstream,
// producing corrupted partial stat objects. Prefixing the key with "p"
// makes it a non-numeric string key, which Firebase always stores as a
// plain object, never an array.
export const statKey = (id) => "p" + id;

export const createEmptyBatsmanStats = (playerId) => ({
  playerId, runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false, dots: 0,
});

export const createEmptyBowlerStats = (playerId) => ({
  playerId, overs: 0, balls: 0, runs: 0, wickets: 0, wides: 0, noBalls: 0, maidens: 0, dots: 0,
});

export const createEmptyInnings = (strikerId = 0, nonStrikerId = 1, currentBowlerId = 0) => ({
  runs: 0, wickets: 0, overs: 0, balls: 0, ballHistory: [],
  strikerId, nonStrikerId, currentBowlerId,
  batsmanStats: {
    [statKey(strikerId)]: createEmptyBatsmanStats(strikerId),
    [statKey(nonStrikerId)]: createEmptyBatsmanStats(nonStrikerId),
  },
  bowlerStats: { [statKey(currentBowlerId)]: createEmptyBowlerStats(currentBowlerId) },
  extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
});

// ICC: works out how many runs rotate the strike for a given ball result.
export const getStrikeRotationRuns = (result) => {
  if (result === "W") return 0;
  if (result.match(/^\d+$/)) return parseInt(result);
  if (result.startsWith("WD")) return result === "WD" ? 0 : (parseInt(result.replace("WD", "")) || 0);
  if (result.startsWith("NB")) return result === "NB" ? 0 : (parseInt(result.replace("NB", "")) || 0);
  if (result.startsWith("LB")) return parseInt(result.replace("LB", "")) || 0;
  if (result.startsWith("B")) return parseInt(result.replace("B", "")) || 0;
  return 0;
};

export const isLegalDelivery = (result) => {
  if (result.startsWith("WD") || result.startsWith("NB")) return false;
  if (result.startsWith("PEN")) return false;
  return true;
};

export const processBall = (innings, result) => {
  const inn = {
    ...innings,
    ballHistory: [...(innings.ballHistory ?? [])],
    batsmanStats: Object.fromEntries(Object.entries(innings.batsmanStats ?? {}).map(([k, v]) => [k, { ...v }])),
    bowlerStats: Object.fromEntries(Object.entries(innings.bowlerStats ?? {}).map(([k, v]) => [k, { ...v }])),
    extras: { ...(innings.extras ?? { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 }) },
  };

  // Snapshot BEFORE this ball is applied — this is what Undo restores to.
  inn.ballHistory.push({
    result,
    over: innings.overs,
    ball: innings.balls,
    batsmanId: innings.strikerId,
    nonStrikerIdBefore: innings.nonStrikerId,
    bowlerId: innings.currentBowlerId,
  });

  const sid = innings.strikerId;
  const bid = innings.currentBowlerId;
  const sKey = statKey(sid);
  const bKey = statKey(bid);

  if (!inn.batsmanStats[sKey]) inn.batsmanStats[sKey] = createEmptyBatsmanStats(sid);
  if (!inn.bowlerStats[bKey]) inn.bowlerStats[bKey] = createEmptyBowlerStats(bid);
  const bs = inn.batsmanStats[sKey];
  const bw = inn.bowlerStats[bKey];

  if (result.startsWith("PEN")) {
    const penRuns = parseInt(result.replace("PEN", "")) || 5;
    inn.runs += penRuns;
    inn.extras.penalty = (inn.extras.penalty ?? 0) + penRuns;
    return inn;
  }

  if (result.startsWith("WD")) {
    const extra = result === "WD" ? 0 : parseInt(result.replace("WD", "")) || 0;
    const totalRuns = 1 + extra;
    inn.runs += totalRuns;
    inn.extras.wides = (inn.extras.wides ?? 0) + totalRuns;
    bw.runs += totalRuns;
    bw.wides = (bw.wides ?? 0) + 1;
    inn.bowlerStats[bKey] = bw;
    return inn;
  }

  if (result.startsWith("NB")) {
    const extra = result === "NB" ? 0 : parseInt(result.replace("NB", "")) || 0;
    const totalRuns = 1 + extra;
    inn.runs += totalRuns;
    inn.extras.noBalls = (inn.extras.noBalls ?? 0) + 1;
    bw.runs += totalRuns;
    bw.noBalls = (bw.noBalls ?? 0) + 1;
    // ICC: a No Ball is NOT a legal delivery (no over/ball increment for the bowler's
    // over count), but the BATTER faces it — so it counts as a ball faced.
    bs.balls += 1;
    if (extra > 0) {
      bs.runs += extra;
      if (extra === 4) bs.fours += 1;
      if (extra === 6) bs.sixes += 1;
    }
    inn.batsmanStats[sKey] = bs;
    inn.bowlerStats[bKey] = bw;
    return inn;
  }

  if (result.startsWith("LB")) {
    const runs = parseInt(result.replace("LB", "")) || 0;
    inn.runs += runs;
    inn.extras.legByes = (inn.extras.legByes ?? 0) + runs;
    bs.balls += 1;
    inn.batsmanStats[sKey] = bs;
    // ICC: Leg Byes count toward the team total but are NOT charged against
    // the bowler's runs conceded (unlike Wides, which DO count against the
    // bowler). Only the legal-delivery ball/over count is affected here.
    inn.balls += 1;
    if (inn.balls === 6) { inn.balls = 0; inn.overs += 1; bw.overs += 1; bw.balls = 0; }
    else { bw.balls += 1; }
    inn.bowlerStats[bKey] = bw;
    return inn;
  }

  if (result.startsWith("B")) {
    const runs = parseInt(result.replace("B", "")) || 0;
    inn.runs += runs;
    inn.extras.byes = (inn.extras.byes ?? 0) + runs;
    bs.balls += 1;
    inn.batsmanStats[sKey] = bs;
    // ICC: plain Byes also count toward the team total but are NOT charged
    // against the bowler's runs conceded, same rule as Leg Byes.
    inn.balls += 1;
    if (inn.balls === 6) { inn.balls = 0; inn.overs += 1; bw.overs += 1; bw.balls = 0; }
    else { bw.balls += 1; }
    inn.bowlerStats[bKey] = bw;
    return inn;
  }

  switch (result) {
    case "0": bs.balls += 1; bs.dots = (bs.dots ?? 0) + 1; bw.dots = (bw.dots ?? 0) + 1; break;
    case "1": inn.runs += 1; bs.runs += 1; bs.balls += 1; bw.runs += 1; break;
    case "2": inn.runs += 2; bs.runs += 2; bs.balls += 1; bw.runs += 2; break;
    case "3": inn.runs += 3; bs.runs += 3; bs.balls += 1; bw.runs += 3; break;
    case "4": inn.runs += 4; bs.runs += 4; bs.balls += 1; bs.fours += 1; bw.runs += 4; break;
    case "6": inn.runs += 6; bs.runs += 6; bs.balls += 1; bs.sixes += 1; bw.runs += 6; break;
    case "W": inn.wickets += 1; bs.balls += 1; bs.isOut = true; bw.wickets = (bw.wickets ?? 0) + 1; break;
  }

  inn.batsmanStats[sKey] = bs;
  inn.balls += 1;
  if (inn.balls === 6) { inn.balls = 0; inn.overs += 1; bw.overs += 1; bw.balls = 0; }
  else { bw.balls += 1; }
  inn.bowlerStats[bKey] = bw;
  return inn;
};

export const undoLastBall = (innings) => {
  const history = [...(innings.ballHistory ?? [])];
  if (history.length === 0) return innings;

  // NEW_BATSMAN entries are not real deliveries — they record "a new batsman
  // walked in after a wicket" so Undo can correctly revert that selection too,
  // not just the wicket ball itself. If the most recent history entry is one
  // of these, pop it first (silently) before popping the actual ball, so a
  // single Undo tap after a wicket removes BOTH the new batsman AND the wicket
  // together, restoring the previous batsman as if the wicket never happened.
  if (history.length > 0 && history[history.length - 1]?.type === "NEW_BATSMAN") {
    history.pop();
  }

  const removed = history.pop();

  if (history.length === 0) {
    return createEmptyInnings(
      removed?.batsmanId ?? innings.strikerId,
      removed?.nonStrikerIdBefore ?? innings.nonStrikerId,
      removed?.bowlerId ?? innings.currentBowlerId
    );
  }

  const first = history[0];
  let rebuilt = {
    runs: 0, wickets: 0, overs: 0, balls: 0, ballHistory: [],
    strikerId: first.batsmanId,
    nonStrikerId: first.nonStrikerIdBefore,
    currentBowlerId: first.bowlerId,
    batsmanStats: {
      [statKey(first.batsmanId)]: createEmptyBatsmanStats(first.batsmanId),
      [statKey(first.nonStrikerIdBefore)]: createEmptyBatsmanStats(first.nonStrikerIdBefore),
    },
    bowlerStats: { [statKey(first.bowlerId)]: createEmptyBowlerStats(first.bowlerId) },
    extras: { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 },
  };

  for (const ball of history) {
    // NEW_BATSMAN entries (see above) are replayed by simply setting the new
    // striker, not by calling processBall (there's no delivery to simulate).
    if (ball.type === "NEW_BATSMAN") {
      rebuilt.strikerId = ball.newBatsmanId;
      if (!rebuilt.batsmanStats[statKey(rebuilt.strikerId)]) rebuilt.batsmanStats[statKey(rebuilt.strikerId)] = createEmptyBatsmanStats(rebuilt.strikerId);
      continue;
    }

    rebuilt.strikerId = ball.batsmanId;
    rebuilt.nonStrikerId = ball.nonStrikerIdBefore ?? rebuilt.nonStrikerId;
    rebuilt.currentBowlerId = ball.bowlerId;
    if (!rebuilt.batsmanStats[statKey(rebuilt.strikerId)]) rebuilt.batsmanStats[statKey(rebuilt.strikerId)] = createEmptyBatsmanStats(rebuilt.strikerId);
    if (!rebuilt.batsmanStats[statKey(rebuilt.nonStrikerId)]) rebuilt.batsmanStats[statKey(rebuilt.nonStrikerId)] = createEmptyBatsmanStats(rebuilt.nonStrikerId);
    if (!rebuilt.bowlerStats[statKey(rebuilt.currentBowlerId)]) rebuilt.bowlerStats[statKey(rebuilt.currentBowlerId)] = createEmptyBowlerStats(rebuilt.currentBowlerId);

    rebuilt = processBall(rebuilt, ball.result);

    if (ball.result !== "W") {
      const rotRuns = getStrikeRotationRuns(ball.result);
      if (rotRuns % 2 !== 0) {
        const t = rebuilt.strikerId;
        rebuilt.strikerId = rebuilt.nonStrikerId;
        rebuilt.nonStrikerId = t;
      }
    }
  }

  return rebuilt;
};

export const shouldRotateStrike = (result) => getStrikeRotationRuns(result) % 2 !== 0;
export const getOversString = (overs, balls) => `${overs}.${balls}`;
export const getRunRate = (runs, overs, balls) => {
  const total = overs + balls / 6;
  if (total === 0) return "0.00";
  return (runs / total).toFixed(2);
};
export const getRequiredRunRate = (target, runs, totalOvers, overs, balls) => {
  const remaining = target - runs;
  const oversLeft = totalOvers - overs - balls / 6;
  if (oversLeft <= 0) return "---";
  return (remaining / oversLeft).toFixed(2);
};
export const getStrikeRate = (runs, balls) => {
  if (balls === 0) return "0.00";
  return ((runs / balls) * 100).toFixed(1);
};

export const getMatchResult = (match) => {
  if (!match) return "";
  const status = match.winner ?? match.status ?? "";
  if (!status || status === "live") return "";
  if (status === "completed") return "Match completed";
  if (status.includes("abandoned") || status.includes("Abandoned")) return "Match abandoned";
  if (status.includes("Network")) return "Match stopped due to network issue";
  if (status.includes("Weather")) return "Match stopped due to bad weather";
  if (status.includes("Pitch")) return "Match stopped due to pitch issue";
  if (status.includes("Other") || status.includes("other")) return "Match stopped - other reason";

  const runs1 = match.innings1?.runs ?? 0;
  const wkts2 = match.innings2?.wickets ?? 0;
  const runs2 = match.innings2?.runs ?? 0;
  const totalPlayers = (match.team2Players?.length ?? 11);

  if (status.includes("won") || status.includes("Tied") || status.includes("tied")) {
    if (status.toLowerCase().includes("tied") || status.toLowerCase().includes("tie")) return "Match tied";
    if (status.includes(match.team2 + " won")) {
      const wicketsLeft = totalPlayers - 1 - wkts2;
      return match.team2 + " won by " + wicketsLeft + " wicket" + (wicketsLeft !== 1 ? "s" : "");
    }
    if (status.includes(match.team1 + " won")) {
      const margin = runs1 - runs2;
      return match.team1 + " won by " + margin + " run" + (margin !== 1 ? "s" : "");
    }
    return status;
  }
  return status;
};

export const getNBBatterRuns = (result) => {
  if (!result.startsWith('NB')) return 0;
  return result === 'NB' ? 0 : parseInt(result.replace('NB', '')) || 0;
};
export const getWDBatterRuns = (result) => {
  if (!result.startsWith('WD')) return 0;
  return result === 'WD' ? 0 : parseInt(result.replace('WD', '')) || 0;
};

export const calculateNRR = (runsScored, oversFaced, runsConceded, oversBowled) => {
  const scoredRate = oversFaced > 0 ? runsScored / oversFaced : 0;
  const concededRate = oversBowled > 0 ? runsConceded / oversBowled : 0;
  return scoredRate - concededRate;
};