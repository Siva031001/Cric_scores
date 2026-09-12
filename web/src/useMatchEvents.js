import { useEffect, useRef, useState } from 'react';
import { statKey, isWicketResult, nameOf } from './formulas';

/**
 * Detects "an event just happened" purely by diffing successive snapshots
 * of the SAME match state every other screen already reads — no separate
 * event stream, no separate scoring decision. A wicket's dismissal type and
 * fielder come from batsmanStats[statKey(outPlayerId)], which the real
 * engine already sets the instant the wicket is recorded.
 */
export function useMatchEvents(match) {
  const [event, setEvent] = useState(null);
  const initializedRef = useRef(false);
  const prevBallCountRef = useRef(0);
  const prevMilestoneTsRef = useRef(0);
  const prevOversRef = useRef(0);
  const prevStatusRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!match) return;
    const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
    if (!inn) return;
    const balls = inn.ballHistory ?? [];
    const batP = match.currentInnings === 1 ? match.team1Players : match.team2Players;

    const fire = (type, payload, ttl = 4500) => {
      clearTimeout(timeoutRef.current);
      setEvent({ type, payload, key: Date.now() + '-' + type });
      timeoutRef.current = window.setTimeout(() => setEvent(null), ttl);
    };

    const firstRun = !initializedRef.current;

    // Match result — persistent once shown, not auto-cleared like the others.
    if (match.status === 'completed' && prevStatusRef.current !== 'completed' && match.result && !firstRun) {
      clearTimeout(timeoutRef.current);
      setEvent({ type: 'RESULT', payload: { result: match.result, mom: match.manOfMatch }, key: 'result' });
    }
    prevStatusRef.current = match.status;

    // Milestone (fifty/hundred/etc) — already detected and stored by the app.
    const milestoneTs = match.lastMilestone?.ts ?? 0;
    if (milestoneTs !== prevMilestoneTsRef.current) {
      if (!firstRun) fire('MILESTONE', match.lastMilestone, 5000);
      prevMilestoneTsRef.current = milestoneTs;
    }

    // Over completed.
    if ((inn.overs ?? 0) !== prevOversRef.current) {
      if (!firstRun && (inn.overs ?? 0) > prevOversRef.current) {
        fire('OVER_COMPLETE', { overs: inn.overs }, 3000);
      }
      prevOversRef.current = inn.overs ?? 0;
    }

    // Ball-by-ball: four / six / wicket.
    if (balls.length !== prevBallCountRef.current) {
      if (!firstRun && balls.length > prevBallCountRef.current) {
        const last = balls[balls.length - 1];
        if (last && last.type !== 'NEW_BATSMAN') {
          const r = last.result;
          if (isWicketResult(r)) {
            const outId = last.batsmanId;
            const stats = inn.batsmanStats?.[statKey(outId)];
            fire('WICKET', {
              name: nameOf(batP, outId),
              dismissalType: stats?.dismissalType,
              fielderName: last.fielderName ?? stats?.fielderName,
            });
          } else if (r === '6') {
            fire('SIX', { name: nameOf(batP, inn.strikerId) });
          } else if (r === '4') {
            fire('FOUR', { name: nameOf(batP, inn.strikerId) });
          }
        }
      }
      prevBallCountRef.current = balls.length;
    }

    initializedRef.current = true;
  }, [match]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return event;
}
