import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Share, Alert, Modal } from "react-native";
import { subscribeToMatch, updateMatch, calculateManOfMatch, calculateManOfMatchCandidates, saveManOfMatch, generateMatchSummary, canManageMatch, generateScorecardPdf } from "../../utils/firebase";
import { AdBanner, AdRewardedGate } from "../../components/AdPlaceholder";
import { getOversString, getRunRate, statKey } from "../../utils/cricketLogic";
import { COLORS, RADIUS, SPACING, SHADOW, TYPE } from "../../constants/theme";
import Header from "../../components/Header";
import AdInterstitial from "../../components/AdInterstitial";
import AppIcon from "../../components/AppIcon";

export default function ScorecardScreen({ route, navigation }: any) {
  const { matchId } = route.params ?? {};
  // NEW: accept live match data as a prop (used when embedded as a modal
  // inside ScoringScreen). If not provided, fall back to subscribing
  // ourselves (used when this is the actual routed "Scorecard" screen).
  const injectedMatch = route.params?.liveMatch ?? null;
  const [match, setMatch] = useState<any>(injectedMatch);
  const [loading, setLoading] = useState(!injectedMatch);
  const [activeTab, setActiveTab] = useState<"inn1"|"inn2">("inn1");
  const [showMOM, setShowMOM] = useState(false);
  const [momCandidates, setMomCandidates] = useState<any[]>([]);
  const [selectedMOM, setSelectedMOM] = useState<any>(null);
  const [canManage, setCanManage] = useState(false);
  const [showAIConfirm, setShowAIConfirm] = useState(false);
  const [showAIRewarded, setShowAIRewarded] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const momShownRef = React.useRef(false);
  const [showMatchCompleteInterstitial, setShowMatchCompleteInterstitial] = useState(false);
  const [showShareInterstitial, setShowShareInterstitial] = useState(false);
  const interstitialShownRef = React.useRef(false);
  useEffect(() => {
    // If match data is being injected via props, sync it directly —
    // no independent Firebase subscription, no unmount/resubscribe races.
    if (injectedMatch) {
      setMatch(injectedMatch);
      setLoading(false);
      // Embedded inside ScoringScreen, which only an authorized scorer can
      // reach in the first place.
      setCanManage(true);
      return;
    }
    if (!matchId) { setLoading(false); return; }
    const unsub = subscribeToMatch(matchId, (data: any) => {
      setMatch(data);
      setLoading(false);
      canManageMatch(data).then(setCanManage);
      if (data?.status === "completed" && !data?.manOfMatch && !momShownRef.current) {
        momShownRef.current = true;
        canManageMatch(data).then((allowed) => {
          if (!allowed) return;
          const candidates = calculateManOfMatchCandidates(data);
          if (candidates.length > 0) {
            setMomCandidates(candidates);
            setSelectedMOM(candidates[0]);
            setShowMOM(true);
          }
        });
      }
      // Interstitial fires once per screen visit, only for completed matches,
      // and only after the MOM flow has had a chance to show first (avoid
      // stacking two full-screen overlays).
      if (data?.status === "completed" && !interstitialShownRef.current) {
        interstitialShownRef.current = true;
        setTimeout(() => setShowMatchCompleteInterstitial(true), 800);
      }
    });
    return unsub;
  }, [matchId, injectedMatch]);

  // Safely go back whether this screen is a real routed screen (where
// canGoBack() tells us if there's a previous screen) or an embedded modal
// inside ScoringScreen (where canGoBack is undefined but goBack/reset are
// always safe to call). Never falls through to a no-op navigate().
const goBackSafe = () => {
  if (typeof navigation.canGoBack !== 'function' || navigation.canGoBack()) {
    navigation.goBack();
  } else {
    navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  }
};

  const buildFullScorecardText = () => {
    const lines: string[] = [];
    lines.push("🏏 " + match.team1 + " vs " + match.team2);
    if (match.venue) lines.push("📍 " + match.venue);
    lines.push("");

    const buildInningsText = (
      teamName: string, battingPlayers: any[], battingStats: any,
      bowlingPlayers: any[], bowlingStats: any, extras: any,
      runs: number, wickets: number, overs: number, balls: number
    ) => {
      const innLines: string[] = [];
      innLines.push("═══ " + teamName + " — " + runs + "/" + wickets + " (" + getOversString(overs, balls) + " ov) ═══");
      innLines.push("");
      innLines.push("BATTING");
      (battingPlayers ?? []).forEach((p: any) => {
        // fix: use statKey for lookup
        const bs = battingStats?.[statKey(p.id)];
        if (!bs || bs.balls === 0) { innLines.push(p.name + " — Yet to Bat"); return; }
        const sr = bs.balls > 0 ? ((bs.runs / bs.balls) * 100).toFixed(0) : "0";
        innLines.push(
          p.name + (p.isCaptain ? " (C)" : "") + (p.isWicketKeeper ? " (WK)" : "") +
          " — " + bs.runs + "(" + bs.balls + ")" +
          " 4s:" + (bs.fours ?? 0) + " 6s:" + (bs.sixes ?? 0) + " SR:" + sr +
          " — " + (bs.isOut ? (bs.dismissalType ?? "out") + (bs.fielderName && bs.fielderName !== "Skip" ? " (" + bs.fielderName + ")" : "") : "not out")
        );
      });
      if (extras) {
        const totalExtras = (extras.wides ?? 0) + (extras.noBalls ?? 0) + (extras.byes ?? 0) + (extras.legByes ?? 0) + (extras.penalty ?? 0);
        innLines.push("Extras: " + totalExtras + " (W:" + (extras.wides ?? 0) + " NB:" + (extras.noBalls ?? 0) + " B:" + (extras.byes ?? 0) + " LB:" + (extras.legByes ?? 0) + " PTY:" + (extras.penalty ?? 0) + ")");
      }
      innLines.push("");
      innLines.push("BOWLING");
      const bowlerEntries = Object.values(bowlingStats ?? {}) as any[];
      bowlerEntries.filter((bw: any) => bw && ((bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0 || (bw.wides ?? 0) > 0 || (bw.noBalls ?? 0) > 0)).forEach((bw: any) => {
        const name = (bowlingPlayers ?? []).find((p: any) => p.id === bw.playerId)?.name ?? ("Player " + ((bw.playerId ?? 0) + 1));
        const total = (bw.overs ?? 0) + (bw.balls ?? 0) / 6;
        const eco = total > 0 ? (bw.runs / total).toFixed(1) : "0.0";
        innLines.push(name + " — " + bw.overs + "." + bw.balls + " ov, " + bw.runs + " runs, " + (bw.wickets ?? 0) + " wkts, Eco " + eco + " (WD:" + (bw.wides ?? 0) + " NB:" + (bw.noBalls ?? 0) + ")");
      });
      return innLines.join("\n");
    };

    lines.push(buildInningsText(
      match.team1, match.team1Players, match.innings1?.batsmanStats,
      match.team2Players, match.innings1?.bowlerStats, match.innings1?.extras,
      match.innings1?.runs ?? 0, match.innings1?.wickets ?? 0,
      match.innings1?.overs ?? 0, match.innings1?.balls ?? 0
    ));

    if (match.innings2) {
      lines.push("");
      lines.push(buildInningsText(
        match.team2, match.team2Players, match.innings2?.batsmanStats,
        match.team1Players, match.innings2?.bowlerStats, match.innings2?.extras,
        match.innings2?.runs ?? 0, match.innings2?.wickets ?? 0,
        match.innings2?.overs ?? 0, match.innings2?.balls ?? 0
      ));
    }

    lines.push("");
    if (match.winner) lines.push("🏆 Result: " + match.winner);
    if (match.summaryText) lines.push("\n📝 Match Summary:\n" + match.summaryText);
    lines.push("Match ID: " + matchId);
    return lines.join("\n");
  };

  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleShare = async () => {
    if (!match) return;
    setGeneratingPdf(true);
    try {
      const url = await generateScorecardPdf(matchId, match);
      await Share.share({
        message: `Scorecard: ${match.team1} vs ${match.team2}\n${url}`,
        url, // iOS attaches the PDF itself when the target supports it; Android falls back to the link in `message`.
      });
    } catch (e: any) {
      console.error('PDF share failed, falling back to text:', e);
      Alert.alert('Could not generate PDF', 'Sharing the scorecard as text instead.');
      await Share.share({ message: buildFullScorecardText() });
    } finally {
      setGeneratingPdf(false);
    }
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!match) return <View style={s.center}><Text style={s.err}>Match not found</Text></View>;

  // ── #1 #2 #5 Batting table — statKey lookup + "Yet to Bat" rows ──────────
  const formatDismissal = (bs: any, bowlingPlayers: any[]) => {
    if (!bs.isOut) return "not out";
    const bowlerName = bowlingPlayers?.find((p: any) => p.id === bs.bowlerId)?.name;
    const fielder = bs.fielderName && bs.fielderName !== "Skip" ? bs.fielderName : null;
    switch (bs.dismissalType) {
      case "CAUGHT":
      case "CAUGHT_AND_BOWLED": return (fielder ? "c " + fielder + " " : "c & ") + "b " + (bowlerName ?? "?");
      case "BOWLED": return "b " + (bowlerName ?? "?");
      case "LBW": return "lbw b " + (bowlerName ?? "?");
      case "HIT_WICKET": return "hit wkt b " + (bowlerName ?? "?");
      case "RUN_OUT": return "Run Out" + (fielder ? " (" + fielder + ")" : "");
      case "STUMPED": return "st " + (fielder ?? "?") + " b " + (bowlerName ?? "?");
      case "RETIRED_OUT": return "retired";
      default: return bs.dismissalType ?? "out";
    }
  };

  const BattingTable = ({ players, stats, innExtras, currentInn, bowlingPlayers }: any) => {
    // Split into: batted (have a stats entry with balls > 0), currently batting
    // (strikerId/nonStrikerId but balls may be 0), and yet to bat
    const battedOrIn: any[] = [];
    const yetToBat: any[] = [];

    (players ?? []).forEach((p: any) => {
      const bs = stats?.[statKey(p.id)];
      if (bs && (bs.balls > 0 || bs.isOut)) {
        battedOrIn.push({ p, bs });
      } else if (
        currentInn &&
        (p.id === currentInn.strikerId || p.id === currentInn.nonStrikerId)
      ) {
        // Currently at the crease — show even if balls = 0
        battedOrIn.push({ p, bs: bs ?? { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false } });
      } else {
        yetToBat.push(p);
      }
    });

    return (
      <>
        <Text style={s.sectionTitle}>BATTING</Text>
        <View style={s.tableHeader}>
          <Text style={[s.cell, s.namecell, s.colHead]}>Batter</Text>
          <Text style={[s.cell, s.colHead]}>R</Text>
          <Text style={[s.cell, s.colHead]}>B</Text>
          <Text style={[s.cell, s.colHead]}>4s</Text>
          <Text style={[s.cell, s.colHead]}>6s</Text>
          <Text style={[s.cell, s.colHead]}>SR</Text>
        </View>

        {battedOrIn.map(({ p, bs }) => {
          const sr = bs.balls > 0 ? ((bs.runs / bs.balls) * 100).toFixed(0) : "0";
          return (
            <View key={p.id} style={s.tableRow}>
              <View style={[s.cell, s.namecell]}>
                <Text style={s.playerName}>{p.name}{p.isCaptain ? " (C)" : ""}{p.isWicketKeeper ? " (WK)" : ""}</Text>
                <Text style={s.dismissal}>
                  {formatDismissal(bs, bowlingPlayers)}
                </Text>
              </View>
              <Text style={[s.cell, s.num, s.runCell, bs.runs >= 50 && { color: COLORS.yellow, fontWeight: "bold" }]}>{bs.runs}</Text>
              <Text style={[s.cell, s.num]}>{bs.balls}</Text>
              <Text style={[s.cell, s.num]}>{bs.fours ?? 0}</Text>
              <Text style={[s.cell, s.num]}>{bs.sixes ?? 0}</Text>
              <Text style={[s.cell, s.num]}>{sr}</Text>
            </View>
          );
        })}

        {/* #2 — Yet to Bat section, only if there are players remaining */}
        {yetToBat.length > 0 && (
          <View style={s.yetToBatBox}>
            <Text style={s.yetToBatLabel}>Yet to Bat</Text>
            <Text style={s.yetToBatNames}>
              {yetToBat.map((p: any) => p.name + (p.isCaptain ? " (C)" : "") + (p.isWicketKeeper ? " (WK)" : "")).join("  •  ")}
            </Text>
          </View>
        )}

        {innExtras && (
          <View style={s.extrasBox}>
            <Text style={s.extrasTitle}>Extras</Text>
            <Text style={s.extrasDetail}>
              {(innExtras.wides ?? 0) + (innExtras.noBalls ?? 0) + (innExtras.byes ?? 0) + (innExtras.legByes ?? 0) + (innExtras.penalty ?? 0)}
              {"  "}(W:{innExtras.wides ?? 0}  NB:{innExtras.noBalls ?? 0}  B:{innExtras.byes ?? 0}  LB:{innExtras.legByes ?? 0}  PTY:{innExtras.penalty ?? 0})
            </Text>
          </View>
        )}
      </>
    );
  };

  // Only bowlers who actually bowled — iterate bowlerStats values, not the
  // roster, and rank by the innings' recorded bowling order (the order they
  // first bowled in), not by object key order — bowlerStats keys like "p3"
  // vs "p10" sort lexicographically once round-tripped through Firebase, not
  // by insertion order, so 10th-bowler-onward would jump ahead of others.
  // Matches scored before this field existed fall back to key order.
  const BowlingTable = ({ players, stats, order }: any) => {
    const statsMap = stats ?? {};
    const orderedIds: number[] = order?.length
      ? order
      : Object.values(statsMap).map((bw: any) => bw?.playerId);
    const bowlerRows = orderedIds
      .map((id) => statsMap[statKey(id)])
      .filter(Boolean) as any[];
    const hasBowled = bowlerRows.filter((bw: any) => bw && (
      (bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0 ||
      (bw.wides ?? 0) > 0 || (bw.noBalls ?? 0) > 0
    ));
    return (
      <>
        <Text style={s.sectionTitle}>BOWLING</Text>
        <View style={s.tableHeader}>
          <Text style={[s.cell, s.namecell, s.colHead]}>Bowler</Text>
          <Text style={[s.cell, s.colHead]}>O</Text>
          <Text style={[s.cell, s.colHead]}>R</Text>
          <Text style={[s.cell, s.colHead]}>W</Text>
          <Text style={[s.cell, s.colHead]}>Eco</Text>
          <Text style={[s.cell, s.colHead]}>WD</Text>
          <Text style={[s.cell, s.colHead]}>NB</Text>
        </View>
        {hasBowled.map((bw: any) => {
          const name = players?.find((p: any) => p.id === bw.playerId)?.name ?? ("Player " + ((bw.playerId ?? 0) + 1));
          const total = (bw.overs ?? 0) + (bw.balls ?? 0) / 6;
          const eco = total > 0 ? (bw.runs / total).toFixed(1) : "0.0";
          return (
            <View key={bw.playerId} style={s.tableRow}>
              <Text style={[s.cell, s.namecell, s.playerName]}>{name}</Text>
              <Text style={[s.cell, s.num]}>{bw.overs ?? 0}.{bw.balls ?? 0}</Text>
              <Text style={[s.cell, s.num]}>{bw.runs ?? 0}</Text>
              <Text style={[s.cell, s.num, s.runCell, { color: (bw.wickets ?? 0) > 0 ? COLORS.live : COLORS.textSecondary, fontWeight: (bw.wickets ?? 0) > 2 ? "800" : "700" }]}>{bw.wickets ?? 0}</Text>
              <Text style={[s.cell, s.num]}>{eco}</Text>
              <Text style={[s.cell, s.num]}>{bw.wides ?? 0}</Text>
              <Text style={[s.cell, s.num]}>{bw.noBalls ?? 0}</Text>
            </View>
          );
        })}
      </>
    );
  };

  const showInn2 = match.currentInnings === 2 || match.status === "completed";

  // MOM candidate card — reused in the picker list
  const MOMCard = ({ candidate, isSelected, onSelect }: any) => (
    <TouchableOpacity
      style={[s.momPlayerCard, isSelected && { borderColor: COLORS.yellow, borderWidth: 2 }]}
      onPress={() => onSelect(candidate)}
      activeOpacity={0.8}
    >
      <View style={[s.momAvatar, isSelected && { backgroundColor: COLORS.yellow }]}>
        <Text style={[s.momAvatarTxt, isSelected && { color: "#000" }]}>
          {(candidate.name ?? "P").charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.momPlayerName}>{candidate.name}</Text>
        <Text style={s.momTeamName}>{candidate.teamName}</Text>
        {candidate.battingLine !== "-" && (
          <Text style={s.momStatInline}>🏏 {candidate.battingLine}</Text>
        )}
        {candidate.bowlingLine !== "-" && (
          <Text style={s.momStatInline}>🎯 {candidate.bowlingLine}</Text>
        )}
        {candidate.fieldingLine !== "-" && (
          <Text style={s.momStatInline}>🧤 {candidate.fieldingLine}</Text>
        )}
      </View>
      {isSelected && <AppIcon emoji="✓" size={20} color={COLORS.yellow} />}
    </TouchableOpacity>
  );

  return (
    <>
      <ScrollView style={s.container} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* #3 — back goes to Home when match is completed, not screen-by-screen */}
        <Header
  title="Scorecard"
  onBack={() => {
    if (match?.status === "completed") {
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
    } else {
      goBackSafe();
    }
  }}
/>

        <View style={s.matchHeader}>
          <Text style={s.teamsTitle}>{match.team1}</Text>
          <View style={s.vsBox}><Text style={s.vsTxt}>VS</Text></View>
          <Text style={s.teamsTitle}>{match.team2}</Text>
        </View>

        {match.venue ? <Text style={s.venue}>Venue: {match.venue}</Text> : null}

        {/* Result Box */}
        {match.winner && (
          <View style={s.resultBox}>
            {(() => {
              const w = match.winner ?? "";
              const runs1 = match.innings1?.runs ?? 0;
              const runs2 = match.innings2?.runs ?? 0;
              const wkts2 = match.innings2?.wickets ?? 0;
              const overs2 = match.innings2?.overs ?? 0;
              const balls2 = match.innings2?.balls ?? 0;
              const totalBalls = (match.totalOvers ?? 20) * 6;
              const ballsUsed = overs2 * 6 + balls2;
              const ballsLeft = totalBalls - ballsUsed;
              const wicketsLeft = ((match.team2Players?.length ?? 11) - 1) - wkts2;
              // Prefer the engine's STRUCTURED result. Reading the fields
              // directly avoids re-deriving meaning from the sentence, which
              // mis-fired whenever one team name was a suffix of the other.
              const r = match.result;
              let resultLine = w;
              if (r?.resultType === "WIN_BY_WICKETS" && r.winnerTeam) {
                const left = r.ballsRemaining ?? ballsLeft;
                resultLine = r.winnerTeam + " won by " + r.margin + " wicket" + (r.margin !== 1 ? "s" : "") +
                  (left > 0 ? " (with " + left + " ball" + (left !== 1 ? "s" : "") + " remaining)" : "");
              } else if (r?.resultType === "WIN_BY_RUNS" && r.winnerTeam) {
                resultLine = r.winnerTeam + " won by " + r.margin + " run" + (r.margin !== 1 ? "s" : "");
              } else if (r?.resultType === "TIE_BROKEN_BY_SUPER_OVER" && r.winnerTeam) {
                resultLine = "Match tied — " + r.winnerTeam + " won the Super Over";
              } else if (r?.text) {
                resultLine = r.text;
              } else if (w.includes(match.team2 + " won") && match.innings2) {
                // Legacy match with no structured result stored.
                resultLine = match.team2 + " won by " + wicketsLeft + " wicket" + (wicketsLeft !== 1 ? "s" : "") +
                  (ballsLeft > 0 ? " (with " + ballsLeft + " ball" + (ballsLeft !== 1 ? "s" : "") + " remaining)" : "");
              } else if (w.includes(match.team1 + " won") && match.innings2) {
                const margin = runs1 - runs2;
                resultLine = match.team1 + " won by " + margin + " run" + (margin !== 1 ? "s" : "");
              }
              return <Text style={s.resultTxt}>{resultLine}</Text>;
            })()}
          </View>
        )}

        {/* AI Match Summary */}
        {match.status === "completed" && (
          <View style={s.aiSummaryBox}>
            <View style={s.aiSummaryHeader}>
              <AppIcon emoji="🤖" size={15} color={COLORS.info} style={s.aiSummaryIcon} />
              <Text style={s.aiSummaryLabel}>AI MATCH SUMMARY</Text>
            </View>
            {match.summaryText ? (
              <Text style={s.aiSummaryText}>{match.summaryText}</Text>
            ) : generatingAI ? (
              <View style={s.aiSummaryLoading}>
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginRight: 8 }} />
                <Text style={s.aiSummaryLoadingTxt}>Generating summary...</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.aiGenerateBtn} onPress={() => setShowAIConfirm(true)}>
                <Text style={s.aiGenerateBtnTxt}>✨ Generate AI Summary</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Status Badge */}
        <View style={s.statusRow}>
          <View style={[s.statusBadge,
            match.status === "live" && s.statusLive,
            match.status === "completed" && s.statusDone,
            match.status === "paused" && s.statusPaused]}>
            <Text style={s.statusTxt}>
              {match.status === "live" ? "Live" :
               match.status === "paused" ? "Paused" :
               match.status === "completed" ? "Completed" : match.status ?? "Unknown"}
            </Text>
          </View>
          <Text style={s.matchIdTxt}>ID: {matchId}</Text>
        </View>

        {/* Score Summary */}
        <View style={s.scoreSummary}>
          <View style={s.summaryBox}>
            <Text style={s.summaryTeam}>{match.team1}</Text>
            <Text style={s.summaryScore}>{match.innings1?.runs ?? 0}/{match.innings1?.wickets ?? 0}</Text>
            <Text style={s.summaryOvers}>({getOversString(match.innings1?.overs ?? 0, match.innings1?.balls ?? 0)} ov)</Text>
            <Text style={s.summaryRR}>RR: {getRunRate(match.innings1?.runs ?? 0, match.innings1?.overs ?? 0, match.innings1?.balls ?? 0)}</Text>
          </View>
          {showInn2 && (
            <View style={[s.summaryBox, s.summaryBoxAlt]}>
              <Text style={s.summaryTeam}>{match.team2}</Text>
              <Text style={s.summaryScore}>{match.innings2?.runs ?? 0}/{match.innings2?.wickets ?? 0}</Text>
              <Text style={s.summaryOvers}>({getOversString(match.innings2?.overs ?? 0, match.innings2?.balls ?? 0)} ov)</Text>
              <Text style={s.summaryRR}>Target: {(match.innings1?.runs ?? 0) + 1}</Text>
            </View>
          )}
        </View>

        {/* Innings Tabs */}
        {showInn2 && (
          <View style={s.innTabs}>
            <TouchableOpacity style={[s.innTab, activeTab === "inn1" && s.innTabActive]} onPress={() => setActiveTab("inn1")}>
              <Text style={[s.innTabTxt, activeTab === "inn1" && s.innTabTxtActive]}>{match.team1} (1st)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.innTab, activeTab === "inn2" && s.innTabActive]} onPress={() => setActiveTab("inn2")}>
              <Text style={[s.innTabTxt, activeTab === "inn2" && s.innTabTxtActive]}>{match.team2} (2nd)</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1st Innings */}
        {(!showInn2 || activeTab === "inn1") && (
          <View style={s.card}>
            <BattingTable
              players={match.team1Players}
              stats={match.innings1?.batsmanStats}
              innExtras={match.innings1?.extras}
              currentInn={match.currentInnings === 1 ? match.innings1 : null}
              bowlingPlayers={match.team2Players}
            />
            <BowlingTable players={match.team2Players} stats={match.innings1?.bowlerStats} order={match.innings1?.bowlingOrder} />
          </View>
        )}

        {/* 2nd Innings */}
        {showInn2 && activeTab === "inn2" && (
          <View style={s.card}>
            <BattingTable
              players={match.team2Players}
              stats={match.innings2?.batsmanStats}
              innExtras={match.innings2?.extras}
              currentInn={match.currentInnings === 2 ? match.innings2 : null}
              bowlingPlayers={match.team1Players}
            />
            <BowlingTable players={match.team1Players} stats={match.innings2?.bowlerStats} order={match.innings2?.bowlingOrder} />
          </View>
        )}

        {/* Share Button */}
        <TouchableOpacity style={[s.shareBtn, generatingPdf && { opacity: 0.6 }]} disabled={generatingPdf} onPress={async () => {
          await handleShare();
          setShowShareInterstitial(true);
        }}>
          {generatingPdf ? (
            <ActivityIndicator size="small" color={COLORS.text} />
          ) : (
            <Text style={s.shareBtnTxt}>Share Scorecard (PDF)</Text>
          )}
        </TouchableOpacity>

        {/* Action Buttons — scoring re-entry is for the assigned scorer/organizer only */}
        {canManage && match.status === "live" && match.currentInnings === 1 && ((match.innings1?.wickets ?? 0) >= 10 || (match.innings1?.overs ?? 0) >= match.totalOvers) && (
  <TouchableOpacity style={[s.shareBtn, {backgroundColor: COLORS.primary, marginTop: 0}]}
      onPress={goBackSafe}>
     <Text style={s.shareBtnTxt}>Back to Scoring — Start 2nd Innings There</Text>
  </TouchableOpacity>
)}
{canManage && match.status === "live" && match.currentInnings === 1 && !((match.innings1?.wickets ?? 0) >= 10 || (match.innings1?.overs ?? 0) >= match.totalOvers) && (
  <TouchableOpacity style={[s.shareBtn, { backgroundColor: COLORS.red, marginTop: 0 }]}
    onPress={goBackSafe}>
    <Text style={s.shareBtnTxt}>Back to Scoring</Text>
  </TouchableOpacity>
)}
        {canManage && match.status === "live" && match.currentInnings === 2 && (
  <TouchableOpacity style={[s.shareBtn, { backgroundColor: COLORS.red, marginTop: 0 }]}
    onPress={goBackSafe}>
    <Text style={s.shareBtnTxt}>Continue Scoring</Text>
  </TouchableOpacity>
)}

        {/* MOM Banner */}
        {match.manOfMatch && (
          <View style={s.momBanner}>
            <AppIcon emoji="🏆" size={28} color={COLORS.yellow} style={s.momIcon} />
            <View style={{ flex: 1 }}>
              <Text style={s.momLabel}>MAN OF THE MATCH</Text>
              <Text style={s.momName}>{match.manOfMatch.name} ({match.manOfMatch.teamName})</Text>
              {match.manOfMatch.battingLine !== "-" && <Text style={s.momStat}>Bat: {match.manOfMatch.battingLine}</Text>}
              {match.manOfMatch.bowlingLine !== "-" && <Text style={s.momStat}>Bowl: {match.manOfMatch.bowlingLine}</Text>}
              {match.manOfMatch.fieldingLine !== "-" && <Text style={s.momStat}>Field: {match.manOfMatch.fieldingLine}</Text>}
            </View>
          </View>
        )}

        {/* #3 — completed match: go home button at bottom */}
        {match.status === "completed" && (
          <TouchableOpacity
            style={[s.shareBtn, { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border, marginTop: 0 }]}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: "Home" }] })}
          >
            <Text style={[s.shareBtnTxt, { color: COLORS.text }]}>🏠 Back to Home</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* #4 — MOM modal now shows top 2 candidates, user taps to select */}
      <Modal visible={showMOM} transparent animationType="slide">
        <View style={s.momOverlay}>
          <View style={s.momModal}>
            <Text style={s.momModalTitle}>🏆 Man of the Match</Text>
            <Text style={s.momModalSub}>Select from top 2 performers</Text>

            {momCandidates.map((candidate, idx) => (
              <MOMCard
                key={idx}
                candidate={candidate}
                isSelected={selectedMOM?.name === candidate.name && selectedMOM?.teamName === candidate.teamName}
                onSelect={setSelectedMOM}
              />
            ))}

            <TouchableOpacity
              style={[s.momConfirmBtn, !selectedMOM && { opacity: 0.5 }]}
              disabled={!selectedMOM}
              onPress={async () => {
                setShowMOM(false);
                if (selectedMOM && canManage) await saveManOfMatch(matchId, selectedMOM);
              }}
            >
              <Text style={s.momConfirmTxt}>Confirm as Man of the Match</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.momSkipBtn} onPress={() => setShowMOM(false)}>
              <Text style={s.momSkipTxt}>Skip</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={showAIConfirm} transparent animationType="fade">
        <View style={s.momOverlay}>
          <View style={s.momModal}>
            <Text style={s.momModalTitle}>🤖 Generate AI Summary</Text>
            <Text style={s.momModalBody}>
              AI Generation uses premium resources. Please watch a short advertisement to continue.
            </Text>
            <AdBanner />
            <TouchableOpacity style={[s.momConfirmBtn, { marginTop: 16 }]} onPress={() => { setShowAIConfirm(false); setShowAIRewarded(true); }}>
              <Text style={s.momConfirmTxt}>Watch Ad & Continue</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.momSkipBtn} onPress={() => setShowAIConfirm(false)}>
              <Text style={s.momSkipTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <AdRewardedGate
        visible={showAIRewarded}
        onComplete={async () => {
          setShowAIRewarded(false);
          setGeneratingAI(true);
          try {
            await generateMatchSummary(matchId, match);
          } catch (e: any) {
            Alert.alert("Error", "Could not generate summary: " + (e?.message ?? "unknown error"));
          } finally {
            setGeneratingAI(false);
          }
        }}
        onSkip={() => {
          setShowAIRewarded(false);
          Alert.alert("Ad Skipped", "Please watch the complete advertisement to use AI Generation.");
        }}
      />

      <AdRewardedGate
        visible={showAIRewarded}
        onComplete={async () => {
          setShowAIRewarded(false);
          setGeneratingAI(true);
          try {
            await generateMatchSummary(matchId, match);
          } catch (e: any) {
            Alert.alert("Error", "Could not generate summary: " + (e?.message ?? "unknown error"));
          } finally {
            setGeneratingAI(false);
          }
        }}
        onSkip={() => {
          setShowAIRewarded(false);
          Alert.alert("Ad Skipped", "Please watch the complete advertisement to use AI Generation.");
        }}
      />
    <AdInterstitial visible={showMatchCompleteInterstitial} onDismiss={() => setShowMatchCompleteInterstitial(false)} />
      <AdInterstitial visible={showShareInterstitial} onDismiss={() => setShowShareInterstitial(false)} />
    </>
  );
}

