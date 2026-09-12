import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert, ScrollView, Share, ActivityIndicator, Modal, TextInput } from "react-native";
import { WebView } from "react-native-webview";
import { subscribeToMatch, updateMatch } from "../../utils/firebase";
// Only formatting and stat-map helpers remain from the old module. The
// scoring functions (processBall, undoLastBall, getStrikeRotationRuns,
// getNBBatterRuns, getWDBatterRuns) are deliberately NOT imported: the rules
// engine owns those now, and importing them here would leave a second
// scoring path reachable from this screen.
import {
  getOversString,
  getRunRate,
  getRequiredRunRate,
  statKey,
  createEmptyBatsmanStats,
  createEmptyBowlerStats,
} from "../../utils/cricketLogic";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";
import AppIcon from '../../components/AppIcon';
import { useFocusEffect } from "@react-navigation/native";
import ScorecardScreen from "./ScorecardScreen";
import { getBallCommentary } from '../../utils/aiCommentary';
import { detectMilestone } from '../../utils/milestoneDetector';
// ── Rules engine ─────────────────────────────────────────────
// This screen owns NO cricket rules. It describes what the scorer tapped and
// the engine decides legality, extras, strike rotation, wickets, over
// completion, free hits, retirement and match completion.
import type {
  DismissalType,
  RetirementType,
  RunAttribution,
  ScoringAction,
} from '../../engine';
import { DEFAULT_PENALTY_REASONS, resolveSuperOverChain, isSuperOverInningsComplete } from '../../engine';
import { loadMatch } from '../../engine/persistence';
import {
  applyScoringAction,
  undoLastAction,
  concludeMatchWithoutResult,
  suspendMatchForStoppage,
  startSuperOver,
  startSuperOverInnings,
} from '../../utils/matchEngine';


/**
 * Maps the wicket labels the scorer sees onto engine dismissal codes.
 * "Retired" is deliberately absent — retirement is not a delivery and is
 * routed to the retirement prompt instead.
 */
const DISMISSAL_MAP: Record<string, DismissalType> = {
  Bowled: 'BOWLED',
  Caught: 'CAUGHT',
  LBW: 'LBW',
  'Run Out': 'RUN_OUT',
  Stumped: 'STUMPED',
  'Hit Wicket': 'HIT_WICKET',
  'Timed Out': 'TIMED_OUT',
  'Obstructing the Field': 'OBSTRUCTING_FIELD',
  'Hit the Ball Twice': 'HIT_BALL_TWICE',
};

/** Quick-run buttons. 5 is included; anything else goes through "More". */
const QUICK_RUNS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Penalty reasons offered to the scorer. Sourced from the competition's rule
 * profile at runtime where one is set, so a league with its own playing
 * conditions is not forced onto this list.
 */
const PENALTY_REASONS = DEFAULT_PENALTY_REASONS;

/**
 * Collapses an action to the token the commentary generator expects.
 * Commentary is cosmetic, so an approximate token is fine here — the
 * scorecard never reads it.
 */
const commentaryToken = (action: ScoringAction): string => {
  switch (action.type) {
    case 'RUNS':
      return String(action.runs ?? 0);
    case 'WICKET':
      return 'W';
    case 'WIDE':
      return 'WD';
    case 'NO_BALL':
      return 'NB';
    default:
      return '0';
  }
};

export default function ScoringScreen({ route, navigation }: any) {
  const { matchId } = route.params ?? {};
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewBowler, setShowNewBowler] = useState(false);
  const [pendingWicket, setPendingWicket] = useState(false);
  const postWicketInnRef = useRef<any>(null);
  const openerSelectionDoneRef = useRef(false);
  const [showWicket, setShowWicket] = useState(false);
  const [showFielder, setShowFielder] = useState(false);
  const [showRunOutPicker, setShowRunOutPicker] = useState(false);
  const [showRunOutFielder, setShowRunOutFielder] = useState(false);
  const [runOutWhoSelected, setRunOutWhoSelected] = useState<"striker"|"nonStriker"|null>(null);
  const [showRunOutRuns, setShowRunOutRuns] = useState(false);
  const [runOutRuns, setRunOutRuns] = useState(0);
  const [showOpenerSelect, setShowOpenerSelect] = useState(false);
  const [openerStep, setOpenerStep] = useState<"striker"|"nonStriker"|"bowler">("striker");
  const [opener1Id, setOpener1Id] = useState<number|null>(null);
  const [opener2Id, setOpener2Id] = useState<number|null>(null);
  const [opener3Id, setOpener3Id] = useState<number|null>(null);
  const [wicketType, setWicketType] = useState("");
  const [byeMode, setByeMode] = useState<"B"|"LB"|null>(null);
  const [showPTY, setShowPTY] = useState(false);
  const [showWDRuns, setShowWDRuns] = useState(false);
  // Free hit is no longer local screen state. It is derived and persisted by
  // the engine (innings.freeHit), which is what makes it survive a reload and
  // be restored correctly by undo. The old local flag was never set to true,
  // so the banner could never appear at all.
  const [showNBRuns, setShowNBRuns] = useState(false);
  const [ptyInput, setPtyInput] = useState("5");
  const [showEndMatch, setShowEndMatch] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showInningsEnd, setShowInningsEnd] = useState(false);
  const [inningsData, setInningsData] = useState<any>(null);
  const [isLive, setIsLive] = useState(false);
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [streamUrlInput, setStreamUrlInput] = useState("");
  const [streamUrl, setStreamUrl] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [showVideoOverlay, setShowVideoOverlay] = useState(false);
  const [showScorecardModal, setShowScorecardModal] = useState(false);

  // ── Engine-backed UI state ─────────────────────────────────
  // "More runs" covers 5 and 7+, which the old six-button row could not
  // express at all, plus the boundary / overthrow distinction.
  const [showMoreRuns, setShowMoreRuns] = useState(false);
  const [moreRunsInput, setMoreRunsInput] = useState("5");
  const [moreRunsIsBoundary, setMoreRunsIsBoundary] = useState(false);
  const [moreRunsIsOverthrow, setMoreRunsIsOverthrow] = useState(false);
  // Short run: the scorer records what was attempted and how many were short.
  const [showShortRun, setShowShortRun] = useState(false);
  const [shortAttempted, setShortAttempted] = useState("2");
  const [shortRunsInput, setShortRunsInput] = useState("1");
  // Wide and no ball are now entered as a TOTAL, not as "extra beyond one".
  const [wideTotalInput, setWideTotalInput] = useState("1");
  const [nbTotalInput, setNbTotalInput] = useState("1");
  const [showNBAttribution, setShowNBAttribution] = useState(false);
  const [nbPendingTotal, setNbPendingTotal] = useState(1);
  // Retirement is two genuinely different outcomes, no longer one "Retired".
  const [showRetirement, setShowRetirement] = useState(false);
  const [showReturnToBat, setShowReturnToBat] = useState(false);
  // Penalty runs now carry a recipient and a reason.
  const [ptyAwardedTo, setPtyAwardedTo] = useState<'BATTING' | 'FIELDING'>('BATTING');
  const [ptyReason, setPtyReason] = useState<string>('Unfair Play');
  // Historical correction.
  const [showEditBall, setShowEditBall] = useState(false);
  const [editTargetSeq, setEditTargetSeq] = useState<number | null>(null);
  const [showSuperOverPrompt, setShowSuperOverPrompt] = useState(false);
  // Super Over opener selection — mirrors showOpenerSelect/openerStep above,
  // kept separate because the Super Over's batting/bowling team assignment
  // (battingFirstTeam) is independent of the regular match's team1/team2
  // batting order and can differ innings to innings.
  const [showSOOpenerSelect, setShowSOOpenerSelect] = useState(false);
  const [soIndex, setSoIndex] = useState<number | null>(null);
  const [soWhich, setSoWhich] = useState<1 | 2>(1);
  const [soBattingFirstTeam, setSoBattingFirstTeam] = useState<string>('');
  const [soStep, setSoStep] = useState<"striker" | "nonStriker" | "bowler">("striker");
  const [soOpener1Id, setSoOpener1Id] = useState<number | null>(null);
  const [soOpener2Id, setSoOpener2Id] = useState<number | null>(null);
  const soOpenerSelectionDoneRef = useRef(false);

 useEffect(() => {
  if (!matchId) { setLoading(false); return; }
  const unsub = subscribeToMatch(matchId, (data: any) => {
    console.log('[LISTENER FIRED]', new Date().toISOString(), data?.innings1?.runs, data?.currentInnings);
    setMatch(data);
    setLoading(false);
    if (data?.isLive !== undefined) setIsLive(data.isLive);
    if (data?.streamUrl) { setStreamUrl(data.streamUrl); setIsStreaming(data.isStreaming ?? false); }
  }, (error: any) => {
    console.error('Match subscription error:', error);
    setLoading(false);
    Alert.alert('Error', 'Failed to load match. Please check your connection and try again.');
  });
  return unsub;
}, [matchId]);

// Forces a fresh one-time read whenever this screen regains focus (e.g.
// returning from Scorecard). The Firebase realtime listener above can go
// stale while this screen is frozen in the background by react-native-
// screens, and setMatch's callback silently stops firing — this forced
// read is what actually keeps scoring usable without needing to restart
// the app. This hook ONLY calls setMatch — it does not run any
// transition-check logic itself, so it cannot cause duplicate popups;
// the single useEffect below (triggered by the resulting match-state
// change) is the only place transition checks run.
useFocusEffect(
  React.useCallback(() => {
    if (!matchId) return;
    const database = require('@react-native-firebase/database').default;
    database().ref('matches/' + matchId).once('value').then((snap: any) => {
      const data = snap.val();
      if (data) {
        setMatch(data);
        if (data?.isLive !== undefined) setIsLive(data.isLive);
        if (data?.streamUrl) { setStreamUrl(data.streamUrl); setIsStreaming(data.isStreaming ?? false); }
      }
    });
  }, [matchId])
);

