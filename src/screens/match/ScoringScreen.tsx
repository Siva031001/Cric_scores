import React, { useEffect, useState, useRef } from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet, Alert, ScrollView, Share, ActivityIndicator, Modal, TextInput } from "react-native";
import { WebView } from "react-native-webview";
import { subscribeToMatch, updateMatch, completeTournamentMatch, generateMatchSummary } from "../../utils/firebase";
import {
  processBall,
  undoLastBall,
  getOversString,
  getRunRate,
  getRequiredRunRate,
  getNBBatterRuns,
  getWDBatterRuns,
  getStrikeRotationRuns,
  statKey,
  createEmptyBatsmanStats,
  createEmptyBowlerStats,
} from "../../utils/cricketLogic";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";
import AppIcon from '../../components/AppIcon';
import { useFocusEffect } from "@react-navigation/native";
import ScorecardScreen from "./ScorecardScreen";


export default function ScoringScreen({ route, navigation }: any) {
  const { matchId } = route.params ?? {};
  const [match, setMatch] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showNewBowler, setShowNewBowler] = useState(false);
  const [pendingWicket, setPendingWicket] = useState(false);
  const [pendingBowlerAfterWicket, setPendingBowlerAfterWicket] = useState(false);
  const pendingBowlerAfterWicketRef = useRef(false);
  const postWicketInnRef = useRef<any>(null);
  const openerSelectionDoneRef = useRef(false);
  const [showWicket, setShowWicket] = useState(false);
  const [showFielder, setShowFielder] = useState(false);
  const [showRunOutPicker, setShowRunOutPicker] = useState(false);
  const [showRunOutFielder, setShowRunOutFielder] = useState(false);
  const [runOutWhoSelected, setRunOutWhoSelected] = useState<"striker"|"nonStriker"|null>(null);
  const [showOpenerSelect, setShowOpenerSelect] = useState(false);
  const [openerStep, setOpenerStep] = useState<"striker"|"nonStriker"|"bowler">("striker");
  const [opener1Id, setOpener1Id] = useState<number|null>(null);
  const [opener2Id, setOpener2Id] = useState<number|null>(null);
  const [opener3Id, setOpener3Id] = useState<number|null>(null);
  const [wicketType, setWicketType] = useState("");
  const [byeMode, setByeMode] = useState<"B"|"LB"|null>(null);
  const [showPTY, setShowPTY] = useState(false);
  const [showWDRuns, setShowWDRuns] = useState(false);
  const [freeHit, setFreeHit] = useState(false);
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

 useEffect(() => {
  if (!matchId) { setLoading(false); return; }
  const unsub = subscribeToMatch(matchId, (data: any) => {
    console.log('[LISTENER FIRED]', new Date().toISOString(), data?.innings1?.runs, data?.currentInnings);
    setMatch(data);
    setLoading(false);
    if (data?.isLive !== undefined) setIsLive(data.isLive);
    if (data?.streamUrl) { setStreamUrl(data.streamUrl); setIsStreaming(data.isStreaming ?? false); }
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
  const inn1Complete = (match.innings1?.wickets ?? 0) >= 10 || (match.innings1?.overs ?? 0) >= match.totalOvers;
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

  const getName = (players: any[], id: number) =>
    players?.find((p: any) => p.id === id)?.name ?? ("P" + (id + 1));

  const safeFieldKey = (name: string) =>
    (name || "Unknown").replace(/[.#$\[\]]/g, "_").trim() || "Unknown";

  const rot = (inn: any) => { const t = inn.strikerId; inn.strikerId = inn.nonStrikerId; inn.nonStrikerId = t; };

  const stampGlobalPlayerIds = (
  innings: any,
  battingPlayers: any[] = [],
  bowlingPlayers: any[] = []
) => {

  const batsmanStats = { ...(innings?.batsmanStats ?? {}) };
  const bowlerStats = { ...(innings?.bowlerStats ?? {}) };

  const battingMap = new Map(
    battingPlayers.map((p: any) => [statKey(p.id), p.globalPlayerId ?? null])
  );

  const bowlingMap = new Map(
    bowlingPlayers.map((p: any) => [statKey(p.id), p.globalPlayerId ?? null])
  );

  Object.keys(batsmanStats).forEach((id) => {
    if (!batsmanStats[id]) return;

    batsmanStats[id] = {
      ...batsmanStats[id],
      globalPlayerId: battingMap.get(id) ?? null,
    };
  });

  Object.keys(bowlerStats).forEach((id) => {
    if (!bowlerStats[id]) return;

    bowlerStats[id] = {
      ...bowlerStats[id],
      globalPlayerId: bowlingMap.get(id) ?? null,
    };
  });

  return {
    ...innings,
    batsmanStats,
    bowlerStats,
  };
};

  // Helper: fire AI summary generation after a match completes.
  // Non-blocking � errors are caught and logged so a Gemini failure
  // never prevents the scorecard from loading or crashes the app.
  const triggerAISummary = (updatedMatch: any) => {
    generateMatchSummary(matchId, updatedMatch).catch((e: any) =>
      console.warn("AI summary skipped:", e?.message)
    );
  };

  const finishWicketBall = async (
    key: string,
    updInn: any,
    remainingBatters: any[],
    overCompletedOnThisBall: boolean
  ) => {
    const allOutNow = remainingBatters.length === 0 || updInn.wickets >= 10;
    const oversCompleteNow = updInn.overs >= match.totalOvers;

    if (allOutNow || oversCompleteNow) {
      await updateMatch(matchId, { [key]: updInn });

      if (match.currentInnings === 2) {
        const runs1 = match.innings1?.runs ?? 0;
        let result2;
        if (updInn.runs === runs1) result2 = "Match tied";
        else if (updInn.runs < runs1) result2 = match.team1 + " won by " + (runs1 - updInn.runs) + " run" + ((runs1 - updInn.runs) !== 1 ? "s" : "");
        else result2 = match.team2 + " won";
        await updateMatch(matchId, { status: "completed", winner: result2 });
        if (match.tournamentId && match.tournamentMatchId) {
          await completeTournamentMatch(match.tournamentId, match.tournamentMatchId, {
            team1: match.team1, team2: match.team2, innings1: match.innings1, innings2: updInn,
            winner: result2, matchId, totalOvers: match.totalOvers,
          });
        }
        // Trigger AI summary � non-blocking
        triggerAISummary({ ...match, innings2: updInn, status: "completed", winner: result2 });
        setSaving(false);
        navigation.replace("Scorecard", { matchId });
        return;
      }

      setInningsData(updInn);
      setShowInningsEnd(true);
      setSaving(false);
      return;
    }

    if (overCompletedOnThisBall) {
      rot(updInn);
      await updateMatch(matchId, { [key]: updInn });
      pendingBowlerAfterWicketRef.current = true;
      postWicketInnRef.current = updInn;
      setSaving(false);
      setTimeout(() => {
        setPendingBowlerAfterWicket(true);
        setPendingWicket(true);
      }, 50);
      return;
    }

    await updateMatch(matchId, { [key]: updInn });
    postWicketInnRef.current = updInn;
    setPendingWicket(true);
    setSaving(false);
  };

  const applyBall = async (result: string) => {
  console.log('[APPLY BALL CALLED]', result, 'saving=', saving);
  if (!match || saving) return;
    if (typeof result !== "string") return;
    if (match.status === "completed") { setSaving(false); return; }
    const guardInn = match.currentInnings === 1 ? match.innings1 : match.innings2;
    if ((guardInn?.overs ?? 0) >= match.totalOvers || (guardInn?.wickets ?? 0) >= 10) {
      setSaving(false);
      return;
    }
    setSaving(true);
    try {
      const key = match.currentInnings === 1 ? "innings1" : "innings2";
      const inn = match[key];
      const battingRoster = match.currentInnings === 1 ? match.team1Players : match.team2Players;
      const bowlingRoster = match.currentInnings === 1 ? match.team2Players : match.team1Players;
      let upd = { ...processBall(inn, result) };
      upd = stampGlobalPlayerIds(upd, battingRoster, bowlingRoster);

      if (result !== "W") {
        const r = getStrikeRotationRuns(result);
        if (r % 2 !== 0) rot(upd);
      }

      if (!!freeHit && !result.startsWith("WD") && !result.startsWith("NB")) setFreeHit(false);

      const isWicket = result === "W";
      const overJustCompleted = upd.balls === 0 && upd.overs > inn.overs;
      const allOut = upd.wickets >= 10;
      const oversComplete = upd.overs >= match.totalOvers;
      let targetReached = false;
      let chaseWinner = "";
      if (match.currentInnings === 2 && !isWicket) {
        const tgt = (match.innings1?.runs ?? 0) + 1;
        if (upd.runs >= tgt) {
          targetReached = true;
          const wl = ((match.team2Players?.length ?? 11) - 1) - upd.wickets;
          chaseWinner = match.team2 + " won by " + wl + " wicket" + (wl !== 1 ? "s" : "");
        }
      }

      if (isWicket) {
        const dismissedSid = inn.strikerId;
        if (upd.batsmanStats?.[statKey(dismissedSid)]) {
          upd.batsmanStats[statKey(dismissedSid)] = { ...upd.batsmanStats[statKey(dismissedSid)], bowlerId: inn.currentBowlerId };
        }
        const bp = match.currentInnings === 1 ? match.team1Players : match.team2Players;
        const rem = bp.filter((p: any) => { const bs = upd.batsmanStats?.[statKey(p.id)]; return !bs?.isOut && p.id !== upd.nonStrikerId; });
        await finishWicketBall(key, upd, rem, overJustCompleted);
        return;
      }

      if (targetReached) {
        await updateMatch(matchId, { innings2: upd, status: "completed", winner: chaseWinner });
        if (match.tournamentId && match.tournamentMatchId) {
          await completeTournamentMatch(match.tournamentId, match.tournamentMatchId, {
            team1: match.team1, team2: match.team2, innings1: match.innings1, innings2: upd,
            winner: chaseWinner, matchId, totalOvers: match.totalOvers,
          });
        }
        // Trigger AI summary � non-blocking
        triggerAISummary({ ...match, innings2: upd, status: "completed", winner: chaseWinner });
        setSaving(false);
        navigation.replace("Scorecard", { matchId });
        return;
      }

      if (allOut || oversComplete) {
        await updateMatch(matchId, { [key]: upd });
        if (match.currentInnings === 2) {
          const runs1 = match.innings1?.runs ?? 0;
          let result2;
          if (upd.runs === runs1) result2 = "Match tied";
          else if (upd.runs < runs1) result2 = match.team1 + " won by " + (runs1 - upd.runs) + " run" + ((runs1 - upd.runs) !== 1 ? "s" : "");
          else result2 = match.team2 + " won";
          await updateMatch(matchId, { status: "completed", winner: result2 });
          if (match.tournamentId && match.tournamentMatchId) {
            await completeTournamentMatch(match.tournamentId, match.tournamentMatchId, {
              team1: match.team1, team2: match.team2, innings1: match.innings1, innings2: upd,
              winner: result2, matchId, totalOvers: match.totalOvers,
            });
          }
          // Trigger AI summary � non-blocking
          triggerAISummary({ ...match, innings2: upd, status: "completed", winner: result2 });
          setSaving(false);
          navigation.replace("Scorecard", { matchId });
          return;
        }
        setInningsData(upd);
        setShowInningsEnd(true);
        setSaving(false);
        return;
      }

      if (overJustCompleted) {
        rot(upd);
        await updateMatch(matchId, { [key]: upd });
        setSaving(false);
        setTimeout(() => setShowNewBowler(true), 50);
        return;
      }

      await updateMatch(matchId, { [key]: upd });
    } catch (e: any) { Alert.alert("Error", e?.message); }
    setSaving(false);
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

  const handleRunTap = (r: string) => {
    if (byeMode) { applyBall(byeMode + r); setByeMode(null); return; }
    applyBall(r);
  };

  const handleWicketSelect = (type: string) => {
    setWicketType(type); setShowWicket(false);
    if (type === "Run Out") { setShowRunOutPicker(true); return; }
    if (type === "Caught" || type === "Stumped") setShowFielder(true);
    else applyBall("W");
  };

  const handleRunOutWho = (who: "striker" | "nonStriker") => {
    setShowRunOutPicker(false);
    setRunOutWhoSelected(who);
    setShowRunOutFielder(true);
  };

  const handleRunOutFielderSelect = async (fielderName: string) => {
    if (!match || saving || !runOutWhoSelected) return;
    const who = runOutWhoSelected;
    setShowRunOutFielder(false);
    setRunOutWhoSelected(null);
    setSaving(true);
    try {
      const key = match.currentInnings === 1 ? "innings1" : "innings2";
      const inn = match[key];
      const dismissedId = who === "striker" ? inn.strikerId : inn.nonStrikerId;
      // The partner who was NOT run out � always the "other" batsman at the crease.
      // Recording this correctly (instead of always inn.nonStrikerId) is required so
      // the Best Partnerships feature and Undo replay can tell the two batsmen apart
      // when the NON-STRIKER is the one run out.
      const survivingPartnerId = who === "striker" ? inn.nonStrikerId : inn.strikerId;
      const dismissedGid = (match.currentInnings === 1 ? match.team1Players : match.team2Players)?.find((p: any) => p.id === dismissedId)?.globalPlayerId ?? null;
      const updBatStats = {
        ...inn.batsmanStats,
        [statKey(dismissedId)]: {
          ...(inn.batsmanStats?.[statKey(dismissedId)] ?? { playerId: dismissedId, runs: 0, balls: 0, fours: 0, sixes: 0 }),
          balls: (inn.batsmanStats?.[statKey(dismissedId)]?.balls ?? 0) + 1,
          isOut: true,
          dismissalType: "Run Out",
          fielderName: fielderName,
          globalPlayerId: dismissedGid,
        },
      };
      const bowlingRosterRO = match.currentInnings === 1 ? match.team2Players : match.team1Players;
      const updFieldStats = { ...(inn.fieldingStats ?? {}) };
      if (fielderName && fielderName !== "Skip") {
        const fKey = safeFieldKey(fielderName);
        const fielderGid = bowlingRosterRO?.find((p: any) => p.name === fielderName)?.globalPlayerId ?? null;
        updFieldStats[fKey] = {
          ...(updFieldStats[fKey] ?? { runOuts: 0, catches: 0, stumpings: 0 }),
          runOuts: (updFieldStats[fKey]?.runOuts ?? 0) + 1,
          globalPlayerId: fielderGid,
          displayName: fielderName,
        };
      }
      const updInn: any = {
        ...inn,
        wickets: (inn.wickets ?? 0) + 1,
        balls: (inn.balls ?? 0) + 1,
        batsmanStats: updBatStats,
        fieldingStats: updFieldStats,
        ballHistory: [...(inn.ballHistory ?? []), { result: "W(RO)", over: inn.overs, ball: inn.balls, batsmanId: dismissedId, nonStrikerIdBefore: survivingPartnerId, bowlerId: inn.currentBowlerId, fielderName }],
      };
      const overCompletedOnThisBall = updInn.balls >= 6;
      if (overCompletedOnThisBall) { updInn.balls = 0; updInn.overs = (updInn.overs ?? 0) + 1; }
      const batP = match.currentInnings === 1 ? match.team1Players : match.team2Players;
      const rem = batP.filter((p: any) => {
        const bs = updInn.batsmanStats?.[statKey(p.id)];
        return !bs?.isOut && p.id !== (who === "striker" ? updInn.nonStrikerId : updInn.strikerId);
      });
      await finishWicketBall(key, updInn, rem, overCompletedOnThisBall);
    } catch (e: any) { Alert.alert("Error", e?.message); setSaving(false); }
  };

  const handleCatchOrStumpFielder = async (fielderName: string) => {
    if (!match || saving) return;
    setShowFielder(false);
    setSaving(true);
    try {
      const key = match.currentInnings === 1 ? "innings1" : "innings2";
      const inn = match[key];
      const bowlingRoster = match.currentInnings === 1 ? match.team2Players : match.team1Players;
      const battingRoster = match.currentInnings === 1 ? match.team1Players : match.team2Players;
      let upd = { ...processBall(inn, "W") };
      upd = stampGlobalPlayerIds(upd, battingRoster, bowlingRoster);
      if (fielderName && fielderName !== "Skip") {
        const statKeyName = wicketType === "Stumped" ? "stumpings" : "catches";
        const fielderGid = bowlingRoster?.find((p: any) => p.name === fielderName)?.globalPlayerId ?? null;
        const fKey = safeFieldKey(fielderName);
        const updField = { ...(upd.fieldingStats ?? {}) };
        updField[fKey] = {
          ...(updField[fKey] ?? { catches: 0, runOuts: 0, stumpings: 0 }),
          [statKeyName]: (updField[fKey]?.[statKeyName] ?? 0) + 1,
          globalPlayerId: fielderGid,
          displayName: fielderName,
        };
        upd.fieldingStats = updField;
      }
      const dismissedId = inn.strikerId;
      if (upd.batsmanStats?.[statKey(dismissedId)]) {
        upd.batsmanStats[statKey(dismissedId)] = { ...upd.batsmanStats[statKey(dismissedId)], dismissalType: wicketType, fielderName, bowlerId: inn.currentBowlerId };
      }
      const overJustCompleted = upd.balls === 0 && upd.overs > inn.overs;
      const bp = match.currentInnings === 1 ? match.team1Players : match.team2Players;
      const rem = bp.filter((p: any) => { const bs = upd.batsmanStats?.[statKey(p.id)]; return !bs?.isOut && p.id !== upd.nonStrikerId; });
      await finishWicketBall(key, upd, rem, overJustCompleted);
    } catch (e: any) { Alert.alert("Error", e?.message); setSaving(false); }
  };

  const handlePTY = () => {
    const r = parseInt(ptyInput);
    if (!r || r < 1) { Alert.alert("Error", "Enter valid runs"); return; }
    setShowPTY(false); applyBall("PEN" + r);
  };

  const handleUndo = async () => {
    if (!match || saving) return;
    setSaving(true);
    // Reset the innings-transition gate so that if this undo takes us back
    // before the innings boundary, "Start 2nd Innings" will work again.
      openerSelectionDoneRef.current = false;
    try {
  const key = match.currentInnings === 1 ? "innings1" : "innings2";
    await updateMatch(matchId, { [key]: undoLastBall(match[key]) });
      } catch (e: any) { Alert.alert("Error", e?.message); }
    setSaving(false);
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
    await updateMatch(matchId, { status: "completed", winner: reason });
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
      const updInn2 = {
  ...match.innings2,

  strikerId: s1,
  nonStrikerId: s2,
  currentBowlerId: id,

  batsmanStats: {
    [statKey(s1)]: createEmptyBatsmanStats(s1),
    [statKey(s2)]: createEmptyBatsmanStats(s2),
  },

  bowlerStats: {
    [statKey(id)]: createEmptyBowlerStats(id),
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

  const selectNewBowler = async (id: number) => {
    if (!match) return;

    const key = match.currentInnings === 1 ? "innings1" : "innings2";

    setShowNewBowler(false);

    await updateMatch(matchId, {
      [key]: {
        ...match[key],
        currentBowlerId: id,
      },
    });
  };

  const selectNewBatsman = async (id: number) => {
    const key = match.currentInnings === 1 ? "innings1" : "innings2";
    const inn = match[key];
    const updInn = {
      ...inn,
      strikerId: id,
      ballHistory: [...(inn.ballHistory ?? []), { type: "NEW_BATSMAN", newBatsmanId: id }],
    };
    await updateMatch(matchId, { [key]: updInn });
    setPendingWicket(false);
    if (pendingBowlerAfterWicketRef.current) {
      pendingBowlerAfterWicketRef.current = false;
      setPendingBowlerAfterWicket(false);
      setShowNewBowler(true);
    }
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
  const ext = inn?.extras ?? { wides: 0, noBalls: 0, byes: 0, legByes: 0 };

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
        <Text style={s.extLine}>Extras {(ext.wides ?? 0) + (ext.noBalls ?? 0) + (ext.byes ?? 0) + (ext.legByes ?? 0)} (W:{ext.wides ?? 0} NB:{ext.noBalls ?? 0} B:{ext.byes ?? 0} LB:{ext.legByes ?? 0})</Text>
      </View>

      {!!matchCompleted && (
        <View style={s.completedBanner}>
          <Text style={s.completedBannerTxt}>Match Completed —  + {match.winner ?? "No result"}</Text>
          <TouchableOpacity onPress={() => navigation.replace("Scorecard", { matchId })}>
            <Text style={s.completedBannerBtn}>View Scorecard</Text>
          </TouchableOpacity>
        </View>
      )}

      {byeMode && (
        <View style={s.modeBanner}>
          <Text style={s.modeTxt}>{byeMode} — tap a run button</Text>
          <TouchableOpacity onPress={() => setByeMode(null)}><Text style={s.modeCancel}>Cancel</Text></TouchableOpacity>
        </View>
      )}

      {!!freeHit && (
        <View style={s.freeHitBanner}>
          <Text style={s.freeHitTxt}>FREE HIT</Text>
          <Text style={s.freeHitSub}>Batsman cannot be dismissed (except run out)</Text>
        </View>
      )}

      <View style={s.runsArea}>
        {["0","1","2","3","4","6"].map(r => (
          <Pressable key={r} style={[s.runBtn, r==="4"&&s.rb4, r==="6"&&s.rb6, !!byeMode&&s.rbBye]} onPress={() => handleRunTap(r)} disabled={!!(saving || matchCompleted)}>
            <Text style={[s.runBtnTxt, (r==="4"||r==="6")&&{color:"#000"}]}>{r}</Text>
          </Pressable>
        ))}
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
              return !bs?.isOut && p.id !== pwInn?.strikerId && p.id !== pwInn?.nonStrikerId;
            }).map((p: any) => (
              <TouchableOpacity key={p.id} style={s.pickerRow} onPress={() => selectNewBatsman(p.id)}>
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
              <TouchableOpacity style={[s.cancelBtn, {marginTop: 6}]} onPress={() => { setShowInningsEnd(false); setShowScorecardModal(true); }}>
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
              {["0","1","2","3","4","6"].map(r => (
                <TouchableOpacity key={r} style={{flex:1,height:56,backgroundColor:r==="4"?"#1a6fa8":r==="6"?"#c9a000":COLORS.card,borderRadius:RADIUS.md,justifyContent:"center",alignItems:"center",borderWidth:1,borderColor:COLORS.border}}
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
          <Text style={s.mTitle}>Wide — Select Runs</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 14 }}>1 wide run always added. Select extra runs scored.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 14 }}>
            {["0","1","2","3","4","5"].map(r => (
              <TouchableOpacity key={r} style={{ width: 64, height: 64, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.orange }}
                onPress={() => { setShowWDRuns(false); applyBall(r === "0" ? "WD" : "WD" + r); }}>
                <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "bold" }}>{r}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>= {parseInt(r)+1}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowWDRuns(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
        </View></View>
      </Modal>

      <Modal visible={showNBRuns} transparent animationType="slide">
        <View style={s.mOverlay}><View style={s.modal}>
          <Text style={s.mTitle}>No Ball — Select Runs</Text>
          <Text style={{ color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 14 }}>1 no ball run always added. Select bat/extra runs scored.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginBottom: 14 }}>
            {["0","1","2","3","4","5","6"].map(r => (
              <TouchableOpacity key={r} style={{ width: 60, height: 64, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.purple }}
                onPress={() => { setShowNBRuns(false); applyBall(r === "0" ? "NB" : "NB" + r); }}>
                <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: "bold" }}>{r}</Text>
                <Text style={{ color: COLORS.textMuted, fontSize: 10 }}>= {parseInt(r)+1}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setShowNBRuns(false)}><Text style={s.cancelTxt}>Cancel</Text></TouchableOpacity>
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
            route={{ params: { matchId } }}
            navigation={{
              goBack: () => setShowScorecardModal(false),
              navigate: () => {},
              replace: () => {},
              reset: () => {},
            }}
          />
        </View>
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