import { useEffect, useRef, useState } from 'react';
import { statKey, isWicketResult, nameOf } from './formulas';

/**
 * Detects "an event just happened" purely by diffing successive snapshots
 * of the SAME match state every other screen already reads — no separate
 * event stream, no separate scoring decision. A wicket's dismissal type and
 * fielder come from batsmanStats[statKey(outPlayerId)], which the real
 * engine already sets the instant the wicket is recorded.
 *
 * Two things this has to account for that a naive "look at the latest ball"
 * approach misses:
 *   1. Firebase's onValue can coalesce several rapid writes into one
 *      callback — every NEW ball since the last snapshot is walked, not
 *      just the newest one, so a four immediately followed by a wicket
 *      doesn't silently lose the four.
 *   2. More than one event type can be true in the same snapshot (a fifty
 *      scored off a boundary; a wicket on the last ball of an over). These
 *      are queued and shown one after another, not collapsed into whichever
 *      check happened to run last.
 */
export function useMatchEvents(match) {
  const [event, setEvent] = useState(null);
  const queueRef = useRef([]);
  const initializedRef = useRef(false);
  const prevBallCountRef = useRef(0);
  const prevMilestoneTsRef = useRef(0);
  const prevOversRef = useRef(0);
  const prevStatusRef = useRef(null);
  const timeoutRef = useRef(null);

  const showNext = () => {
    // Cleared FIRST, unconditionally — otherwise a fired (dead) timer id
    // left sitting in the ref makes "is something pending" checks below
    // permanently think one still is, once a single event has ever played.
    timeoutRef.current = null;
    const next = queueRef.current.shift();
    if (!next) {
      setEvent(null);
      return;
    }
    setEvent(next);
    if (next.ttl > 0) {
      timeoutRef.current = window.setTimeout(showNext, next.ttl);
    }
    // ttl <= 0 (RESULT) is persistent — never auto-advances the queue.
  };

  const enqueue = (type, payload, ttl = 4500) => {
    queueRef.current.push({ type, payload, ttl, key: Date.now() + '-' + type + '-' + queueRef.current.length });
  };

  useEffect(() => {
    if (!match) return;
    const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
    if (!inn) return;
    const balls = inn.ballHistory ?? [];
    const batP = match.currentInnings === 1 ? match.team1Players : match.team2Players;

    const firstRun = !initializedRef.current;
    let queuedSomething = false;

    // Match result — persistent once shown, not auto-cleared like the others.
    if (match.status === 'completed' && prevStatusRef.current !== 'completed' && match.result && !firstRun) {
      queueRef.current = [{ type: 'RESULT', payload: { result: match.result, mom: match.manOfMatch }, ttl: 0, key: 'result' }];
      clearTimeout(timeoutRef.current);
      showNext();
      prevStatusRef.current = match.status;
      initializedRef.current = true;
      prevBallCountRef.current = balls.length;
      return;
    }
    prevStatusRef.current = match.status;

    // Milestone (fifty/hundred/etc) — already detected and stored by the app.
    const milestoneTs = match.lastMilestone?.ts ?? 0;
    if (milestoneTs !== prevMilestoneTsRef.current) {
      if (!firstRun) { enqueue('MILESTONE', match.lastMilestone, 5000); queuedSomething = true; }
      prevMilestoneTsRef.current = milestoneTs;
    }

    // Over completed.
    if ((inn.overs ?? 0) !== prevOversRef.current) {
      if (!firstRun && (inn.overs ?? 0) > prevOversRef.current) {
        enqueue('OVER_COMPLETE', { overs: inn.overs }, 3000);
        queuedSomething = true;
      }
      prevOversRef.current = inn.overs ?? 0;
    }

    // Ball-by-ball: four / six / wicket — walk EVERY new ball, not just the
    // latest, so a coalesced update (two deliveries landing in one Firebase
    // callback) doesn't drop the earlier one.
    if (balls.length > prevBallCountRef.current) {
      const newBalls = balls.slice(prevBallCountRef.current);
      if (!firstRun) {
        for (const last of newBalls) {
          if (!last || last.type === 'NEW_BATSMAN') continue;
          const r = last.result;
          if (isWicketResult(r)) {
            const outId = last.batsmanId;
            const stats = inn.batsmanStats?.[statKey(outId)];
            enqueue('WICKET', {
              name: nameOf(batP, outId),
              dismissalType: stats?.dismissalType,
              fielderName: last.fielderName ?? stats?.fielderName,
            });
            queuedSomething = true;
          } else if (r === '6') {
            enqueue('SIX', { name: nameOf(batP, inn.strikerId) });
            queuedSomething = true;
          } else if (r === '4') {
            enqueue('FOUR', { name: nameOf(batP, inn.strikerId) });
            queuedSomething = true;
          }
        }
      }
      prevBallCountRef.current = balls.length;
    } else if (balls.length !== prevBallCountRef.current) {
      prevBallCountRef.current = balls.length;
    }

    // If nothing is currently showing, start draining the queue now.
    if (queuedSomething && !timeoutRef.current && event === null) {
      showNext();
    }

    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match]);

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return event;
}