useEffect(() => {
  if (!match) return;
  if (match.currentInnings === 2 && showInningsEnd) {
    setShowInningsEnd(false);
  }
  if (
    match.currentInnings === 2 &&
    match.innings2?.strikerId === -1 &&
    !showOpenerSelect &&
    !openerSelectionDoneRef.current
  ) {
    setOpenerStep("striker");
    setOpener1Id(null); setOpener2Id(null); setOpener3Id(null);
    setShowOpenerSelect(true);
  }
  const allOutThreshold = (match.playersPerSide ?? 11) - 1;
  const inn1Complete = (match.innings1?.wickets ?? 0) >= allOutThreshold || (match.innings1?.overs ?? 0) >= match.totalOvers;
  if (
    match.currentInnings === 1 &&
    match.status === "live" &&
    inn1Complete &&
    !showInningsEnd &&
    !openerSelectionDoneRef.current
  ) {
    setInningsData(match.innings1);
    setShowInningsEnd(true);
  }
}, [match]);

// Drives the "who's the next batsman" and "who's the next bowler" prompts
// straight off the engine's own awaitingBatsmanSlot / awaitingBowler fields
// (set by the reducer after a wicket / over completion, cleared by a
// NEW_BATSMAN / BOWLER_CHANGE event), instead of a one-off flag some handler
// has to remember to set. A wicket on the last ball of an over sets both at
// once; batsman takes priority so the two prompts chain automatically once
// the batsman pick clears its half and this effect re-runs on the next
// match update.
useEffect(() => {
  if (!match) return;
  // Innings1 having ended and the 2nd innings not yet actually open (no
  // innings2 node yet, or its openers/bowler are still the -1 placeholder
  // "Start 2nd Innings" writes before the opener-select flow finishes) means
  // any leftover awaitingBatsmanSlot/awaitingBowler still belongs to the
  // innings that just ended — it must not surface here once the screen has
  // moved on. Checked directly off the data (not a "have we ever finished
  // opener-select once" ref) so it never gets stuck true for the rest of
  // the 2nd innings once openers are actually picked.
  const inningsNotYetOpen =
    match.currentInnings === 2 && (!match.innings2 || match.innings2.strikerId === -1);
  if (showOpenerSelect || showInningsEnd || inningsNotYetOpen) {
    if (pendingWicket) setPendingWicket(false);
    if (showNewBowler) setShowNewBowler(false);
    return;
  }
  const curInn = match.currentInnings === 1 ? match.innings1 : match.innings2;
  if (!curInn) return;

  if (curInn.awaitingBatsmanSlot) {
    if (!pendingWicket) setPendingWicket(true);
    if (showNewBowler) setShowNewBowler(false);
  } else if (curInn.awaitingBowler) {
    if (pendingWicket) setPendingWicket(false);
    if (!showNewBowler) setShowNewBowler(true);
  } else {
    if (pendingWicket) setPendingWicket(false);
    if (showNewBowler) setShowNewBowler(false);
  }
}, [match, showOpenerSelect, showInningsEnd]);

