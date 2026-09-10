// ─────────────────────────────────────────────────────────────
// useScoring — the screen's only route into the scoring engine
// ─────────────────────────────────────────────────────────────
// Owns the Firebase subscription, folds the match through the engine, and
// exposes plain dispatch functions. Screens describe WHAT the scorer did;
// every cricket rule is decided inside the engine.
//
// Nothing here recomputes a score, a wicket count or an over. If a screen
// ever needs a derived number, it comes from `innings` on this hook, which
// is engine output.
// ─────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import database from '@react-native-firebase/database';
import {
  CreaseSlot,
  EngineError,
  InningsState,
  MatchOutcome,
  MatchStatus,
  RetirementType,
  ScoringAction,
  StoppageReason,
  availableBatters,
  eligibleBowlers,
  isScoringAllowed,
  listDeliveries,
  returnableBatters,
} from '../engine';
import {
  EngineMatch,
  StoredMatch,
  activeInningsKey,
  loadMatch,
} from '../engine/persistence';
import {
  applyScoringAction,
  concludeMatchWithoutResult,
  deleteDelivery,
  editDelivery,
  recordRetirement,
  recordReturnToBat,
  resumeSuspendedMatch,
  startSecondInnings,
  startSuperOver,
  suspendMatchForStoppage,
  undoLastAction,
} from '../utils/matchEngine';

export interface UseScoringResult {
  raw: StoredMatch | null;
  match: EngineMatch | null;
  innings: InningsState | null;
  outcome: MatchOutcome | null;
  status: MatchStatus | null;
  loading: boolean;
  saving: boolean;
  /** Replay inconsistencies, e.g. an edit that changed who was on strike. */
  warnings: Array<{ seq: number; message: string }>;

  scoringAllowed: boolean;
  target: number | null;
  deliveries: ReturnType<typeof listDeliveries>;
  battersAvailable: number[];
  battersReturnable: number[];
  bowlersEligible: number[];

  dispatch: (action: ScoringAction) => Promise<void>;
  undo: () => Promise<void>;
  editBall: (seq: number, action: ScoringAction, reason?: string) => Promise<void>;
  deleteBall: (seq: number) => Promise<void>;
  retire: (playerId: number, type: RetirementType, reason?: string) => Promise<void>;
  returnToBat: (playerId: number, slot: CreaseSlot) => Promise<void>;
  beginSecondInnings: (openers: {
    strikerId: number;
    nonStrikerId: number;
    bowlerId: number;
  }) => Promise<void>;
  beginSuperOver: (tossWinner?: string | null) => Promise<void>;
  suspend: (reason: StoppageReason, description?: string) => Promise<void>;
  resume: () => Promise<void>;
  concludeNoResult: (to: 'ABANDONED' | 'NO_RESULT', reason?: string) => Promise<void>;
}

/** Surfaces engine validation messages to the scorer rather than swallowing them. */
const reportError = (e: unknown) => {
  if (e instanceof EngineError) {
    Alert.alert('Cannot record that', e.message);
  } else {
    const msg = (e as { message?: string })?.message ?? 'Something went wrong';
    Alert.alert('Error', msg);
  }
};