// ── Styles ───────────────────────────────────────────────────
// Visual pass only. Every key that existed before is still here under the same
// name, because a missing key is a runtime crash the type-checker cannot see.
//
// The intent is a broadcast scorecard: one dominant score per innings in
// tabular figures, tables that read as tables (uppercase column labels,
// hairline row rules, the runs column carrying the most weight), and the
// dismissal line demoted to a caption so the name and the runs win the row.
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  err: { ...TYPE.title, color: COLORS.text },

  // ── Match identity ──
  matchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: SPACING.sm },
  teamsTitle: { flex: 1, ...TYPE.title, color: COLORS.text, textAlign: "center" },
  vsBox: { backgroundColor: COLORS.card2, paddingHorizontal: 11, paddingVertical: 4, borderRadius: RADIUS.round, marginHorizontal: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderSoft },
  vsTxt: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted },
  venue: { ...TYPE.caption, color: COLORS.textMuted, textAlign: "center", marginBottom: SPACING.sm },

  // ── Result ──
  // Celebratory but restrained: one tinted surface, a solid accent along the
  // top edge, and elevation, now with a soft violet glow to make the result
  // the clear high point of the screen. No second colour, no gradient.
  resultBox: { backgroundColor: COLORS.primarySoft, marginHorizontal: SPACING.lg, paddingVertical: 14, paddingHorizontal: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.primary + "3d", borderTopWidth: 2, borderTopColor: COLORS.primary, marginBottom: SPACING.sm, alignItems: "center", ...SHADOW.glow(COLORS.primary) },
  resultTxt: { ...TYPE.title, fontSize: 17, color: COLORS.primaryLight, textAlign: "center", lineHeight: 23 },

  // ── AI summary ──
  aiSummaryBox: { marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.card, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderSoft, borderLeftWidth: 3, borderLeftColor: COLORS.info, padding: SPACING.md, ...SHADOW.sm },
  aiSummaryHeader: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: SPACING.sm },
  aiSummaryIcon: { marginTop: 1 },
  aiSummaryLabel: { ...TYPE.label, color: COLORS.info },
  aiSummaryText: { ...TYPE.body, fontSize: 13, color: COLORS.textSecondary, lineHeight: 21 },
  aiSummaryLoading: { flexDirection: "row", alignItems: "center" },
  aiSummaryLoadingTxt: { ...TYPE.caption, fontSize: 13, color: COLORS.textMuted },

  // ── Status strip ──
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  statusBadge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border },
  // `live` rather than `red`, so an on-air badge never reads as an error.
  statusLive: { backgroundColor: COLORS.live + "1f", borderColor: COLORS.live + "88", ...SHADOW.glow(COLORS.live) },
  statusDone: { backgroundColor: COLORS.primarySoft, borderColor: COLORS.primary + "88" },
  statusPaused: { backgroundColor: COLORS.warning + "1f", borderColor: COLORS.warning + "88" },
  statusTxt: { ...TYPE.label, fontSize: 10, color: COLORS.text },
  matchIdTxt: { ...TYPE.numSm, fontSize: 11, color: COLORS.textMuted },

  // ── Innings headline scores ──
  scoreSummary: { flexDirection: "row", gap: SPACING.sm, paddingHorizontal: SPACING.lg, marginBottom: SPACING.md },
  summaryBox: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.lg, paddingVertical: 12, paddingHorizontal: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderSoft, borderTopWidth: 2, borderTopColor: COLORS.primary, alignItems: "center", ...SHADOW.md },
  /** Second innings — same card, different top accent, so the two innings are
   *  told apart at a glance without a second border colour shouting. */
  summaryBoxAlt: { borderTopColor: COLORS.info },
  summaryTeam: { ...TYPE.caption, fontSize: 11, fontWeight: "700", color: COLORS.textSecondary, marginBottom: 3, textAlign: "center" },
  summaryScore: { ...TYPE.displaySm, color: COLORS.text },
  summaryOvers: { ...TYPE.numSm, fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  summaryRR: { ...TYPE.numSm, fontSize: 11, color: COLORS.primaryLight, marginTop: 3 },

  // ── Innings tabs ──
  innTabs: { flexDirection: "row", marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 3, gap: 3, borderWidth: 1, borderColor: COLORS.borderSoft },
  innTab: { flex: 1, paddingVertical: 9, paddingHorizontal: 4, borderRadius: RADIUS.sm, alignItems: "center" },
  innTabActive: { backgroundColor: COLORS.primary, ...SHADOW.sm },
  // Not TYPE.label: this contains a team name, which must keep its own casing.
  innTabTxt: { ...TYPE.caption, fontSize: 13, fontWeight: "700", color: COLORS.textSecondary },
  innTabTxtActive: { color: COLORS.onPrimary },

  // ── Scorecard tables ──
  card: { backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingTop: 4, paddingBottom: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.md },
  sectionTitle: { ...TYPE.label, color: COLORS.primaryLight, marginTop: SPACING.md, marginBottom: SPACING.sm },
  tableHeader: { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 2 },
  colHead: { ...TYPE.colLabel, fontSize: 10, color: COLORS.textMuted },
  tableRow: { flexDirection: "row", alignItems: "center", paddingVertical: 9, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  cell: { flex: 1, textAlign: "center" },
  namecell: { flex: 2.5, textAlign: "left" },
  playerName: { ...TYPE.body, fontSize: 13, fontWeight: "700", color: COLORS.text },
  dismissal: { ...TYPE.caption, fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  num: { ...TYPE.numSm, fontSize: 13, color: COLORS.textSecondary },
  /** Runs (batting) and wickets (bowling): the figure each table exists for. */
  runCell: { ...TYPE.num, fontSize: 15, color: COLORS.text },

  // ── Yet to bat / extras: nested cards on the raised surface ──
  yetToBatBox: { marginTop: SPACING.md, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 11, borderWidth: 1, borderColor: COLORS.borderSoft },
  yetToBatLabel: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted, marginBottom: 4 },
  yetToBatNames: { ...TYPE.caption, color: COLORS.textSecondary, lineHeight: 18 },
  extrasBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm, marginTop: SPACING.sm, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: COLORS.borderSoft },
  extrasTitle: { ...TYPE.label, fontSize: 10, color: COLORS.textMuted },
  extrasDetail: { ...TYPE.numSm, color: COLORS.textSecondary, flex: 1, textAlign: "right" },

  // ── Player of the match ──
  momBanner: { backgroundColor: COLORS.yellow + "14", marginHorizontal: SPACING.lg, marginBottom: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.yellow + "55", borderLeftWidth: 3, borderLeftColor: COLORS.yellow, flexDirection: "row", gap: SPACING.md, alignItems: "center", ...SHADOW.glow(COLORS.yellow) },
  momIcon: { marginTop: 2 },
  momLabel: { ...TYPE.label, fontSize: 10, color: COLORS.yellow, marginBottom: 3 },
  momName: { ...TYPE.h2, fontSize: 17, color: COLORS.text, marginBottom: 5 },
  momStat: { ...TYPE.numSm, color: COLORS.textSecondary, lineHeight: 18 },
  momOverlay: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: "flex-end" },
  momModal: { backgroundColor: COLORS.surface3, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, borderTopWidth: 1, borderColor: COLORS.border, ...SHADOW.lg },
  momModalTitle: { ...TYPE.h1, color: COLORS.yellow, textAlign: "center", marginBottom: 4 },
  momModalSub: { ...TYPE.caption, fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginBottom: SPACING.md },
  momModalBody: { ...TYPE.caption, fontSize: 13, color: COLORS.textSecondary, textAlign: "center", marginBottom: SPACING.md, lineHeight: 19 },
  // #4 — candidate card (replaces single player card)
  momPlayerCard: { flexDirection: "row", alignItems: "center", gap: SPACING.md, backgroundColor: COLORS.card2, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.sm },
  momAvatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.card, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  momAvatarTxt: { ...TYPE.h2, color: COLORS.text },
  momPlayerName: { ...TYPE.title, fontSize: 15, color: COLORS.text },
  momTeamName: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 1 },
  momStatInline: { ...TYPE.numSm, fontSize: 11, color: COLORS.textMuted, marginTop: 3 },
  momStatsBox: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: 12, marginBottom: SPACING.md, gap: SPACING.sm },
  momStatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  momStatLabel: { ...TYPE.caption, fontSize: 13, color: COLORS.textSecondary },
  momStatVal: { ...TYPE.num, fontSize: 13, color: COLORS.text, flex: 1, textAlign: "right" },
  momConfirmBtn: { backgroundColor: COLORS.yellow, paddingVertical: 15, borderRadius: RADIUS.md, alignItems: "center", marginBottom: SPACING.sm, ...SHADOW.glow(COLORS.yellow) },
  momConfirmTxt: { ...TYPE.button, color: "#1a1200" },
  momSkipBtn: { backgroundColor: COLORS.card2, paddingVertical: 12, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  momSkipTxt: { ...TYPE.button, fontSize: 14, color: COLORS.textSecondary },

  // ── Buttons ──
  // Split `margin` into sides so the existing `marginTop: 0` overrides at the
  // call sites keep working exactly as before. Kept to a neutral elevation
  // (not a colour glow) because this style is reused with red and neutral
  // background overrides elsewhere — a baked-in violet glow would look
  // mismatched under those.
  shareBtn: { backgroundColor: COLORS.primary, marginHorizontal: SPACING.lg, marginTop: SPACING.lg, marginBottom: SPACING.sm, paddingVertical: 15, borderRadius: RADIUS.md, alignItems: "center", ...SHADOW.md },
  // Stays white: this style also sits on the red and neutral button variants.
  shareBtnTxt: { ...TYPE.button, color: "#fff" },
  aiGenerateBtn: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primary + "66", borderRadius: RADIUS.md, paddingVertical: 12, alignItems: "center" },
  aiGenerateBtnTxt: { ...TYPE.button, fontSize: 14, color: COLORS.primaryLight },
});