// Drives the Super Over opener picker. There was previously NO way to
// select openers for a Super Over at all — after "Start Super Over" the
// screen just kept showing the frozen, tied 2nd innings, and any runs
// tapped were silently scored against a hardcoded placeholder pair. This
// reuses loadMatch (the same pure function the engine itself uses) so
// "which half is active, and does it already have real openers" is
// decided by the exact same logic as everywhere else — not a second,
// hand-rolled copy of that logic living in the screen.
useEffect(() => {
  if (!match) return;
  if (!match.superOvers || match.superOvers.length === 0) return;
  if (showSOOpenerSelect || soOpenerSelectionDoneRef.current) return;
  let em;
  try {
    em = loadMatch(match);
  } catch {
    return;
  }
  const chain = resolveSuperOverChain(em.superOvers, match.team1 ?? '', match.team2 ?? '', em.rules);
  if (chain.activeIndex == null) return;
  const so = em.superOvers.find((s: any) => s.index === chain.activeIndex);
  if (!so) return;
  const which: 1 | 2 = so.innings1 && isSuperOverInningsComplete(so.innings1, em.rules) ? 2 : 1;
  const half = which === 1 ? so.innings1 : so.innings2;
  if (half) return; // openers already selected for this half
  soOpenerSelectionDoneRef.current = true;
  setSoIndex(chain.activeIndex);
  setSoWhich(which);
  setSoBattingFirstTeam(so.battingFirstTeam);
  setSoOpener1Id(null);
  setSoOpener2Id(null);
  setSoStep("striker");
  setShowSOOpenerSelect(true);
}, [match, showSOOpenerSelect]);

  const getName = (players: any[], id: number) =>
    players?.find((p: any) => p.id === id)?.name ?? ("P" + (id + 1));

  const safeFieldKey = (name: string) =>
    (name || "Unknown").replace(/[.#$\[\]]/g, "_").trim() || "Unknown";

  // Strike rotation, globalPlayerId stamping and AI-summary triggering all
  // moved into the rules engine. Keeping local copies here is what let the
  // screen and the engine drift apart in the first place.

  // ── Engine dispatch ──────────────────────────────────────────
  // The single route from this screen into the rules engine.
  //
  // Everything the old inline path decided by hand — legality, extras
  // attribution, strike rotation, wickets, over completion, innings and
  // match completion, free hits, tournament sync — is now decided by
  // deriveEvent/reduceInnings and persisted atomically by matchEngine.
  // This function deliberately contains no cricket rules.
  const dispatchAction = async (action: ScoringAction) => {
    if (!matchId || saving) return;
    setSaving(true);
    try {
      const res = await applyScoringAction(matchId, action, match ? { raw: match } : {});

      if (res.warnings.length > 0) {
        console.warn("[engine]", res.warnings.map(w => w.message).join(" | "));
      }

      // Commentary and milestones are fire-and-forget: a failure here must
      // never block or roll back a scored delivery.
      try {
        const key = res.innings.isSuperOver
          ? null
          : (match?.currentInnings === 2 ? "innings2" : "innings1");
        if (key) {
          const batterName = batP?.find((p: any) => p.id === inn?.strikerId)?.name ?? "Batter";
          const bowlerName = bolP?.find((p: any) => p.id === inn?.currentBowlerId)?.name ?? "Bowler";
          const commentary = await getBallCommentary(
            commentaryToken(action),
            batterName,
            bowlerName
          );
          if (commentary) {
            await updateMatch(matchId, {
              [key + "/latestCommentaryText"]: commentary,
              [key + "/latestCommentaryTs"]: Date.now(),
            });
          }
          const prevRuns = inn?.batsmanStats?.[statKey(inn?.strikerId)]?.runs ?? 0;
          const newRuns = res.innings.batsmanStats?.[statKey(inn?.strikerId)]?.runs ?? 0;
          const milestone = detectMilestone(prevRuns, newRuns);
          if (milestone) {
            await updateMatch(matchId, {
              lastMilestone: { text: milestone, playerName: batterName, ts: Date.now() },
            });
          }
        }
      } catch {}

      if (res.superOverRequired) {
        setShowSuperOverPrompt(true);
      } else if (res.matchComplete) {
        navigation.replace("Scorecard", { matchId });
      }
    } catch (e: any) {
      Alert.alert(e?.code ? "Cannot record that" : "Error", e?.message ?? "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const toggleLive = async () => {
    const newVal = !isLive;
    setIsLive(newVal);
    await updateMatch(matchId, { isLive: newVal, status: newVal ? "live" : "paused" });
  };

  const handleAddStream = async () => {
    if (!streamUrlInput.trim()) { Alert.alert("Error", "Please enter a stream URL"); return; }
    setStreamUrl(streamUrlInput.trim());
    setIsStreaming(true);
    setShowStreamModal(false);
    await updateMatch(matchId, { streamUrl: streamUrlInput.trim(), isStreaming: true });
    Alert.alert("Stream Added!", "Your live stream is now linked to this match.");
  };

  const handleStopStream = async () => {
    setIsStreaming(false);
    setStreamUrl("");
    setShowVideoOverlay(false);
    await updateMatch(matchId, { isStreaming: false, streamUrl: "" });
  };

  const handleShareMatch = async () => {
    const msg = "Watch LIVE: " + match.team1 + " vs " + match.team2 +
      "\nMatch ID: " + matchId +
      (streamUrl ? "\nStream: " + streamUrl : "") +
      "\nOpen CricketScorer app → Live Match → Enter ID: " + matchId;
    await Share.share({ message: msg });
  };

  // ── Scoring actions ──────────────────────────────────────────
  // Each handler describes only what the scorer indicated. No cricket rule
  // is applied here.

  const handleRunTap = (r: number) => {
    if (byeMode) {
      dispatchAction({ type: byeMode === "LB" ? "LEG_BYE" : "BYE", runs: r });
      setByeMode(null);
      return;
    }
    // 4 and 6 from the quick row are treated as genuine boundaries, which is
    // the overwhelmingly common case. Runs that were RUN, or came from an
    // overthrow, go through "More" so the batter's 4s/6s stay honest.
    dispatchAction({
      type: "RUNS",
      runs: r,
      boundary: r === 4 ? 4 : r === 6 ? 6 : 0,
    });
  };

  const submitMoreRuns = () => {
    const runs = parseInt(moreRunsInput, 10);
    if (!Number.isFinite(runs) || runs < 0) {
      Alert.alert("Invalid runs", "Enter a whole number of runs (0 or more).");
      return;
    }
    setShowMoreRuns(false);
    dispatchAction({
      type: "RUNS",
      runs,
      boundary: moreRunsIsBoundary && (runs === 4 || runs === 6) ? (runs as 4 | 6) : 0,
      overthrowRuns: moreRunsIsOverthrow ? runs : 0,
      runType: moreRunsIsOverthrow ? "OVERTHROW" : undefined,
    });
    setMoreRunsIsBoundary(false);
    setMoreRunsIsOverthrow(false);
  };

  const submitShortRun = () => {
    const attempted = parseInt(shortAttempted, 10);
    const short = parseInt(shortRunsInput, 10);
    if (!Number.isFinite(attempted) || !Number.isFinite(short)) {
      Alert.alert("Invalid runs", "Enter whole numbers for attempted and short runs.");
      return;
    }
    setShowShortRun(false);
    dispatchAction({ type: "RUNS", runs: 0, attemptedRuns: attempted, shortRuns: short });
  };

  const submitWide = () => {
    const total = parseInt(wideTotalInput, 10);
    if (!Number.isFinite(total) || total < 1) {
      Alert.alert("Invalid wide", "Enter the TOTAL runs from the wide (1 or more).");
      return;
    }
    setShowWDRuns(false);
    dispatchAction({ type: "WIDE", totalRuns: total });
  };

  const submitNoBall = () => {
    const total = parseInt(nbTotalInput, 10);
    if (!Number.isFinite(total) || total < 1) {
      Alert.alert("Invalid no ball", "Enter the TOTAL runs from the no ball (1 or more).");
      return;
    }
    setShowNBRuns(false);
    if (total === 1) {
      // Nothing beyond the penalty, so there is nothing to attribute.
      dispatchAction({ type: "NO_BALL", totalRuns: 1, attribution: "BATTER" });
      return;
    }
    // The engine will not guess whose runs these are — ask.
    setNbPendingTotal(total);
    setShowNBAttribution(true);
  };

  const submitNoBallAttribution = (attribution: RunAttribution) => {
    setShowNBAttribution(false);
    const beyond = nbPendingTotal - 1;
    dispatchAction({
      type: "NO_BALL",
      totalRuns: nbPendingTotal,
      attribution,
      boundary:
        attribution === "BATTER" && (beyond === 4 || beyond === 6) ? (beyond as 4 | 6) : 0,
    });
  };

  const handleWicketSelect = (type: string) => {
    setShowWicket(false);
    // Retirement is not a delivery and is no longer a single "Retired".
    if (type === "Retired") {
      setShowRetirement(true);
      return;
    }
    setWicketType(type);
    if (type === "Run Out") {
      setShowRunOutPicker(true);
      return;
    }
    if (type === "Caught" || type === "Stumped") {
      setShowFielder(true);
      return;
    }
    dispatchAction({ type: "WICKET", dismissal: DISMISSAL_MAP[type] ?? "UNKNOWN" });
  };

  const handleRunOutWho = (who: "striker" | "nonStriker") => {
    setRunOutWhoSelected(who);
    setShowRunOutPicker(false);
    setShowRunOutRuns(true);
  };

  const handleRunOutRunsSelect = (runs: number) => {
    setRunOutRuns(runs);
    setShowRunOutRuns(false);
    setShowRunOutFielder(true);
  };

  const handleRunOutFielderSelect = (fielderName: string) => {
    setShowRunOutFielder(false);
    const outId =
      runOutWhoSelected === "nonStriker" ? inn?.nonStrikerId : inn?.strikerId;
    dispatchAction({
      type: "WICKET",
      dismissal: "RUN_OUT",
      playerOutId: outId,
      fielderName,
      runsCompleted: runOutRuns,
    });
    setRunOutWhoSelected(null);
    setRunOutRuns(0);
  };

  const handleCatchOrStumpFielder = (fielderName: string) => {
    setShowFielder(false);
    dispatchAction({
      type: "WICKET",
      dismissal: wicketType === "Stumped" ? "STUMPED" : "CAUGHT",
      fielderName,
    });
  };

  const handleRetirementSelect = (type: RetirementType) => {
    setShowRetirement(false);
    dispatchAction({
      type: "RETIREMENT",
      playerId: inn?.strikerId ?? 0,
      retirementType: type,
    });
  };

  const handleReturnToBat = (playerId: number) => {
    setShowReturnToBat(false);
    dispatchAction({
      type: "RETURN_TO_BAT",
      playerId,
      slot: inn?.awaitingBatsmanSlot ?? "striker",
    });
  };

  const handlePTY = () => {
    const r = parseInt(ptyInput, 10);
    if (!Number.isFinite(r) || r < 1) {
      Alert.alert("Invalid", "Enter penalty runs (1 or more)");
      return;
    }
    setShowPTY(false);
    dispatchAction({
      type: "PENALTY",
      runs: r,
      awardedTo: ptyAwardedTo,
      reason: ptyReason,
    });
  };

  const handleUndo = async () => {
    if (saving || !matchId) return;
    setSaving(true);
    try {
      await undoLastAction(matchId);
      // Any pending prompt is stale once the event log changes. The engine's
      // awaitingBatsmanSlot / awaitingBowler now drive these.
      setPendingWicket(false);
      setShowNewBowler(false);
      openerSelectionDoneRef.current = false;
    } catch (e: any) {
      Alert.alert(e?.code ? "Cannot undo" : "Error", e?.message ?? "Could not undo");
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!match) return;
    const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
    await Share.share({ message: "LIVE: " + match.team1 + " vs " + match.team2 + "\nScore: " + inn.runs + "/" + inn.wickets + " (" + getOversString(inn.overs, inn.balls) + " ov)\nRR: " + getRunRate(inn.runs, inn.overs, inn.balls) + "\nMatch ID: " + matchId });
  };

  const handleEndMatch = async (reason: string) => {
    setShowEndMatch(false);
    if (reason === "Pause Match") {
      await updateMatch(matchId, { status: "paused" });
      Alert.alert("Match Paused", "Match has been paused. You can resume from Home screen.");
      return;
    }
    // Routed through the engine (not a raw status write) so an abandoned
    // match's outcome is resolved the same way every other terminal path
    // is, and — critically — so syncTournament actually runs and marks the
    // tournament's own fixture complete instead of leaving it stuck "live"
    // forever.
    try {
      await concludeMatchWithoutResult(matchId, "ABANDONED", reason);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Could not end the match");
      return;
    }
    navigation.replace("Home");
  };

  const handleNextInnings = async () => {
    // Synchronous guard � checked before any state update or await so a
    // double-tap cannot fire the body twice. The ref is set immediately
    // (not batched like setState) so the second call sees true and exits.
    if (openerSelectionDoneRef.current) return;
      openerSelectionDoneRef.current = true;
    setShowInningsEnd(false);
    await updateMatch(matchId, { innings1: inningsData, currentInnings: 2 });
    setOpenerStep("striker");
    setOpener1Id(null); setOpener2Id(null); setOpener3Id(null);
    setShowOpenerSelect(true);
  };

  const handleOpenerSelect = async (id: number) => {
    if (openerStep === "striker") {
      setOpener1Id(id);
      setOpenerStep("nonStriker");
    } else if (openerStep === "nonStriker") {
      if (id === opener1Id) { Alert.alert("Error", "Must be different from Striker"); return; }
      setOpener2Id(id);
      setOpenerStep("bowler");
    } else {
      const s1 = opener1Id;
      const s2 = opener2Id;
      setShowOpenerSelect(false);
      openerSelectionDoneRef.current = true;
      const tgt = (inningsData?.runs ?? 0) + 1;
      const strikerGid = match.team2Players?.find((p: any) => p.id === s1)?.globalPlayerId ?? null;
      const nonStrikerGid = match.team2Players?.find((p: any) => p.id === s2)?.globalPlayerId ?? null;
      const bowlerGid = match.team1Players?.find((p: any) => p.id === id)?.globalPlayerId ?? null;
      const updInn2 = {
  ...match.innings2,

  strikerId: s1,
  nonStrikerId: s2,
  currentBowlerId: id,

  // Stamp globalPlayerId at creation time so a batter or bowler who never
  // faces another delivery before the innings ends is still visible in
  // My Matches and Match History. The engine also stamps it on every fold.
  batsmanStats: {
    [statKey(s1)]: { ...createEmptyBatsmanStats(s1), globalPlayerId: strikerGid },
    [statKey(s2)]: { ...createEmptyBatsmanStats(s2), globalPlayerId: nonStrikerGid },
  },

  bowlerStats: {
    [statKey(id)]: { ...createEmptyBowlerStats(id), globalPlayerId: bowlerGid },
  },

  ballHistory: [],
  runs: 0,
  wickets: 0,
  overs: 0,
  balls: 0,
  extras: {
    wides: 0,
    noBalls: 0,
    byes: 0,
    legByes: 0,
    penalty: 0,
  },
};
      try {
        await updateMatch(matchId, { innings2: updInn2 });
        Alert.alert("2nd Innings", match.team2 + " needs " + tgt + " to win in " + match.totalOvers + " overs");
      } catch (e: any) {
        openerSelectionDoneRef.current = false;
        setOpenerStep("bowler");
        setShowOpenerSelect(true);
        Alert.alert("Error", "Could not start 2nd innings: " + (e?.message ?? "unknown error") + ". Please try again.");
      }
    }
  };

  const handleSOOpenerSelect = async (id: number) => {
    if (soStep === "striker") {
      setSoOpener1Id(id);
      setSoStep("nonStriker");
      return;
    }
    if (soStep === "nonStriker") {
      if (id === soOpener1Id) { Alert.alert("Error", "Must be different from Striker"); return; }
      setSoOpener2Id(id);
      setSoStep("bowler");
      return;
    }
    // Bowler picked — openers for this Super Over half are complete.
    const strikerId = soOpener1Id;
    const nonStrikerId = soOpener2Id;
    setShowSOOpenerSelect(false);
    try {
      if (soIndex == null || strikerId == null || nonStrikerId == null) {
        throw new Error("Missing opener selection");
      }
      await startSuperOverInnings(matchId, soIndex, soWhich, {
        strikerId,
        nonStrikerId,
        bowlerId: id,
      });
      // Let the detection effect re-evaluate for the next half (innings2)
      // once this half's openers are visible in the next match update.
      soOpenerSelectionDoneRef.current = false;
    } catch (e: any) {
      soOpenerSelectionDoneRef.current = false;
      setShowSOOpenerSelect(true);
      Alert.alert("Error", "Could not start the Super Over: " + (e?.message ?? "unknown error") + ". Please try again.");
    }
  };

  // Both go through the engine (BOWLER_CHANGE / NEW_BATSMAN) instead of
  // patching the innings node directly, so legality (no consecutive overs
  // for a bowler) and awaitingBatsmanSlot/awaitingBowler are decided in one
  // place. The picker modals themselves are hidden by the awaitingBatsmanSlot
  // / awaitingBowler effect above once the engine confirms the change, not
  // by this handler — so a rejected pick (e.g. the same bowler slipping
  // through) leaves the picker open instead of vanishing with nothing done.
  const selectNewBowler = async (id: number) => {
    if (!match || saving) return;
    await dispatchAction({ type: "BOWLER_CHANGE", bowlerId: id });
  };

  const selectNewBatsman = async (id: number) => {
    if (!match || saving) return;
    await dispatchAction({ type: "NEW_BATSMAN", playerId: id });
  };


  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!match) return <View style={s.center}><Text style={s.err}>Match not found</Text></View>;

  const inn = match.currentInnings === 1 ? match.innings1 : match.innings2;
  const batP = match.currentInnings === 1 ? match.team1Players : match.team2Players;
  const bolP = match.currentInnings === 1 ? match.team2Players : match.team1Players;
  const tgt = match.currentInnings === 2 ? (match.innings1?.runs ?? 0) + 1 : null;
  const matchCompleted = !!(match?.status === "completed");
  const ss = inn?.batsmanStats?.[statKey(inn?.strikerId)];
  const bws = inn?.bowlerStats?.[statKey(inn?.currentBowlerId)];
  const ext = inn?.extras ?? { wides: 0, noBalls: 0, byes: 0, legByes: 0, penalty: 0 };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity style={s.headerBack} onPress={() => setShowEndConfirm(true)}>
          <Text style={s.headerBackTxt}>X</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{match.team1} vs {match.team2}</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={[s.liveToggle, !!isLive && s.liveToggleOn]} onPress={toggleLive}>
            <View style={[s.liveDot, !!isLive && s.liveDotOn]} />
            <Text style={[s.liveToggleTxt, !!isLive && {color: "#fff"}]}>{isLive ? "LIVE" : "GO LIVE"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLive && (
        <View style={s.streamBar}>
          {!isStreaming ? (
            <TouchableOpacity style={s.addStreamBtn} onPress={() => setShowStreamModal(true)}>
              <Text style={s.addStreamBtnTxt}>+ Add Stream URL</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.streamActiveBar}>
              <View style={s.streamDot} />
              <Text style={s.streamActiveTxt} numberOfLines={1}>Streaming: {streamUrl.substring(0, 30)}...</Text>
              <TouchableOpacity style={s.streamViewBtn} onPress={() => setShowVideoOverlay(true)}>
                <Text style={s.streamViewBtnTxt}>View</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.streamStopBtn} onPress={handleStopStream}>
                <Text style={s.streamStopBtnTxt}>Stop</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity onPress={handleShareMatch} style={s.shareMatchBtn}>
            <Text style={s.shareMatchBtnTxt}>Share ID</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.scoreboard}>
        <View style={s.sbTop}>
          <View>
            <Text style={s.sbBatting}>{match.currentInnings === 1 ? match.team1 : match.team2} innings</Text>
            <View style={s.sbScoreRow}>
              <Text style={s.sbScore}>{inn?.runs ?? 0}/{inn?.wickets ?? 0}</Text>
              <View style={s.sbMeta}>
                <Text style={s.sbOvers}>{getOversString(inn?.overs ?? 0, inn?.balls ?? 0)}/{match.totalOvers} ov</Text>
                <Text style={s.sbRR}>RR {getRunRate(inn?.runs ?? 0, inn?.overs ?? 0, inn?.balls ?? 0)}</Text>
              </View>
            </View>
            {tgt && <Text style={s.sbTarget}>Need {Math.max(0, tgt - (inn?.runs ?? 0))} off {((match.totalOvers - (inn?.overs ?? 0)) - (inn?.balls ?? 0) / 6).toFixed(1)} ov - RRR: {getRequiredRunRate(tgt, inn?.runs ?? 0, match.totalOvers, inn?.overs ?? 0, inn?.balls ?? 0)}</Text>}
          </View>
        </View>

        {(inn?.ballHistory?.length ?? 0) > 0 && (() => {
          const realBalls = (inn.ballHistory ?? []).filter((b: any) => b.type !== "NEW_BATSMAN" && b.over !== undefined);
          if (realBalls.length === 0) return null;
          const overMap: any = {};
          realBalls.forEach((b: any) => {
            const k = b.over ?? 0;
            if (!overMap[k]) overMap[k] = [];
            overMap[k].push(b);
          });
          const overKeys = Object.keys(overMap).map(Number).sort((a, b) => a - b);
          const lastOvers = overKeys.slice(-3);
          return (
            <View style={s.ballsRow}>
              {lastOvers.map((ov, oi) => (
                <React.Fragment key={ov}>
                  {oi > 0 && <Text style={{color: COLORS.textMuted, fontSize: 10, alignSelf:"center", marginHorizontal: 2}}>|</Text>}
                  {overMap[ov].map((b: any, i: number) => (
                    <View key={i} style={[s.ball,
                      b.result === "W" && s.bW, b.result === "4" && s.b4, b.result === "6" && s.b6,
                      (b.result?.startsWith?.("WD") || b.result?.startsWith?.("NB")) && s.bExtra,
                      (b.result?.startsWith?.("B") && !b.result?.startsWith?.("NB")) && s.bBye]}>
                      <Text style={s.ballTxt}>{b.result?.length > 3 ? b.result.slice(0,3) : b.result}</Text>
                    </View>
                  ))}
                </React.Fragment>
              ))}
            </View>
          );
        })()}
      </View>

      <View style={s.playersCard}>
        <View style={s.pRow}>
          <View style={s.pLeft}>
            <Text style={s.strikerDot}>*</Text>
            <Text style={s.striker}>{getName(batP, inn?.strikerId)}</Text>
          </View>
          {ss && <Text style={s.sStats}>{ss.runs}({ss.balls}){ss.fours > 0 ? " 4x" + ss.fours : ""}{ss.sixes > 0 ? " 6x" + ss.sixes : ""}</Text>}
        </View>
        <View style={s.pRow}>
          <Text style={s.nonStriker}>  {getName(batP, inn?.nonStrikerId)}</Text>
          {inn?.batsmanStats?.[statKey(inn?.nonStrikerId)] && <Text style={s.nsStats}>{inn.batsmanStats[statKey(inn.nonStrikerId)].runs}({inn.batsmanStats[statKey(inn.nonStrikerId)].balls})</Text>}
        </View>
        <View style={[s.pRow, s.bowlerRow]}>
          <Text style={s.bowler}>{getName(bolP, inn?.currentBowlerId)}</Text>
          {bws && <Text style={s.bStats}>{bws.overs}.{bws.balls}-{bws.runs}-{bws.wickets}</Text>}
        </View>
        <Text style={s.extLine}>Extras {(ext.wides ?? 0) + (ext.noBalls ?? 0) + (ext.byes ?? 0) + (ext.legByes ?? 0) + (ext.penalty ?? 0)} (W:{ext.wides ?? 0} NB:{ext.noBalls ?? 0} B:{ext.byes ?? 0} LB:{ext.legByes ?? 0} PTY:{ext.penalty ?? 0})</Text>
      </View>

      {!!matchCompleted && (
        <View style={s.completedBanner}>
          <Text style={s.completedBannerTxt}>Match Completed —  + {match.winner ?? "No result"}</Text>
          <TouchableOpacity onPress={() => navigation.replace("Scorecard", { matchId })}>
            <Text style={s.completedBannerBtn}>View Scorecard</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Retired hurt batters can be brought back in. */}
      {(inn?.retired ?? []).some((r: any) => r.type === "RETIRED_HURT" && !r.returned) && (
        <View style={s.modeBanner}>
          <Text style={s.modeTxt}>A retired hurt batter can return</Text>
          <TouchableOpacity onPress={() => setShowReturnToBat(true)}>
            <Text style={s.modeCancel}>Bring back</Text>
          </TouchableOpacity>
        </View>
      )}

      {byeMode && (
        <View style={s.modeBanner}>
          <Text style={s.modeTxt}>{byeMode} — tap a run button</Text>
          <TouchableOpacity onPress={() => setByeMode(null)}><Text style={s.modeCancel}>Cancel</Text></TouchableOpacity>
        </View>
      )}

      {/* Free hit comes from the engine's persisted innings state, so it
          survives a reload and is restored correctly by undo. */}
      {!!inn?.freeHit && (
        <View style={s.freeHitBanner}>
          <Text style={s.freeHitTxt}>FREE HIT</Text>
          <Text style={s.freeHitSub}>Batsman cannot be dismissed (except run out)</Text>
        </View>
      )}

      <View style={s.runsArea}>
        {QUICK_RUNS.map(r => (
          <Pressable key={r} style={[s.runBtn, r===4&&s.rb4, r===6&&s.rb6, !!byeMode&&s.rbBye]} onPress={() => handleRunTap(r)} disabled={!!(saving || matchCompleted)}>
            <Text style={[s.runBtnTxt, (r===4||r===6)&&{color:"#000"}]}>{r}</Text>
          </Pressable>
        ))}
        {/* 7+, runs that were RUN rather than hit, overthrows and short runs. */}
        <Pressable style={[s.runBtn, !!byeMode&&s.rbBye]} onPress={() => setShowMoreRuns(true)} disabled={!!(saving || matchCompleted)}>
          <Text style={[s.runBtnTxt, {fontSize: 13}]}>More</Text>
        </Pressable>
      </View>

      <View style={s.extrasArea}>
        <Pressable style={[s.xBtn, s.xWD]} onPress={() => setShowWDRuns(true)} disabled={!!(saving || matchCompleted)}><Text style={s.xTxt}>WD</Text></Pressable>
        <Pressable style={[s.xBtn, s.xNB]} onPress={() => setShowNBRuns(true)} disabled={!!(saving || matchCompleted)}><Text style={s.xTxt}>NB</Text></Pressable>
        <Pressable style={[s.xBtn, byeMode==="B"&&s.xActive]} onPress={() => setByeMode(byeMode==="B"?null:"B")} disabled={!!(saving || matchCompleted)}><Text style={s.xTxt}>B</Text></Pressable>
        <Pressable style={[s.xBtn, byeMode==="LB"&&s.xActive]} onPress={() => setByeMode(byeMode==="LB"?null:"LB")} disabled={!!(saving || matchCompleted)}><Text style={s.xTxt}>LB</Text></Pressable>
        <Pressable style={[s.xBtn, s.xOut]} onPress={() => setShowWicket(true)} disabled={!!(saving || matchCompleted)}><Text style={[s.xTxt, {color:"#fff"}]}>OUT</Text></Pressable>
        <Pressable style={[s.xBtn, s.xPTY]} onPress={() => setShowPTY(true)} disabled={!!(saving || matchCompleted)}><Text style={s.xTxt}>PTY</Text></Pressable>
      </View>

      <View style={s.bottomBar}>
        <Pressable style={s.bbBtn} onPress={handleUndo} disabled={!!(saving || matchCompleted)}><Text style={s.bbTxt}>Undo</Text></Pressable>
        <Pressable style={[s.bbBtn, {backgroundColor: COLORS.blue}]} onPress={handleShare}><Text style={[s.bbTxt, {color:"#fff"}]}>Share</Text></Pressable>
        <Pressable style={[s.bbBtn, {backgroundColor: COLORS.primary}]} onPress={() => setShowScorecardModal(true)}><Text style={[s.bbTxt, {color:"#fff"}]}>Scorecard</Text></Pressable>
      </View>

      {showNewBowler && (
        <View style={s.overlay}>
          <View style={s.picker}>
            <Text style={s.pickerTtl}>Over Complete — New Bowler</Text>
            {bolP.filter((p: any) => p.id !== inn?.currentBowlerId).map((p: any) => (
              <TouchableOpacity
                  key={p.id}
                  style={s.pickerRow}
                  disabled={saving}
                  onPress={() => selectNewBowler(p.id)}
              >
                <Text style={s.pickerName}>{p.name}{p.isCaptain?" (C)":""}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {pendingWicket && (
        <View style={s.overlay}>
          <View style={s.picker}>
            <Text style={s.pickerTtl}>Wicket — Next Batsman</Text>
            {batP.filter((p: any) => {
              const pwInn = postWicketInnRef.current ?? inn;
              const bs = pwInn?.batsmanStats?.[statKey(p.id)];
              // Retired-hurt-and-not-yet-returned batters must come back only
              // via Return to Bat (handleReturnToBat), which marks them
              // returned. Picking them here would bring them back without
              // ever clearing that flag.
              const retiredNotReturned = (pwInn?.retired ?? []).some(
                (r: any) => r.playerId === p.id && r.type === "RETIRED_HURT" && !r.returned
              );
              return !bs?.isOut && p.id !== pwInn?.strikerId && p.id !== pwInn?.nonStrikerId && !retiredNotReturned;
            }).map((p: any) => (
              <TouchableOpacity key={p.id} style={s.pickerRow} disabled={saving} onPress={() => selectNewBatsman(p.id)}>
                <Text style={s.pickerName}>{p.name}{p.isCaptain?" (C)":""}{p.isWicketKeeper?" (WK)":""}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <Modal visible={showWicket} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>How Out?</Text>
          <View style={s.wicketGrid}>
            {["Bowled","Caught","LBW","Run Out","Stumped","Hit Wicket","Retired"].map(t => (
              <TouchableOpacity key={t} style={s.wicketBtn} onPress={() => handleWicketSelect(t)}>
                <Text style={s.wicketBtnTxt}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowWicket(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showFielder} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>{wicketType} — Select Fielder</Text>
          <ScrollView style={{maxHeight: 300}}>
            {bolP.map((p: any) => (
              <TouchableOpacity key={p.id} style={s.pickerRow} onPress={() => handleCatchOrStumpFielder(p.name)}>
                <Text style={s.pickerName}>{p.name}{p.isCaptain?" (C)":""}{p.isWicketKeeper?" (WK)":""}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.cancelBtn} onPress={() => handleCatchOrStumpFielder("Skip")}><Text style={s.cancelTxt}>Skip</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showPTY} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Penalty Runs</Text>
          <View style={s.penRow}>
            {["1","2","3","4","5"].map(r => (
              <TouchableOpacity key={r} style={[s.penBtn, ptyInput===r&&s.penBtnA]} onPress={() => setPtyInput(r)}>
                <Text style={[s.penTxt, ptyInput===r&&{color:"#fff"}]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.penInput} value={ptyInput} onChangeText={setPtyInput} keyboardType="numeric" placeholderTextColor={COLORS.textMuted} />

          <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 6 }}>Awarded To</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {([
              { key: "BATTING" as const, label: "Batting side" },
              { key: "FIELDING" as const, label: "Fielding side" },
            ]).map(opt => (
              <TouchableOpacity key={opt.key}
                style={{ flex: 1, padding: 10, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1,
                         borderColor: ptyAwardedTo === opt.key ? COLORS.primary : COLORS.border,
                         backgroundColor: ptyAwardedTo === opt.key ? COLORS.primary + "22" : COLORS.card2 }}
                onPress={() => setPtyAwardedTo(opt.key)}>
                <Text style={{ color: ptyAwardedTo === opt.key ? COLORS.primary : COLORS.textSecondary, fontSize: 12, fontWeight: "bold" }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 6 }}>
            Penalty runs are never charged to the bowler.
          </Text>

          <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginTop: 14, marginBottom: 6 }}>Reason</Text>
          <ScrollView style={{ maxHeight: 132 }}>
            {PENALTY_REASONS.map(reason => (
              <TouchableOpacity key={reason}
                style={{ padding: 9, borderRadius: RADIUS.sm, marginBottom: 5, borderWidth: 1,
                         borderColor: ptyReason === reason ? COLORS.primary : COLORS.border,
                         backgroundColor: ptyReason === reason ? COLORS.primary + "22" : "transparent" }}
                onPress={() => setPtyReason(reason)}>
                <Text style={{ color: ptyReason === reason ? COLORS.primary : COLORS.textSecondary, fontSize: 12 }}>{reason}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <View style={s.mBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowPTY(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handlePTY}><Text style={s.confirmTxt}>Add</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={showEndConfirm} transparent animationType="fade">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Leave Scoring?</Text>
          <Text style={{color: COLORS.textSecondary, fontSize: 14, textAlign: "center", marginBottom: 20}}>
            Are you sure you want to exit scoring?{"\n"}Match is still in progress.
          </Text>
          <TouchableOpacity style={[s.confirmBtn, {backgroundColor: COLORS.red}]} onPress={() => { setShowEndConfirm(false); setShowEndMatch(true); }}>
            <Text style={s.confirmTxt}>End / Abandon Match</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.confirmBtn, {backgroundColor: COLORS.blue, marginTop: 8}]} onPress={() => { setShowEndConfirm(false); setShowScorecardModal(true); }}>
            <Text style={s.confirmTxt}>View Scorecard</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowEndConfirm(false)}>
            <Text style={s.cancelTxt}>Back to Scoring</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showEndMatch} transparent animationType="fade">
        <View style={s.mOverlay}><View style={s.modal}>
          <View style={{flexDirection:"row", alignItems:"center", marginBottom: 14}}>
            <TouchableOpacity onPress={() => { setShowEndMatch(false); setShowEndConfirm(true); }} style={{marginRight: 10}}>
              <AppIcon emoji="←" size={22} color={COLORS.primary} />
            </TouchableOpacity>
            <Text style={[s.mTitle, {marginBottom: 0, flex: 1}]}>Select Reason</Text>
          </View>
          {["Pause Match","Match Abandoned","Network Issue","Bad Weather","Pitch Issue","Other Reason"].map(r => (
            <TouchableOpacity key={r} style={[s.endBtn, r === "Pause Match" && {borderColor: COLORS.orange}]} onPress={() => handleEndMatch(r)}>
              <Text style={[s.endBtnTxt, r === "Pause Match" && {color: COLORS.orange}]}>{r}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowEndMatch(false); setShowEndConfirm(false); }}>
            <Text style={s.cancelTxt}>Continue Scoring</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showInningsEnd} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Innings Over!</Text>
          <Text style={s.innScore}>{match.currentInnings === 1 ? match.team1 : match.team2}: {inningsData?.runs ?? 0}/{inningsData?.wickets ?? 0}</Text>
          {match.currentInnings === 1 && (
            <Text style={s.innTarget}>{match.team2} needs {(inningsData?.runs ?? 0) + 1} to win</Text>
          )}
          <Text style={{color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginBottom: 12}}>
            You can Undo last ball before proceeding
          </Text>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowInningsEnd(false)}>
            <Text style={[s.cancelTxt, {color: COLORS.orange}]}>Undo Last Ball — Stay Here</Text>
          </TouchableOpacity>
          {match.currentInnings === 1 ? (
            <>
              <TouchableOpacity
                  style={[s.confirmBtn, {marginTop: 8, opacity: saving ? 0.5 : 1}]}
                  onPress={handleNextInnings}
                  disabled={saving}>
                  <Text style={s.confirmTxt}>Start 2nd Innings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cancelBtn, {marginTop: 6}]} onPress={() => { setShowScorecardModal(true); }}>
  <Text style={s.cancelTxt}>View 1st Innings Scorecard</Text>
</TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={[s.confirmBtn, {marginTop: 8}]} onPress={() => { setShowInningsEnd(false); navigation.replace("Scorecard", { matchId }); }}>
                <Text style={s.confirmTxt}>View Scorecard</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cancelBtn, {marginTop: 6}]} onPress={() => { setShowInningsEnd(false); navigation.reset({ index: 0, routes: [{ name: "Home" }] }); }}>
                <Text style={s.cancelTxt}>Go to Home</Text>
              </TouchableOpacity>
            </>
          )}
        </View></View>
      </Modal>

      <Modal visible={showStreamModal} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Add Live Stream</Text>
          <Text style={{color: COLORS.textSecondary, fontSize: 13, marginBottom: 16, textAlign: "center"}}>
            Start a YouTube Live stream first, then paste the URL here
          </Text>
          <Text style={{color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginBottom: 6}}>Stream URL</Text>
          <TextInput
            style={[s.penInput, {marginBottom: 8, textAlign: "left", fontSize: 14}]}
            placeholder="https://youtube.com/watch?v=... or RTMP URL"
            placeholderTextColor={COLORS.textMuted}
            value={streamUrlInput}
            onChangeText={setStreamUrlInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <View style={{backgroundColor: COLORS.card2, padding: 12, borderRadius: RADIUS.sm, marginBottom: 16}}>
            <Text style={{color: COLORS.textSecondary, fontSize: 12, lineHeight: 18}}>
              How to go live:{"\n"}
              1. Open YouTube app{"\n"}
              2. Tap + ? Go Live{"\n"}
              3. Copy the live stream URL{"\n"}
              4. Paste it above and tap Add Stream
            </Text>
          </View>
          <View style={s.mBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowStreamModal(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={handleAddStream}><Text style={s.confirmTxt}>Add Stream</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={showVideoOverlay} transparent={false} animationType="slide">
        <View style={{flex:1, backgroundColor: "#000"}}>
          <View style={{height: 220, backgroundColor: "#111"}}>
            {streamUrl ? (
              <WebView
                source={{ uri: streamUrl.includes("youtube") || streamUrl.includes("youtu.be")
                  ? "https://www.youtube.com/embed/" + (streamUrl.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] ?? "") + "?autoplay=1&playsinline=1"
                  : streamUrl }}
                style={{flex:1}}
                allowsFullscreenVideo
                javaScriptEnabled
                domStorageEnabled
              />
            ) : (
              <View style={{flex:1, justifyContent:"center", alignItems:"center"}}>
                <Text style={{color:"#fff", fontSize:16}}>No stream URL set</Text>
              </View>
            )}
          </View>
          <View style={{backgroundColor: "rgba(0,0,0,0.92)", padding: 12}}>
            <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"center"}}>
              <View style={{flexDirection:"row", alignItems:"center", gap:6}}>
                <View style={{width:8,height:8,borderRadius:4,backgroundColor:COLORS.red}} />
                <Text style={{color:COLORS.red,fontSize:11,fontWeight:"bold"}}>LIVE</Text>
                <Text style={{color:COLORS.textSecondary,fontSize:11}}>ID: {matchId}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowVideoOverlay(false)}>
                <Text style={{color:COLORS.textSecondary,fontSize:22,fontWeight:"bold"}}>X</Text>
              </TouchableOpacity>
            </View>
            <Text style={{color:COLORS.textSecondary,fontSize:11,marginTop:4}}>{match?.team1} vs {match?.team2}</Text>
            <View style={{flexDirection:"row", justifyContent:"space-between", alignItems:"flex-end", marginTop:6}}>
              <Text style={{color:"#fff",fontSize:42,fontWeight:"bold"}}>{inn?.runs ?? 0}/{inn?.wickets ?? 0}</Text>
              <View style={{alignItems:"flex-end"}}>
                <Text style={{color:COLORS.primary,fontSize:16,fontWeight:"bold"}}>{getOversString(inn?.overs ?? 0, inn?.balls ?? 0)}/{match?.totalOvers} ov</Text>
                <Text style={{color:COLORS.textSecondary,fontSize:12}}>RR {getRunRate(inn?.runs ?? 0, inn?.overs ?? 0, inn?.balls ?? 0)}</Text>
                {tgt && <Text style={{color:COLORS.red,fontSize:12}}>Need {Math.max(0,tgt-(inn?.runs??0))}</Text>}
              </View>
            </View>
            <View style={{flexDirection:"row", justifyContent:"space-between", marginTop:8}}>
              <View style={{flex:1}}>
                <Text style={{color:"#fff",fontSize:13,fontWeight:"bold"}}>* {getName(batP, inn?.strikerId)}</Text>
                {ss && <Text style={{color:COLORS.primary,fontSize:12}}>{ss.runs}({ss.balls})</Text>}
              </View>
              <View style={{flex:1, alignItems:"flex-end"}}>
                <Text style={{color:COLORS.textSecondary,fontSize:13}}>{getName(bolP, inn?.currentBowlerId)}</Text>
                {bws && <Text style={{color:COLORS.textSecondary,fontSize:12}}>{bws.overs}.{bws.balls}-{bws.runs}-{bws.wickets}</Text>}
              </View>
            </View>
            {(inn?.ballHistory?.length ?? 0) > 0 && (
              <View style={{flexDirection:"row", gap:4, marginTop:8, flexWrap:"wrap"}}>
                {[...(inn.ballHistory ?? [])].slice(-6).map((b: any, i: number) => (
                  <View key={i} style={{width:28,height:28,borderRadius:14,
                    backgroundColor: b.result==="W"?COLORS.red:b.result==="4"?COLORS.blue:b.result==="6"?COLORS.yellow:COLORS.card2,
                    justifyContent:"center",alignItems:"center",borderWidth:1,borderColor:COLORS.border}}>
                    <Text style={{color:"#fff",fontSize:9,fontWeight:"bold"}}>{b.result?.length>3?b.result.slice(0,3):b.result}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
          <ScrollView style={{flex:1, backgroundColor: COLORS.background}} showsVerticalScrollIndicator={false}>
            <View style={{flexDirection:"row", margin:12, gap:6}}>
              {QUICK_RUNS.map(r => (
                <TouchableOpacity key={r} style={{flex:1,height:56,backgroundColor:r===4?"#1a6fa8":r===6?"#c9a000":COLORS.card,borderRadius:RADIUS.md,justifyContent:"center",alignItems:"center",borderWidth:1,borderColor:COLORS.border}}
                  onPress={() => handleRunTap(r)} disabled={!!(saving || matchCompleted)}>
                  <Text style={{color:"#fff",fontSize:22,fontWeight:"bold"}}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:"row", marginHorizontal:12, gap:6, marginBottom:12}}>
              {[
                {label:"WD", onPress:()=>setShowWDRuns(true), color:COLORS.orange},
                {label:"NB", onPress:()=>setShowNBRuns(true), color:COLORS.purple},
                {label:"B", onPress:()=>setByeMode(byeMode==="B"?null:"B"), color:byeMode==="B"?COLORS.blue:COLORS.card2},
                {label:"LB", onPress:()=>setByeMode(byeMode==="LB"?null:"LB"), color:byeMode==="LB"?COLORS.blue:COLORS.card2},
                {label:"OUT", onPress:()=>setShowWicket(true), color:COLORS.red},
                {label:"PTY", onPress:()=>setShowPTY(true), color:COLORS.card2},
              ].map(btn => (
                <TouchableOpacity key={btn.label} style={{flex:1,height:44,backgroundColor:btn.color,borderRadius:RADIUS.sm,justifyContent:"center",alignItems:"center",borderWidth:1,borderColor:COLORS.border}}
                  onPress={btn.onPress} disabled={!!(saving || matchCompleted)}>
                  <Text style={{color:"#fff",fontSize:12,fontWeight:"bold"}}>{btn.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{flexDirection:"row",marginHorizontal:12,gap:8,marginBottom:20}}>
              <TouchableOpacity style={{flex:1,padding:10,backgroundColor:COLORS.card,borderRadius:RADIUS.md,alignItems:"center",borderWidth:1,borderColor:COLORS.border}} onPress={handleUndo}>
                <Text style={{color:COLORS.text,fontWeight:"bold"}}>Undo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={{flex:1,padding:10,backgroundColor:COLORS.primary,borderRadius:RADIUS.md,alignItems:"center"}} onPress={() => setShowVideoOverlay(false)}>
                <Text style={{color:"#fff",fontWeight:"bold"}}>Back</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal visible={showOpenerSelect} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>
            {openerStep === "striker" ? "Select Opening Batter 1 (Striker)" :
             openerStep === "nonStriker" ? "Select Opening Batter 2 (Non-Striker)" :
             "Select Opening Bowler"}
          </Text>
          <Text style={{color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 14}}>
            {openerStep === "bowler" ? match.team1 + " bowling" : match.team2 + " batting"}
          </Text>
          <ScrollView style={{maxHeight: 320}}>
            {(openerStep === "bowler" ? (match.team1Players ?? []) : (match.team2Players ?? [])).map((p: any) => {
              const disabled = openerStep === "nonStriker" && p.id === opener1Id;
              return (
                <TouchableOpacity key={p.id}
                  style={[s.pickerRow, disabled && {opacity: 0.4}]}
                  onPress={() => !disabled && handleOpenerSelect(p.id)}
                  disabled={!!disabled}>
                  <Text style={s.pickerName}>
                    {p.name}{p.isCaptain ? " (C)" : ""}{p.isWicketKeeper ? " (WK)" : ""}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View></View>
      </Modal>

      {/* ── Super Over opener selection ─────────────────────────── */}
      {showSOOpenerSelect && (() => {
        const soBattingFirstIsTeam1 = soBattingFirstTeam === match.team1;
        const soBattingIsTeam1 = soWhich === 1 ? soBattingFirstIsTeam1 : !soBattingFirstIsTeam1;
        const soBatP = soBattingIsTeam1 ? (match.team1Players ?? []) : (match.team2Players ?? []);
        const soBolP = soBattingIsTeam1 ? (match.team2Players ?? []) : (match.team1Players ?? []);
        const soBattingTeamName = soBattingIsTeam1 ? match.team1 : match.team2;
        const soBowlingTeamName = soBattingIsTeam1 ? match.team2 : match.team1;
        return (
          <Modal visible transparent animationType="slide">
            <View style={s.mOverlay}><View style={s.modal}>
              <Text style={s.mTitle}>
                Super Over{soWhich === 2 ? " — 2nd Innings" : ""}
                {"\n"}
                {soStep === "striker" ? "Select Opening Batter 1 (Striker)" :
                 soStep === "nonStriker" ? "Select Opening Batter 2 (Non-Striker)" :
                 "Select Opening Bowler"}
              </Text>
              <Text style={{color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 14}}>
                {soStep === "bowler" ? soBowlingTeamName + " bowling" : soBattingTeamName + " batting"}
              </Text>
              <ScrollView style={{maxHeight: 320}}>
                {(soStep === "bowler" ? soBolP : soBatP).map((p: any) => {
                  const disabled = soStep === "nonStriker" && p.id === soOpener1Id;
                  return (
                    <TouchableOpacity key={p.id}
                      style={[s.pickerRow, disabled && {opacity: 0.4}]}
                      onPress={() => !disabled && handleSOOpenerSelect(p.id)}
                      disabled={!!disabled}>
                      <Text style={s.pickerName}>
                        {p.name}{p.isCaptain ? " (C)" : ""}{p.isWicketKeeper ? " (WK)" : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View></View>
          </Modal>
        );
      })()}

      <Modal visible={showRunOutRuns} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>How many runs were completed?</Text>
          {[0, 1, 2, 3].map((n) => (
            <TouchableOpacity key={n} style={[s.endBtn, { borderColor: COLORS.yellow, marginBottom: 10 }]} onPress={() => handleRunOutRunsSelect(n)}>
              <Text style={s.endBtnTxt}>{n} run{n === 1 ? '' : 's'}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowRunOutRuns(false); setRunOutWhoSelected(null); }}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showRunOutPicker} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Run Out — Who is Out?</Text>
          <Text style={{color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 16}}>A run out can happen at either end. Select the dismissed batter.</Text>
          <TouchableOpacity style={[s.endBtn, {borderColor: COLORS.yellow, marginBottom: 12}]} onPress={() => handleRunOutWho("striker")}>
            <Text style={{color: COLORS.yellow, fontSize: 15, fontWeight: "bold", textAlign: "center"}}>* {getName(batP, inn?.strikerId)}</Text>
            <Text style={{color: COLORS.textMuted, fontSize: 12, textAlign: "center"}}>Striker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.endBtn, {borderColor: COLORS.blue}]} onPress={() => handleRunOutWho("nonStriker")}>
            <Text style={{color: COLORS.blue, fontSize: 15, fontWeight: "bold", textAlign: "center"}}>{getName(batP, inn?.nonStrikerId)}</Text>
            <Text style={{color: COLORS.textMuted, fontSize: 12, textAlign: "center"}}>Non-Striker</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.cancelBtn, {marginTop: 12}]} onPress={() => setShowRunOutPicker(false)}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showRunOutFielder} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Run Out — Select Fielder</Text>
          <Text style={{color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 14}}>Who effected the run out?</Text>
          <ScrollView style={{maxHeight: 300}}>
            {bolP.map((p: any) => (
              <TouchableOpacity key={p.id} style={s.pickerRow} onPress={() => handleRunOutFielderSelect(p.name)}>
                <Text style={s.pickerName}>{p.name}{p.isCaptain ? " (C)" : ""}{p.isWicketKeeper ? " (WK)" : ""}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={s.cancelBtn} onPress={() => handleRunOutFielderSelect("Skip")}>
            <Text style={s.cancelTxt}>Skip</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showWDRuns} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Wide</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 6 }}>Enter the TOTAL runs from this wide</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginBottom: 14 }}>The one wide run is already included — do not add it yourself</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 12 }}>
            {[1,2,3,4,5].map(n => (
              <TouchableOpacity key={n}
                style={{ width: 56, height: 56, backgroundColor: wideTotalInput === String(n) ? COLORS.orange : COLORS.card2, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.orange }}
                onPress={() => setWideTotalInput(String(n))}>
                <Text style={{ color: wideTotalInput === String(n) ? "#fff" : COLORS.text, fontSize: 20, fontWeight: "bold" }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.penInput} value={wideTotalInput} onChangeText={setWideTotalInput} keyboardType="numeric" placeholder="Total runs" placeholderTextColor={COLORS.textMuted} />
          <View style={s.mBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowWDRuns(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={submitWide}><Text style={s.confirmTxt}>Add</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      <Modal visible={showNBRuns} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>No Ball</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 6 }}>Enter the TOTAL runs from this no ball</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginBottom: 14 }}>The one no-ball run is already included — do not add it yourself</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 12 }}>
            {[1,2,3,4,5,7].map(n => (
              <TouchableOpacity key={n}
                style={{ width: 52, height: 52, backgroundColor: nbTotalInput === String(n) ? COLORS.purple : COLORS.card2, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.purple }}
                onPress={() => setNbTotalInput(String(n))}>
                <Text style={{ color: nbTotalInput === String(n) ? "#fff" : COLORS.text, fontSize: 19, fontWeight: "bold" }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.penInput} value={nbTotalInput} onChangeText={setNbTotalInput} keyboardType="numeric" placeholder="Total runs" placeholderTextColor={COLORS.textMuted} />
          <View style={s.mBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNBRuns(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={submitNoBall}><Text style={s.confirmTxt}>Next</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>
      <Modal visible={showScorecardModal} animationType="slide" onRequestClose={() => setShowScorecardModal(false)}>
  <View style={{ flex: 1, backgroundColor: COLORS.background }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md, paddingTop: 50 }}>
      <TouchableOpacity onPress={() => setShowScorecardModal(false)} style={{ padding: 8 }}>
        <Text style={{ color: COLORS.primary, fontSize: 16, fontWeight: 'bold' }}>← Back to Scoring</Text>
      </TouchableOpacity>
    </View>
    <ScorecardScreen
      // NEW: pass the already-subscribed `match` state directly instead of
      // letting ScorecardScreen open a second Firebase subscription on the
      // same path. This removes the whole class of bug where closing this
      // modal could leave ScoringScreen's listener dead or stale.
      route={{ params: { matchId, liveMatch: match } }}
      navigation={{
        goBack: () => setShowScorecardModal(false),
        navigate: () => {},
        replace: () => {},
        reset: () => setShowScorecardModal(false),
      }}
    />
  </View>
</Modal>

      {/* ── No-ball run attribution ──────────────────────────────
          The engine will not guess whether extra no-ball runs came off the
          bat or were byes: crediting the batter wrongly corrupts their
          strike rate, and crediting the bowler wrongly corrupts economy. */}
      <Modal visible={showNBAttribution} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>No Ball — Who Got The Runs?</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 4 }}>
            {nbPendingTotal} total = 1 no ball + {nbPendingTotal - 1} run{nbPendingTotal - 1 === 1 ? "" : "s"}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginBottom: 16 }}>
            Who the {nbPendingTotal - 1} run{nbPendingTotal - 1 === 1 ? "" : "s"} belong{nbPendingTotal - 1 === 1 ? "s" : ""} to
          </Text>
          {([
            { key: "BATTER" as RunAttribution, label: "Off the bat", sub: "Counts to the batter's runs and the bowler's figures" },
            { key: "BYE" as RunAttribution, label: "Byes", sub: "Team runs only — not charged to the bowler" },
            { key: "LEG_BYE" as RunAttribution, label: "Leg byes", sub: "Team runs only — not charged to the bowler" },
          ]).map(opt => (
            <TouchableOpacity key={opt.key} style={s.endBtn} onPress={() => submitNoBallAttribution(opt.key)}>
              <Text style={s.endBtnTxt}>{opt.label}</Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>{opt.sub}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNBAttribution(false)}>
            <Text style={s.cancelTxt}>Cancel</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      {/* ── More runs: 7+, runs that were run, overthrows ──────── */}
      <Modal visible={showMoreRuns} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Enter Runs</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginBottom: 12 }}>
            Any number of runs. There is no six-run limit.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 12 }}>
            {[5,7,8,9,10].map(n => (
              <TouchableOpacity key={n}
                style={{ width: 52, height: 52, backgroundColor: moreRunsInput === String(n) ? COLORS.primary : COLORS.card2, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border }}
                onPress={() => setMoreRunsInput(String(n))}>
                <Text style={{ color: moreRunsInput === String(n) ? "#fff" : COLORS.text, fontSize: 19, fontWeight: "bold" }}>{n}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput style={s.penInput} value={moreRunsInput} onChangeText={setMoreRunsInput} keyboardType="numeric" placeholder="Runs" placeholderTextColor={COLORS.textMuted} />
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }} onPress={() => setMoreRunsIsBoundary(v => !v)}>
            <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: COLORS.primary, backgroundColor: moreRunsIsBoundary ? COLORS.primary : "transparent" }} />
            <Text style={{ color: COLORS.text, fontSize: 13, flex: 1 }}>Hit as a boundary (counts as a 4 or 6)</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 12 }} onPress={() => setMoreRunsIsOverthrow(v => !v)}>
            <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 1, borderColor: COLORS.orange, backgroundColor: moreRunsIsOverthrow ? COLORS.orange : "transparent" }} />
            <Text style={{ color: COLORS.text, fontSize: 13, flex: 1 }}>Came from an overthrow</Text>
          </TouchableOpacity>
          <View style={s.mBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowMoreRuns(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={submitMoreRuns}><Text style={s.confirmTxt}>Add</Text></TouchableOpacity>
          </View>
          <TouchableOpacity style={[s.cancelBtn, { marginTop: 8 }]} onPress={() => { setShowMoreRuns(false); setShowShortRun(true); }}>
            <Text style={[s.cancelTxt, { color: COLORS.orange }]}>A run was called short</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>

      {/* ── Short run ──────────────────────────────────────────── */}
      <Modal visible={showShortRun} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Short Run</Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 11, textAlign: "center", marginBottom: 14 }}>
            Only the completed runs are credited. No wicket and no extra ball is recorded.
          </Text>
          <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>Runs attempted</Text>
          <TextInput style={s.penInput} value={shortAttempted} onChangeText={setShortAttempted} keyboardType="numeric" placeholderTextColor={COLORS.textMuted} />
          <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginTop: 10, marginBottom: 4 }}>Runs called short</Text>
          <TextInput style={s.penInput} value={shortRunsInput} onChangeText={setShortRunsInput} keyboardType="numeric" placeholderTextColor={COLORS.textMuted} />
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginTop: 10, marginBottom: 12 }}>
            Credited: {Math.max(0, (parseInt(shortAttempted, 10) || 0) - (parseInt(shortRunsInput, 10) || 0))}
          </Text>
          <View style={s.mBtns}>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowShortRun(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={s.confirmBtn} onPress={submitShortRun}><Text style={s.confirmTxt}>Add</Text></TouchableOpacity>
          </View>
        </View></View>
      </Modal>

      {/* ── Retirement ─────────────────────────────────────────────
          Two different outcomes in law, no longer one "Retired". */}
      <Modal visible={showRetirement} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Retirement</Text>
          <TouchableOpacity style={s.endBtn} onPress={() => handleRetirementSelect("RETIRED_HURT")}>
            <Text style={s.endBtnTxt}>Retired Hurt</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>Not a wicket. Keeps their score and may return later.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.endBtn, { borderColor: COLORS.red }]} onPress={() => handleRetirementSelect("RETIRED_OUT")}>
            <Text style={[s.endBtnTxt, { color: COLORS.red }]}>Retired Out</Text>
            <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>Counts as a wicket. No bowler is credited. Cannot return.</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowRetirement(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* ── Return to bat (retired hurt) ──────────────────────── */}
      <Modal visible={showReturnToBat} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Return to Bat</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {(inn?.retired ?? [])
              .filter((r: any) => r.type === "RETIRED_HURT" && !r.returned)
              .map((r: any) => (
                <TouchableOpacity key={r.playerId} style={s.pickerRow} onPress={() => handleReturnToBat(r.playerId)}>
                  <Text style={s.pickerName}>{getName(batP, r.playerId)}</Text>
                </TouchableOpacity>
              ))}
            {(inn?.retired ?? []).filter((r: any) => r.type === "RETIRED_HURT" && !r.returned).length === 0 && (
              <Text style={{ color: COLORS.textMuted, textAlign: "center", padding: 16 }}>No retired hurt batters to bring back.</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowReturnToBat(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      {/* ── Super Over prompt ──────────────────────────────────── */}
      <Modal visible={showSuperOverPrompt} transparent animationType="fade">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>Match Tied</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 16 }}>
            This competition settles a tie with a Super Over.
          </Text>
          <TouchableOpacity style={s.confirmBtn} onPress={async () => {
            setShowSuperOverPrompt(false);
            try {
              if (matchId) await startSuperOver(matchId, {});
            } catch (e: any) {
              Alert.alert("Cannot start Super Over", e?.message ?? "Unknown error");
            }
          }}>
            <Text style={s.confirmTxt}>Start Super Over</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowSuperOverPrompt(false); navigation.replace("Scorecard", { matchId }); }}>
            <Text style={s.cancelTxt}>Leave as a tied match</Text>
          </TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  err: { color: COLORS.text, fontSize: 16 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: SPACING.md, paddingTop: 50, paddingBottom: 12, backgroundColor: COLORS.background },
  headerBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.card, justifyContent: "center", alignItems: "center" },
  headerBackTxt: { color: COLORS.textSecondary, fontSize: 14, fontWeight: "bold" },
  headerTitle: { flex: 1, color: COLORS.text, fontSize: 15, fontWeight: "bold", textAlign: "center" },
  headerShare: { backgroundColor: COLORS.blue, paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.round },
  headerShareTxt: { color: "#fff", fontSize: 12, fontWeight: "bold" },
  scoreboard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sbTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  sbBatting: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 },
  sbScoreRow: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  sbScore: { color: COLORS.text, fontSize: 52, fontWeight: "bold", lineHeight: 58 },
  sbMeta: { paddingBottom: 8 },
  sbOvers: { color: COLORS.primary, fontSize: 16, fontWeight: "bold" },
  sbRR: { color: COLORS.textSecondary, fontSize: 12 },
  sbTarget: { color: COLORS.red, fontSize: 12, marginTop: 4, fontWeight: "bold" },
  ballsRow: { flexDirection: "row", gap: 5, marginTop: 8, flexWrap: "wrap" },
  ball: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.card2, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  bW: { backgroundColor: COLORS.red }, b4: { backgroundColor: COLORS.blue }, b6: { backgroundColor: COLORS.yellow },
  bExtra: { backgroundColor: COLORS.orange }, bBye: { backgroundColor: COLORS.teal },
  ballTxt: { color: COLORS.text, fontSize: 9, fontWeight: "bold" },
  playersCard: { backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginTop: 8, borderRadius: RADIUS.md, padding: 10, borderWidth: 1, borderColor: COLORS.border },
  pRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3 },
  pLeft: { flexDirection: "row", alignItems: "center", gap: 4 },
  strikerDot: { color: COLORS.yellow, fontSize: 18, fontWeight: "bold" },
  striker: { color: COLORS.text, fontSize: 15, fontWeight: "bold" },
  sStats: { color: COLORS.primary, fontSize: 14, fontWeight: "bold" },
  nonStriker: { color: COLORS.textSecondary, fontSize: 13 },
  nsStats: { color: COLORS.textSecondary, fontSize: 12 },
  bowlerRow: { borderTopWidth: 1, borderTopColor: COLORS.border, marginTop: 4, paddingTop: 6 },
  bowler: { color: COLORS.textSecondary, fontSize: 12 },
  bStats: { color: COLORS.textSecondary, fontSize: 12 },
  extLine: { color: COLORS.textMuted, fontSize: 10, marginTop: 3 },
  modeBanner: { flexDirection: "row", justifyContent: "space-between", backgroundColor: COLORS.blue + "33", marginHorizontal: SPACING.md, marginTop: 6, padding: 8, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.blue },
  modeTxt: { color: COLORS.blue, fontSize: 13, fontWeight: "bold" },
  modeCancel: { color: COLORS.red, fontWeight: "bold" },
  freeHitBanner: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.yellow + "33", marginHorizontal: SPACING.md, marginTop: 4, padding: 8, borderRadius: RADIUS.sm, borderWidth: 2, borderColor: COLORS.yellow },
  freeHitTxt: { color: COLORS.yellow, fontSize: 14, fontWeight: "900", letterSpacing: 1 },
  freeHitSub: { color: COLORS.yellow, fontSize: 10, flex: 1, textAlign: "right" },
  completedBanner: { backgroundColor: COLORS.primary + "22", marginHorizontal: SPACING.md, marginTop: 6, padding: 10, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  completedBannerTxt: { color: COLORS.primary, fontSize: 12, fontWeight: "bold", flex: 1 },
  completedBannerBtn: { color: "#fff", backgroundColor: COLORS.primary, paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.round, fontSize: 12, fontWeight: "bold" },
  runsArea: { flexDirection: "row", marginHorizontal: SPACING.md, marginTop: 10, gap: 6 },
  runBtn: { flex: 1, height: 65, backgroundColor: COLORS.card, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  rb4: { backgroundColor: "#1a6fa8", borderColor: "#1a6fa8" },
  rb6: { backgroundColor: "#c9a000", borderColor: "#c9a000" },
  rbBye: { borderColor: COLORS.blue, borderWidth: 2 },
  runBtnTxt: { color: COLORS.text, fontSize: 26, fontWeight: "bold" },
  extrasArea: { flexDirection: "row", marginHorizontal: SPACING.md, marginTop: 8, gap: 6 },
  xBtn: { flex: 1, height: 48, backgroundColor: COLORS.card2, borderRadius: RADIUS.sm, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  xWD: { borderColor: COLORS.orange }, xNB: { borderColor: COLORS.purple },
  xActive: { backgroundColor: COLORS.blue, borderColor: COLORS.blue },
  xOut: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  xPTY: { borderColor: COLORS.yellow },
  xTxt: { color: COLORS.text, fontSize: 13, fontWeight: "bold" },
  bottomBar: { flexDirection: "row", marginHorizontal: SPACING.md, marginTop: 8, gap: 8 },
  bbBtn: { flex: 1, padding: 12, backgroundColor: COLORS.card, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  bbTxt: { color: COLORS.text, fontWeight: "bold", fontSize: 13 },
  overlay: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.7)", padding: SPACING.md },
  picker: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 2, borderColor: COLORS.primary },
  pickerTtl: { color: COLORS.primary, fontSize: 14, fontWeight: "bold", marginBottom: 10 },
  pickerRow: { padding: 12, borderRadius: RADIUS.sm, backgroundColor: COLORS.card2, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  pickerName: { color: COLORS.text, fontSize: 15 },
  mOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  mTitle: { color: COLORS.text, fontSize: 18, fontWeight: "bold", marginBottom: 14, textAlign: "center" },
  wicketGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  wicketBtn: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border },
  wicketBtnTxt: { color: COLORS.text, fontSize: 14, fontWeight: "bold" },
  penRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 12 },
  penBtn: { width: 52, height: 52, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  penBtnA: { backgroundColor: COLORS.primary },
  penTxt: { color: COLORS.text, fontSize: 20, fontWeight: "bold" },
  penInput: { backgroundColor: COLORS.background, color: COLORS.text, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, textAlign: "center", fontSize: 18, marginBottom: 12 },
  endBtn: { backgroundColor: COLORS.card2, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  endBtnTxt: { color: COLORS.text, fontSize: 15, fontWeight: "bold" },
  innScore: { color: COLORS.primary, fontSize: 28, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  innTarget: { color: COLORS.yellow, fontSize: 14, textAlign: "center", marginBottom: 14 },
  cancelBtn: { backgroundColor: COLORS.card2, padding: 12, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border, marginTop: 6 },
  cancelTxt: { color: COLORS.textSecondary, fontWeight: "bold" },
  mBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  confirmBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: RADIUS.md, alignItems: "center", marginTop: 6 },
  confirmTxt: { color: "#fff", fontWeight: "bold", fontSize: 15 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveToggle: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border, gap: 5 },
  liveToggleOn: { backgroundColor: COLORS.red, borderColor: COLORS.red },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.textMuted },
  liveDotOn: { backgroundColor: "#fff" },
  liveToggleTxt: { color: COLORS.textSecondary, fontSize: 11, fontWeight: "bold" },
  streamBar: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, marginHorizontal: SPACING.md, marginBottom: 6, borderRadius: RADIUS.sm, padding: 8, gap: 8, borderWidth: 1, borderColor: COLORS.red + "55" },
  addStreamBtn: { flex: 1, backgroundColor: COLORS.red + "22", padding: 8, borderRadius: RADIUS.sm, alignItems: "center", borderWidth: 1, borderColor: COLORS.red },
  addStreamBtnTxt: { color: COLORS.red, fontSize: 12, fontWeight: "bold" },
  streamActiveBar: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  streamDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.red },
  streamActiveTxt: { color: COLORS.text, fontSize: 11, flex: 1 },
  streamViewBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.round },
  streamViewBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  streamStopBtn: { backgroundColor: COLORS.red, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.round },
  streamStopBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "bold" },
  shareMatchBtn: { backgroundColor: COLORS.blue, paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.round },
  shareMatchBtnTxt: { color: "#fff", fontSize: 11, fontWeight: "bold" },
});