export const useScoring = (matchId: string | undefined): UseScoringResult => {
  const [raw, setRaw] = useState<StoredMatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // ── Subscription ──
  useEffect(() => {
    if (!matchId) {
      setLoading(false);
      return;
    }
    const ref = database().ref('matches/' + matchId);
    const listener = (snap: { val: () => unknown }) => {
      setRaw((snap.val() as StoredMatch | null) ?? null);
      setLoading(false);
    };
    const onError = (err: Error) => {
      setLoading(false);
      Alert.alert('Error', 'Could not load the match. Check your connection and try again.');
      console.error('Match subscription failed:', err);
    };
    ref.on('value', listener, onError);
    return () => ref.off('value', listener);
  }, [matchId]);

  // ── Fold ──
  // Every derived value comes from here, so the screen cannot drift from the
  // stored event log.
  const match = useMemo<EngineMatch | null>(() => {
    if (!raw) return null;
    try {
      return loadMatch(raw);
    } catch (e) {
      console.error('Failed to load match into engine:', e);
      return null;
    }
  }, [raw]);

  const innings = useMemo<InningsState | null>(() => {
    if (!match) return null;
    const key = activeInningsKey(match);
    if (key === 'innings2' && match.innings2) return match.innings2;
    if (key.startsWith('so')) {
      const so = match.superOvers[match.superOvers.length - 1];
      return so?.innings2 ?? so?.innings1 ?? match.innings1;
    }
    return match.innings1;
  }, [match]);

  const target = useMemo<number | null>(() => {
    if (!match) return null;
    const key = activeInningsKey(match);
    if (key !== 'innings2' && !key.startsWith('so')) return null;
    const revised = match.interruptions
      .filter(i => i.revisedTarget != null)
      .slice(-1)[0]?.revisedTarget;
    return revised ?? match.innings1.runs + 1;
  }, [match]);

  const deliveries = useMemo(() => {
    if (!match) return [];
    return listDeliveries(match.events.filter(e => e.inningsKey === activeInningsKey(match)));
  }, [match]);

  const rosterIds = useMemo(() => {
    if (!match) return { batting: [] as number[], bowling: [] as number[] };
    const key = activeInningsKey(match);
    const battingIsTeam1 = key === 'innings1';
    return {
      batting: (battingIsTeam1 ? match.raw.team1Players : match.raw.team2Players ?? []).map(p => p.id),
      bowling: (battingIsTeam1 ? match.raw.team2Players : match.raw.team1Players ?? []).map(p => p.id),
    };
  }, [match]);

  const battersAvailable = useMemo(
    () => (innings ? availableBatters(innings, rosterIds.batting) : []),
    [innings, rosterIds.batting]
  );
  const battersReturnable = useMemo(
    () => (innings ? returnableBatters(innings) : []),
    [innings]
  );
  const bowlersEligible = useMemo(
    () => (innings && match ? eligibleBowlers(innings, rosterIds.bowling, match.rules) : []),
    [innings, match, rosterIds.bowling]
  );

  // ── Guarded runner ──
  // savingRef is checked synchronously so a double tap cannot slip a second
  // delivery through before React has re-rendered.
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await fn();
    } catch (e) {
      reportError(e);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  const dispatch = useCallback(
    (action: ScoringAction) =>
      run(async () => {
        if (!matchId) return;
        await applyScoringAction(matchId, action, raw ? { raw } : {});
      }),
    [matchId, raw, run]
  );

  const undo = useCallback(
    () => run(async () => matchId && undoLastAction(matchId)),
    [matchId, run]
  );

  const editBall = useCallback(
    (seq: number, action: ScoringAction, reason?: string) =>
      run(async () => {
        if (!matchId) return;
        const res = await editDelivery(matchId, seq, action, { reason: reason ?? null });
        if (res.replayWarnings.length > 0) {
          Alert.alert(
            'Check the following deliveries',
            'That correction changed who was on strike. Review the deliveries after it — ' +
              'the batters recorded against them may need adjusting too.'
          );
        }
      }),
    [matchId, run]
  );

  const deleteBall = useCallback(
    (seq: number) => run(async () => matchId && deleteDelivery(matchId, seq)),
    [matchId, run]
  );

  const retire = useCallback(
    (playerId: number, type: RetirementType, reason?: string) =>
      run(async () => matchId && recordRetirement(matchId, playerId, type, reason ?? null)),
    [matchId, run]
  );

  const returnToBat = useCallback(
    (playerId: number, slot: CreaseSlot) =>
      run(async () => matchId && recordReturnToBat(matchId, playerId, slot)),
    [matchId, run]
  );

  const beginSecondInnings = useCallback(
    (openers: { strikerId: number; nonStrikerId: number; bowlerId: number }) =>
      run(async () => matchId && startSecondInnings(matchId, openers)),
    [matchId, run]
  );

  const beginSuperOver = useCallback(
    (tossWinner?: string | null) =>
      run(async () => matchId && startSuperOver(matchId, { tossWinner: tossWinner ?? null })),
    [matchId, run]
  );

  const suspend = useCallback(
    (reason: StoppageReason, description?: string) =>
      run(async () => matchId && suspendMatchForStoppage(matchId, reason, description ?? null)),
    [matchId, run]
  );

  const resume = useCallback(
    () => run(async () => matchId && resumeSuspendedMatch(matchId)),
    [matchId, run]
  );

  const concludeNoResult = useCallback(
    (to: 'ABANDONED' | 'NO_RESULT', reason?: string) =>
      run(async () => matchId && concludeMatchWithoutResult(matchId, to, reason ?? null)),
    [matchId, run]
  );

  return {
    raw,
    match,
    innings,
    outcome: match?.outcome ?? null,
    status: match?.status ?? null,
    loading,
    saving,
    warnings: match?.warnings ?? [],
    scoringAllowed: match ? isScoringAllowed(match.status) : false,
    target,
    deliveries,
    battersAvailable,
    battersReturnable,
    bowlersEligible,
    dispatch,
    undo,
    editBall,
    deleteBall,
    retire,
    returnToBat,
    beginSecondInnings,
    beginSuperOver,
    suspend,
    resume,
    concludeNoResult,
  };
};
