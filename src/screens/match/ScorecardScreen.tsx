import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Share, Alert, Modal } from "react-native";
import { subscribeToMatch, updateMatch, calculateManOfMatch, calculateManOfMatchCandidates, saveManOfMatch, generateMatchSummary } from "../../utils/firebase";
import { AdBanner, AdRewardedGate } from "../../components/AdPlaceholder";
import { getOversString, getRunRate, statKey } from "../../utils/cricketLogic";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";
import AdInterstitial from "../../components/AdInterstitial";

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
      return;
    }
    if (!matchId) { setLoading(false); return; }
    const unsub = subscribeToMatch(matchId, (data: any) => {
      setMatch(data);
      setLoading(false);
      if (data?.status === "completed" && !data?.manOfMatch && !momShownRef.current) {
        momShownRef.current = true;
        const candidates = calculateManOfMatchCandidates(data);
        if (candidates.length > 0) {
          setMomCandidates(candidates);
          setSelectedMOM(candidates[0]);
          setShowMOM(true);
        }
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

  const handleShare = async () => {
    if (!match) return;
    await Share.share({ message: buildFullScorecardText() });
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  if (!match) return <View style={s.center}><Text style={s.err}>Match not found</Text></View>;

  // ── #1 #2 #5 Batting table — statKey lookup + "Yet to Bat" rows ──────────
  const formatDismissal = (bs: any, bowlingPlayers: any[]) => {
    if (!bs.isOut) return "not out";
    const bowlerName = bowlingPlayers?.find((p: any) => p.id === bs.bowlerId)?.name;
    const fielder = bs.fielderName && bs.fielderName !== "Skip" ? bs.fielderName : null;
    switch (bs.dismissalType) {
      case "Caught": return (fielder ? "c " + fielder + " " : "c & ") + "b " + (bowlerName ?? "?");
      case "Bowled": return "b " + (bowlerName ?? "?");
      case "LBW": return "lbw b " + (bowlerName ?? "?");
      case "Hit Wicket": return "hit wkt b " + (bowlerName ?? "?");
      case "Run Out": return "Run Out" + (fielder ? " (" + fielder + ")" : "");
      case "Stumped": return "st " + (fielder ?? "?") + " b " + (bowlerName ?? "?");
      case "Retired": return "retired";
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
          <Text style={[s.cell, s.namecell, { color: COLORS.textSecondary, fontSize: 11 }]}>Batter</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>R</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>B</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>4s</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>6s</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>SR</Text>
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
              <Text style={[s.cell, s.num, bs.runs >= 50 && { color: COLORS.yellow, fontWeight: "bold" }]}>{bs.runs}</Text>
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

  // Only bowlers who actually bowled — iterate bowlerStats values, not the roster
  const BowlingTable = ({ players, stats }: any) => {
    const bowlerRows = Object.values(stats ?? {}) as any[];
    const hasBowled = bowlerRows.filter((bw: any) => bw && (
      (bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0 ||
      (bw.wides ?? 0) > 0 || (bw.noBalls ?? 0) > 0
    ));
    return (
      <>
        <Text style={s.sectionTitle}>BOWLING</Text>
        <View style={s.tableHeader}>
          <Text style={[s.cell, s.namecell, { color: COLORS.textSecondary, fontSize: 11 }]}>Bowler</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>O</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>R</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>W</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>Eco</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>WD</Text>
          <Text style={[s.cell, { color: COLORS.textSecondary, fontSize: 11 }]}>NB</Text>
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
              <Text style={[s.cell, s.num, { color: (bw.wickets ?? 0) > 0 ? COLORS.red : COLORS.text, fontWeight: (bw.wickets ?? 0) > 2 ? "bold" : "normal" }]}>{bw.wickets ?? 0}</Text>
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
      {isSelected && <Text style={{ color: COLORS.yellow, fontSize: 22 }}>✓</Text>}
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
              <Text style={s.aiSummaryIcon}>🤖</Text>
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
            <View style={[s.summaryBox, { borderColor: COLORS.blue }]}>
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
            <BowlingTable players={match.team2Players} stats={match.innings1?.bowlerStats} />
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
            <BowlingTable players={match.team1Players} stats={match.innings2?.bowlerStats} />
          </View>
        )}

        {/* Share Button */}
        <TouchableOpacity style={s.shareBtn} onPress={async () => {
          await handleShare();
          setShowShareInterstitial(true);
        }}>
          <Text style={s.shareBtnTxt}>Share Scorecard</Text>
        </TouchableOpacity>

        {/* Action Buttons */}
        {match.status === "live" && match.currentInnings === 1 && ((match.innings1?.wickets ?? 0) >= 10 || (match.innings1?.overs ?? 0) >= match.totalOvers) && (
  <TouchableOpacity style={[s.shareBtn, {backgroundColor: COLORS.primary, marginTop: 0}]}
      onPress={goBackSafe}>
     <Text style={s.shareBtnTxt}>Back to Scoring — Start 2nd Innings There</Text>
  </TouchableOpacity>
)}
{match.status === "live" && match.currentInnings === 1 && !((match.innings1?.wickets ?? 0) >= 10 || (match.innings1?.overs ?? 0) >= match.totalOvers) && (
  <TouchableOpacity style={[s.shareBtn, { backgroundColor: COLORS.red, marginTop: 0 }]}
    onPress={goBackSafe}>
    <Text style={s.shareBtnTxt}>Back to Scoring</Text>
  </TouchableOpacity>
)}
        {match.status === "live" && match.currentInnings === 2 && (
  <TouchableOpacity style={[s.shareBtn, { backgroundColor: COLORS.red, marginTop: 0 }]}
    onPress={goBackSafe}>
    <Text style={s.shareBtnTxt}>Continue Scoring</Text>
  </TouchableOpacity>
)}

        {/* MOM Banner */}
        {match.manOfMatch && (
          <View style={s.momBanner}>
            <Text style={s.momIcon}>🏆</Text>
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
                if (selectedMOM) await saveManOfMatch(matchId, selectedMOM);
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
            <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 16 }}>
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

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  err: { color: COLORS.text, fontSize: 16 },
  matchHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: SPACING.lg, paddingTop: SPACING.md, paddingBottom: 8 },
  teamsTitle: { flex: 1, color: COLORS.text, fontSize: 16, fontWeight: "bold", textAlign: "center" },
  vsBox: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.round, marginHorizontal: 8 },
  vsTxt: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "bold" },
  venue: { color: COLORS.textSecondary, fontSize: 12, textAlign: "center", marginBottom: 8 },
  resultBox: { backgroundColor: COLORS.primary + "22", marginHorizontal: SPACING.lg, padding: 12, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary, marginBottom: 8, alignItems: "center" },
  resultTxt: { color: COLORS.primary, fontSize: 16, fontWeight: "bold", textAlign: "center" },
  aiSummaryBox: { marginHorizontal: SPACING.lg, marginBottom: 10, backgroundColor: COLORS.card, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.blue + "55", padding: 14 },
  aiSummaryHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  aiSummaryIcon: { fontSize: 16 },
  aiSummaryLabel: { color: COLORS.blue, fontSize: 11, fontWeight: "bold", letterSpacing: 0.8 },
  aiSummaryText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20 },
  aiSummaryLoading: { flexDirection: "row", alignItems: "center" },
  aiSummaryLoadingTxt: { color: COLORS.textMuted, fontSize: 13 },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: SPACING.lg, marginBottom: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.round, backgroundColor: COLORS.card2 },
  statusLive: { backgroundColor: COLORS.red + "33", borderWidth: 1, borderColor: COLORS.red },
  statusDone: { backgroundColor: COLORS.primary + "33", borderWidth: 1, borderColor: COLORS.primary },
  statusPaused: { backgroundColor: COLORS.orange + "33", borderWidth: 1, borderColor: COLORS.orange },
  statusTxt: { color: COLORS.text, fontSize: 12, fontWeight: "bold" },
  matchIdTxt: { color: COLORS.textMuted, fontSize: 12 },
  scoreSummary: { flexDirection: "row", gap: 10, paddingHorizontal: SPACING.lg, marginBottom: 12 },
  summaryBox: { flex: 1, backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.primary, alignItems: "center" },
  summaryTeam: { color: COLORS.textSecondary, fontSize: 11, marginBottom: 4 },
  summaryScore: { color: COLORS.text, fontSize: 24, fontWeight: "bold" },
  summaryOvers: { color: COLORS.textSecondary, fontSize: 11 },
  summaryRR: { color: COLORS.primary, fontSize: 11, marginTop: 2 },
  innTabs: { flexDirection: "row", marginHorizontal: SPACING.lg, marginBottom: 10, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 3, gap: 3 },
  innTab: { flex: 1, padding: 8, borderRadius: RADIUS.sm, alignItems: "center" },
  innTabActive: { backgroundColor: COLORS.primary },
  innTabTxt: { color: COLORS.textSecondary, fontSize: 13, fontWeight: "bold" },
  innTabTxtActive: { color: "#fff" },
  card: { backgroundColor: COLORS.card, marginHorizontal: SPACING.lg, marginBottom: 10, borderRadius: RADIUS.md, padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border },
  sectionTitle: { color: COLORS.primary, fontSize: 11, fontWeight: "bold", marginTop: 12, marginBottom: 6, letterSpacing: 1 },
  tableHeader: { flexDirection: "row", backgroundColor: COLORS.card2, borderRadius: RADIUS.sm, padding: 8, marginBottom: 2 },
  tableRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border + "88" },
  cell: { flex: 1, textAlign: "center" },
  namecell: { flex: 2.5, textAlign: "left" },
  playerName: { color: COLORS.text, fontSize: 13, fontWeight: "bold" },
  dismissal: { color: COLORS.textSecondary, fontSize: 10 },
  num: { color: COLORS.textSecondary, fontSize: 13 },
  // #2 — yet to bat strip
  yetToBatBox: { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  yetToBatLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: "bold", letterSpacing: 0.8, marginBottom: 4 },
  yetToBatNames: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  extrasBox: { flexDirection: "row", justifyContent: "space-between", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.border },
  extrasTitle: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "bold" },
  extrasDetail: { color: COLORS.textSecondary, fontSize: 12, flex: 1, textAlign: "right" },
  momBanner: { backgroundColor: COLORS.yellow + "22", marginHorizontal: SPACING.lg, marginBottom: 10, padding: 14, borderRadius: RADIUS.md, borderWidth: 2, borderColor: COLORS.yellow, flexDirection: "row", gap: 12, alignItems: "flex-start" },
  momIcon: { fontSize: 32 },
  momLabel: { color: COLORS.yellow, fontSize: 10, fontWeight: "bold", letterSpacing: 1, marginBottom: 2 },
  momName: { color: COLORS.text, fontSize: 16, fontWeight: "bold", marginBottom: 4 },
  momStat: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  momOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  momModal: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  momModalTitle: { color: COLORS.yellow, fontSize: 22, fontWeight: "bold", textAlign: "center", marginBottom: 4 },
  momModalSub: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 16 },
  // #4 — candidate card (replaces single player card)
  momPlayerCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  momAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.card, justifyContent: "center", alignItems: "center" },
  momAvatarTxt: { color: COLORS.text, fontSize: 18, fontWeight: "bold" },
  momPlayerName: { color: COLORS.text, fontSize: 15, fontWeight: "bold" },
  momTeamName: { color: COLORS.textSecondary, fontSize: 12, marginTop: 1 },
  momStatInline: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
  momStatsBox: { backgroundColor: COLORS.background, borderRadius: RADIUS.md, padding: 12, marginBottom: 16, gap: 8 },
  momStatRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: COLORS.border + "66" },
  momStatLabel: { color: COLORS.textSecondary, fontSize: 13 },
  momStatVal: { color: COLORS.text, fontSize: 13, fontWeight: "bold", flex: 1, textAlign: "right" },
  momConfirmBtn: { backgroundColor: COLORS.yellow, padding: 15, borderRadius: RADIUS.md, alignItems: "center", marginBottom: 8 },
  momConfirmTxt: { color: "#000", fontSize: 15, fontWeight: "bold" },
  momSkipBtn: { backgroundColor: COLORS.card2, padding: 12, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  momSkipTxt: { color: COLORS.textSecondary, fontWeight: "bold" },
  shareBtn: { backgroundColor: COLORS.primary, margin: SPACING.lg, marginBottom: 8, padding: 14, borderRadius: RADIUS.md, alignItems: "center" },
  shareBtnTxt: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  aiGenerateBtn: { backgroundColor: COLORS.primary + "22", borderWidth: 1, borderColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: "center" },
  aiGenerateBtnTxt: { color: COLORS.primary, fontSize: 14, fontWeight: "bold" },
});