// Client-side derived analytics for the Live Viewer screen — all computed
// from ballHistory/innings data already present in the match document, no
// additional Firebase reads needed.

export const getBallByBall = (inn: any, limit = 30) => {
  const history = (inn?.ballHistory ?? []).filter((b: any) => b.type !== 'NEW_BATSMAN' && b.over !== undefined);
  return history.slice(-limit).reverse(); // most recent first
};

// Reconstructs the current (unfinished) partnership — runs/balls added since
// the last wicket fell, for whichever two batters are currently at the crease.
export const getCurrentPartnership = (inn: any) => {
  const history = inn?.ballHistory ?? [];
  let runs = 0;
  let balls = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.type === 'NEW_BATSMAN') continue;
    if (h.result === 'W' || (h.result ?? '').startsWith('W(')) break; // stop at the last wicket
    const r = h.result;
    if (/^\d+$/.test(r)) runs += parseInt(r);
    else if (r.startsWith('WD')) runs += r === 'WD' ? 1 : 1 + (parseInt(r.replace('WD', '')) || 0);
    else if (r.startsWith('NB')) runs += r === 'NB' ? 1 : 1 + (parseInt(r.replace('NB', '')) || 0);
    else if (r.startsWith('LB')) runs += parseInt(r.replace('LB', '')) || 0;
    else if (r.startsWith('B')) runs += parseInt(r.replace('B', '')) || 0;
    if (!r.startsWith('WD') && !r.startsWith('NB')) balls += 1;
  }
  return { runs, balls };
};

// Worm graph data — cumulative runs after each completed over, for both
// innings (innings2 only populated once it exists).
export const getWormData = (match: any) => {
  const buildOverPoints = (inn: any) => {
    const history = (inn?.ballHistory ?? []).filter((b: any) => b.type !== 'NEW_BATSMAN' && b.over !== undefined);
    const points: { over: number; runs: number }[] = [{ over: 0, runs: 0 }];
    let cumRuns = 0;
    let lastOver = 0;
    history.forEach((h: any) => {
      const r = h.result;
      let runsThisBall = 0;
      if (/^\d+$/.test(r)) runsThisBall = parseInt(r);
      else if (r.startsWith('WD')) runsThisBall = r === 'WD' ? 1 : 1 + (parseInt(r.replace('WD', '')) || 0);
      else if (r.startsWith('NB')) runsThisBall = r === 'NB' ? 1 : 1 + (parseInt(r.replace('NB', '')) || 0);
      else if (r.startsWith('LB')) runsThisBall = parseInt(r.replace('LB', '')) || 0;
      else if (r.startsWith('B')) runsThisBall = parseInt(r.replace('B', '')) || 0;
      cumRuns += runsThisBall;
      if (h.over !== lastOver) {
        points.push({ over: h.over, runs: cumRuns });
        lastOver = h.over;
      }
    });
    // Always include the current partial over's live total as the last point
    points.push({ over: (inn?.overs ?? 0) + (inn?.balls ?? 0) / 6, runs: inn?.runs ?? 0 });
    return points;
  };

  return {
    innings1: buildOverPoints(match?.innings1),
    innings2: match?.innings2 ? buildOverPoints(match.innings2) : [],
  };
};

// Simple heuristic win probability for the chasing team — NOT a statistical
// model, just a bounded estimate based on required run rate vs current run
// rate and wickets in hand. Good enough for a casual viewer indicator; not
// intended as a precise prediction.
export const getWinProbability = (match: any): { team1: number; team2: number } | null => {
  if (match?.currentInnings !== 2 || !match?.innings2) return null;
  const target = (match.innings1?.runs ?? 0) + 1;
  const inn2 = match.innings2;
  const runsNeeded = target - (inn2.runs ?? 0);
  const ballsLeft = (match.totalOvers * 6) - ((inn2.overs ?? 0) * 6 + (inn2.balls ?? 0));
  const wicketsLeft = 10 - (inn2.wickets ?? 0);

  if (runsNeeded <= 0) return { team1: 0, team2: 100 }; // already won
  if (ballsLeft <= 0 || wicketsLeft <= 0) return { team1: 100, team2: 0 }; // chase failed

  const requiredRR = (runsNeeded / ballsLeft) * 6;
  const currentRR = ballsLeft < match.totalOvers * 6
    ? ((inn2.runs ?? 0) / (((inn2.overs ?? 0) * 6 + (inn2.balls ?? 0)) || 1)) * 6
    : 0;

  // Heuristic: favor chasing team when required RR is close to/below current
  // pace and wickets are plentiful; favor defending team as required RR climbs
  // and wickets fall. Clamped to keep it a rough indicator, not overconfident.
  let chasingTeamProb = 50;
  const rrDiff = currentRR - requiredRR;
  chasingTeamProb += rrDiff * 4; // pace advantage/disadvantage
  chasingTeamProb += (wicketsLeft - 5) * 3; // wickets in hand advantage
  chasingTeamProb = Math.max(5, Math.min(95, chasingTeamProb));

  const team2Prob = Math.round(chasingTeamProb);
  return { team1: 100 - team2Prob, team2: team2Prob };
};