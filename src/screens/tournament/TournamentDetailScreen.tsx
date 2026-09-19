import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, Alert, Image } from "react-native";
import { subscribeToTournament, updateTournament, getMyTeams, getMatchById, createPool, deletePool, renamePool, assignTeamToPool, removeTeamFromPool, addPoolMatch, arePoolsComplete, autoGenerateKnockoutBracket, editKnockoutFixtureTeams, startKnockoutMatch, createCaptainInvite, approveCaptainSubmission, deleteTournament, setManualKnockoutFixture, setTeamLockMode, setTeamsLocked, getTeamRegistrationStatus, getTeamProgressLabel, assignScorerToMatch, canScoreThisMatch, isAssignedScorer, getCurrentUser, getPoolQualifiers, validateTournamentDates, getTournamentDisplayStatus } from "../../utils/firebase";
import { Tournament, TournamentTeam, Team } from "../../types/cricket";
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from "../../constants/theme";
import Header from "../../components/Header";
import AppIcon from "../../components/AppIcon";
import { AdBanner, AdRewardedGate } from "../../components/AdPlaceholder";
import AdInterstitial from "../../components/AdInterstitial";

const getTodayString = () => { const d = new Date(); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); };
const STAGE_ORDER_DISPLAY = ['Round of 16', 'Quarter Final', 'Semi Final', 'Third Place Match', 'Final'];
// Purely decorative: rotates a team's logo-chip through the multi-hue
// palette by its position in the tournament's teams list, so the roster
// reads as a set of distinct teams rather than one colour repeated. Never
// read from or written to any team data, so it cannot affect identity,
// order, or any team lookup elsewhere in the file.
const TEAM_ACCENTS = [COLORS.primary, COLORS.blue, COLORS.orange, COLORS.teal, COLORS.purple, COLORS.live];
export default function TournamentDetailScreen({ route, navigation }: any) {
  const { tournamentId, viewOnly } = route.params;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [tab, setTab] = useState("matches");
  const [myTeams, setMyTeams] = useState<Team[]>([]);
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [matchStep, setMatchStep] = useState(1);
  const [matchTeam1, setMatchTeam1] = useState("");
  const [matchTeam2, setMatchTeam2] = useState("");
  const [matchDate, setMatchDate] = useState(getTodayString());
  const [matchTime, setMatchTime] = useState("");
  const [matchVenue, setMatchVenue] = useState("");
  const [statsTab, setStatsTab] = useState<"batting"|"bowling"|"fielding">("batting");
  const [statsLoading, setStatsLoading] = useState(false);
  const [completedMatchesData, setCompletedMatchesData] = useState<any[]>([]);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showEditTournament, setShowEditTournament] = useState(false);
  const [editName, setEditName] = useState('');
  const [editOrg, setEditOrg] = useState('');
  const [editVenue, setEditVenue] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolQualify, setNewPoolQualify] = useState<1|2|4>(2);
  const [assignPoolId, setAssignPoolId] = useState<string|null>(null);
  const [poolMatchModal, setPoolMatchModal] = useState<{poolId: string} | null>(null);
  const [poolMatchTeam1, setPoolMatchTeam1] = useState("");
  const [poolMatchTeam2, setPoolMatchTeam2] = useState("");
  const [poolMatchDate, setPoolMatchDate] = useState(getTodayString());
  const [showBracketSetup, setShowBracketSetup] = useState(false);
  const [bracketStartStage, setBracketStartStage] = useState<'Quarter Final'|'Semi Final'|'Final'>('Quarter Final');
  const [includeThirdPlace, setIncludeThirdPlace] = useState(false);
  const [editingFixture, setEditingFixture] = useState<any>(null);
  const [editHomeTeam, setEditHomeTeam] = useState("");
  const [editAwayTeam, setEditAwayTeam] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteTeamName, setInviteTeamName] = useState("");
  const [generatedInviteCode, setGeneratedInviteCode] = useState<string|null>(null);
  const [renamingPool, setRenamingPool] = useState<{poolId: string, currentName: string} | null>(null);
  const [renamePoolValue, setRenamePoolValue] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeleteRewarded, setShowDeleteRewarded] = useState(false);
  const [deletingTournament, setDeletingTournament] = useState(false);
  const [showManualBracket, setShowManualBracket] = useState(false);
  const [manualStage, setManualStage] = useState<'Quarter Final'|'Semi Final'|'Final'|'Third Place Match'>('Quarter Final');
  const [manualHomeTeam, setManualHomeTeam] = useState("");
    const [manualAwayTeam, setManualAwayTeam] = useState("");
  const [manualMatchDate, setManualMatchDate] = useState(getTodayString());
  const [manualMatchTime, setManualMatchTime] = useState("");
  const [showStatsInterstitial, setShowStatsInterstitial] = useState(false);
  const statsInterstitialShownRef = React.useRef(false);

  useEffect(() => {
    const unsub = subscribeToTournament(tournamentId, setTournament);
    getMyTeams().then(setMyTeams);
    return unsub;
  }, [tournamentId]);

  // Whenever the tournament's completed matches change, fetch their full
  // match data (innings/batsmanStats/bowlerStats/fieldingStats) for stats aggregation.
  // Whenever the tournament's completed matches change, fetch their full
  // match data (innings/batsmanStats/bowlerStats/fieldingStats) for stats aggregation.
  // NEW: pulls completed matchIds from all three sources — the overall
  // tournament.matches list, every pool's matches, AND knockout fixtures —
  // so tournament-wide stats cover Pool + Knockout, not just League matches.
  useEffect(() => {
    const overallIds = (tournament?.matches ?? [])
      .filter((m: any) => m.status === "completed" && m.matchId)
      .map((m: any) => m.matchId);
    const poolIds = (tournament?.pools ?? [])
      .flatMap((p: any) => p.matches ?? [])
      .filter((m: any) => m.status === "completed" && m.matchId)
      .map((m: any) => m.matchId);
    const knockoutIds = (tournament?.knockoutFixtures ?? [])
      .filter((f: any) => f.status === "completed" && f.matchId)
      .map((f: any) => f.matchId);

    // De-dupe in case the same matchId somehow appears twice.
    const completedIds = Array.from(new Set([...overallIds, ...poolIds, ...knockoutIds]));

    if (completedIds.length === 0) { setCompletedMatchesData([]); return; }
    setStatsLoading(true);
    Promise.all(completedIds.map((id: string) => getMatchById(id)))
      .then((results: any[]) => setCompletedMatchesData(results.filter(Boolean)))
      .finally(() => setStatsLoading(false));
  }, [tournament?.matches, tournament?.pools, tournament?.knockoutFixtures]);

  useEffect(() => {
  const unsub = navigation.addListener('focus', () => {
    // Refresh tournament data when returning from MyTeams team-selection
    // (in case a team was just added there).
  });
  return unsub;
  }, [navigation]);

  const closeMatchModal = () => { setShowAddMatch(false); setMatchStep(1); setMatchTeam1(""); setMatchTeam2(""); setMatchDate(getTodayString()); setMatchTime(""); setMatchVenue(""); };

  const handleAddExistingTeam = async (team: Team) => {
    if (!tournament) return;
    if (tournament.teams?.some((t: any) => t.teamName === team.name)) { Alert.alert("Already Added", team.name + " is already in this tournament"); return; }


 // Save full team including players so match setup can use them
    const newTeam: TournamentTeam = {
      teamId: team.id,
      teamName: team.name,
      logo: team.logo ?? undefined,
      players: (team as any).players ?? [],
      played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0,
    };
    await updateTournament(tournamentId, { teams: [...(tournament.teams ?? []), newTeam] });
    setShowAddTeam(false);
    const playerCount = (team as any).players?.length ?? 0;
    Alert.alert("Added!", team.name + " added with " + playerCount + " players");
  };

  const handleAddNewTeam = async () => {
    if (!newTeamName.trim() || !tournament) return;
    const newTeam: TournamentTeam = { teamId: Date.now().toString(), teamName: newTeamName.trim(), played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0 };
    await updateTournament(tournamentId, { teams: [...(tournament.teams ?? []), newTeam] });
    setNewTeamName(""); setShowNewTeam(false);
  };

  const handleRemoveTeam = (teamId: string) => {
    if (!tournament) return;
    Alert.alert("Remove Team", "Remove from tournament?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: async () => { await updateTournament(tournamentId, { teams: tournament.teams.filter((t: any) => t.teamId !== teamId) }); } },
    ]);
  };

  const handleAddMatch = async () => {
    if (!matchTeam1 || !matchTeam2) { Alert.alert("Error", "Select both teams"); return; }
    if (matchTeam1 === matchTeam2) { Alert.alert("Error", "Teams must be different"); return; }
    if (!tournament) return;
    const newMatch = { id: Date.now().toString(), team1: matchTeam1, team2: matchTeam2, date: matchDate || "TBD", time: matchTime || "TBD", venue: matchVenue || tournament.venue || "TBD", status: "scheduled" };
    await updateTournament(tournamentId, { matches: [...(tournament.matches ?? []), newMatch] });
    closeMatchModal();
  };

  const handleNextStep = () => {
    if (!matchTeam1 || !matchTeam2) { Alert.alert("Error", "Select both teams"); return; }
    if (matchTeam1 === matchTeam2) { Alert.alert("Error", "Teams must be different"); return; }
    setMatchStep(2);
  };

  // Flips a scheduled fixture's status to "live" wherever it actually lives
  // (overall tournament.matches, a pool's matches, or knockoutFixtures) —
  // called once from handleStartMatch so a second tap on "Start" can never
  // spawn a duplicate live match (the Start button only renders while
  // status === "scheduled").
  const markScheduledFixtureLive = async (matchId: string) => {
    if (!tournament) return;
    if ((tournament.matches ?? []).some((m: any) => m.id === matchId)) {
      await updateTournament(tournamentId, {
        matches: (tournament.matches ?? []).map((m: any) => m.id === matchId ? { ...m, status: "live" } : m),
      });
      return;
    }
    const poolWithMatch = (tournament.pools ?? []).find((p: any) => (p.matches ?? []).some((m: any) => m.id === matchId));
    if (poolWithMatch) {
      await updateTournament(tournamentId, {
        pools: (tournament.pools ?? []).map((p: any) =>
          p.poolId === poolWithMatch.poolId
            ? { ...p, matches: (p.matches ?? []).map((m: any) => m.id === matchId ? { ...m, status: "live" } : m) }
            : p
        ),
      });
      return;
    }
    if ((tournament.knockoutFixtures ?? []).some((f: any) => f.id === matchId)) {
      await startKnockoutMatch(tournamentId, matchId);
    }
  };

  const handleStartMatch = async (match: any) => {
    if (!tournament) return;
    if (match.status === "completed" && match.matchId) { navigation.navigate("Scorecard", { matchId: match.matchId }); return; }
    if (match.status === "live" && match.matchId) { navigation.navigate("Scoring", { matchId: match.matchId }); return; }

    if (match.status !== "live") await markScheduledFixtureLive(match.id);

    // First check tournament teams (which have players saved)
    const tournTeam1 = (tournament.teams ?? []).find((t: any) => t.teamName === match.team1);
    const tournTeam2 = (tournament.teams ?? []).find((t: any) => t.teamName === match.team2);
    const t1Players = tournTeam1?.players ?? myTeams.find((t: any) => t.name === match.team1)?.players ?? [];
    const t2Players = tournTeam2?.players ?? myTeams.find((t: any) => t.name === match.team2)?.players ?? [];

    if (t1Players.length === 0 && t2Players.length === 0) {
      Alert.alert("No Players Found", "Add players to teams before starting match.", [
        { text: "Go to Teams", onPress: () => navigation.navigate("MyTeams") },
        { text: "Continue Anyway", onPress: () => startMatchFlow(match, [], []) },
      ]);
      return;
    }
    startMatchFlow(match, t1Players, t2Players);
  };

  const handleRemoveScheduledMatch = (matchIdToRemove: string) => {
  Alert.alert("Remove Match", "Remove this scheduled match? This cannot be undone.", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Remove",
      style: "destructive",
      onPress: async () => {
        await updateTournament(tournamentId, {
          matches: (tournament?.matches ?? []).filter((m: any) => m.id !== matchIdToRemove),
        });
      },
    },
  ]);
};

  const [assignScorerMatchId, setAssignScorerMatchId] = useState<string | null>(null);
  const [assignScorerPhone, setAssignScorerPhone] = useState('');

  const startMatchFlow = (match: any, team1Players: any[], team2Players: any[]) => {
    const overs = tournament?.format?.replace(" Overs", "") ?? "20";
    navigation.navigate("PlayerSetup", { team1: match.team1, team2: match.team2, overs, venue: match.venue !== "TBD" ? match.venue : tournament?.venue ?? "", ballType: tournament?.ballType, team1Players, team2Players, tournamentId, tournamentMatchId: match.id });
  };

  if (!tournament) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

    // Admin permission is ONLY the tournament creator — per spec, an
  // assigned scorer must never automatically receive Edit/Delete/Settings/
  // Fixture-admin access. Scoring permission is checked separately via
  // canScoreThisMatch, wherever a match is actually opened for scoring.
  const canManage = tournament.createdBy === getCurrentUser()?.uid;

  const TABS = [
    { key: "matches", label: "Matches" },
    { key: "teams", label: "Teams" },
    ...(tournament.tournamentFormat === "Pool + Knockout" ? [{ key: "pools", label: "Pools" }] : []),
    ...(tournament.tournamentFormat !== "League" ? [{ key: "bracket", label: "Bracket" }] : []),
    { key: "points", label: tournament.tournamentFormat === "Pool + Knockout" ? "Overall" : "Points" },
    { key: "stats", label: "Stats" },
  ];

  // ── Tournament-wide stat aggregation across ALL completed matches, ALL teams ──
  // CRITICAL: player ids are LOCAL to each team (0-10), not globally unique —
  // team1's player id 3 and team2's player id 3 are different people. Looking
  // them up in a merged roster causes wrong-name/wrong-stat collisions. The
  // fix is to always resolve batting/bowling stats against the roster of the
  // team that was ACTUALLY batting/bowling in that specific innings:
  //   innings1: team1Players batted, team2Players bowled
  //   innings2: team2Players batted, team1Players bowled
  // (team1/team2 here are already toss-adjusted by BattingSetupScreen, so
  // team1 always = the side that batted first, regardless of original names.)
  const tournBatMap: any = {};
  const tournBolMap: any = {};
  const tournFieldMap: any = {};
  completedMatchesData.forEach((m: any) => {
    // match.team1 / match.team2 are the (toss-adjusted) team NAME strings —
    // team1 = whichever side batted first. Used here purely for display
    // ("Player (TeamName)"), independent of the id-collision fix above.
    const inningsList = [
      { inn: m.innings1, battingRoster: m.team1Players ?? [], bowlingRoster: m.team2Players ?? [], battingTeamName: m.team1, bowlingTeamName: m.team2 },
      { inn: m.innings2, battingRoster: m.team2Players ?? [], bowlingRoster: m.team1Players ?? [], battingTeamName: m.team2, bowlingTeamName: m.team1 },
    ];
    inningsList.forEach(({ inn, battingRoster, bowlingRoster, battingTeamName, bowlingTeamName }) => {
      if (!inn) return;
      Object.values(inn.batsmanStats ?? {}).forEach((bs: any) => {
        if (!bs) return;
        const gid = bs.globalPlayerId;
        const key = gid ?? ("local:" + bs.playerId + ":" + battingTeamName);
        const pName = gid
          ? [...battingRoster, ...bowlingRoster].find((p: any) => p.globalPlayerId === gid)?.name ?? "Player"
          : battingRoster.find((p: any) => p.id === bs.playerId)?.name ?? "Player";
        if (!tournBatMap[key]) tournBatMap[key] = { runs: 0, balls: 0, fours: 0, sixes: 0, outs: 0, innings: 0, scores: [], name: pName, teamName: battingTeamName };
        tournBatMap[key].runs += bs.runs ?? 0;
        tournBatMap[key].balls += bs.balls ?? 0;
        tournBatMap[key].fours += bs.fours ?? 0;
        tournBatMap[key].sixes += bs.sixes ?? 0;
        if ((bs.balls ?? 0) > 0) { tournBatMap[key].innings += 1; tournBatMap[key].scores.push(bs.runs ?? 0); }
        if (bs.isOut) tournBatMap[key].outs += 1;
        tournBatMap[key].name = pName;
        tournBatMap[key].teamName = battingTeamName;
      });
      Object.values(inn.bowlerStats ?? {}).forEach((bw: any) => {
        if (!bw) return;
        const gid = bw.globalPlayerId;
        const key = gid ?? ("local:" + bw.playerId + ":" + bowlingTeamName);
        const pName = gid
          ? [...battingRoster, ...bowlingRoster].find((p: any) => p.globalPlayerId === gid)?.name ?? "Player"
          : bowlingRoster.find((p: any) => p.id === bw.playerId)?.name ?? "Player";
        if (!tournBolMap[key]) tournBolMap[key] = { overs: 0, balls: 0, runs: 0, wickets: 0, innings: 0, figures: [], name: pName, teamName: bowlingTeamName };
        tournBolMap[key].overs += bw.overs ?? 0;
        tournBolMap[key].balls += bw.balls ?? 0;
        tournBolMap[key].runs += bw.runs ?? 0;
        tournBolMap[key].wickets += bw.wickets ?? 0;
        if ((bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0) {
          tournBolMap[key].innings += 1;
          tournBolMap[key].figures.push({ w: bw.wickets ?? 0, r: bw.runs ?? 0 });
        }
        tournBolMap[key].name = pName;
        tournBolMap[key].teamName = bowlingTeamName;
      });
      // Fielding stats are keyed by FIELDER NAME (set at scoring time from the
      // bowling-side roster), so they don't have the local-id collision problem —
      // names are unique within a match's bowling roster. Still prefer
      // globalPlayerId for cross-match aggregation when available.
      Object.entries(inn.fieldingStats ?? {}).forEach(([name, fs]: any) => {
        const gid = (fs as any)?.globalPlayerId;
        const key = gid ?? ("name:" + name + ":" + bowlingTeamName);
        if (!tournFieldMap[key]) tournFieldMap[key] = { catches: 0, runOuts: 0, stumpings: 0, name, teamName: bowlingTeamName };
        tournFieldMap[key].catches += (fs as any)?.catches ?? 0;
        tournFieldMap[key].runOuts += (fs as any)?.runOuts ?? 0;
        tournFieldMap[key].stumpings += (fs as any)?.stumpings ?? 0;
        tournFieldMap[key].teamName = bowlingTeamName;
      });
    });
  });

  return (
    <View style={styles.container}>
      <Header
  title={tournament.name}
  onBack={() => { setShowStatsInterstitial(false); navigation.goBack(); }}
  rightText="Info"
  onRight={() => setShowInfoModal(true)}
/>
{canManage && (
  // A normal flow row below the header instead of buttons absolutely
  // positioned over it — those used to sit in the exact same band as the
  // (centered, full-width) title text and clipped it on longer tournament
  // names.
  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 16, paddingHorizontal: SPACING.md, paddingTop: 4 }}>
    <TouchableOpacity
      onPress={() => {
        setShowInviteModal(false);
        setShowPoolModal(false);
        setPoolMatchModal(null);
        setShowBracketSetup(false);
        setEditingFixture(null);
        setShowDeleteConfirm(false);
        setShowInfoModal(false);
        setRenamingPool(null);

        setEditName(tournament.name ?? '');
        setEditOrg(tournament.organisationName ?? '');
        setEditVenue(tournament.venue ?? '');
        setEditStartDate(tournament.startDate ?? '');
        setEditEndDate(tournament.endDate ?? '');
        setShowEditTournament(true);
      }}
      style={{ padding: 8 }}
    >
      <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: 'bold' }}>Edit</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => setShowDeleteConfirm(true)} style={{ padding: 8 }}>
      <Text style={{ color: COLORS.red, fontSize: 12, fontWeight: 'bold' }}>Delete</Text>
    </TouchableOpacity>
  </View>
)}
      {tournament.bannerUrl ? (
        <Image source={{ uri: tournament.bannerUrl }} style={styles.banner} resizeMode="cover" />
      ) : null}
      <View style={styles.infoBar}>
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <AppIcon emoji="🏢" size={12} color={COLORS.textSecondary} />
    <Text style={styles.infoText}>{tournament.organisationName}</Text>
  </View>
  {tournament.venue ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AppIcon emoji="📍" size={12} color={COLORS.textSecondary} />
      <Text style={styles.infoText}>{tournament.venue}</Text>
    </View>
  ) : null}
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <AppIcon emoji={tournament.ballType === "Leather Ball" ? "🔴" : tournament.ballType === "Turf" ? "🏟️" : "🎾"} size={12} color={COLORS.textSecondary} />
    <Text style={styles.infoText}>{tournament.format}</Text>
  </View>
</View>
      <View style={styles.tabs}>
        {TABS.map((t: any) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {tab === "matches" && (
          <View style={styles.tabContent}>
            {canManage && (
              <TouchableOpacity style={styles.addMatchBtn} onPress={() => { if ((tournament.teams ?? []).length < 2) { Alert.alert("Add Teams First", "Add at least 2 teams before scheduling matches"); setTab("teams"); return; } setShowAddMatch(true); }}>
                <Text style={styles.addMatchBtnText}>Schedule New Match</Text>
              </TouchableOpacity>
            )}
            {(tournament.matches ?? []).length === 0 ? (
              <View style={styles.empty}><AppIcon emoji="📅" size={48} color={COLORS.textMuted} /><Text style={styles.emptyText}>No matches scheduled</Text><Text style={styles.emptyHint}>Add teams first, then schedule matches</Text></View>
            ) : (
              (tournament.matches ?? []).map((match: any, i: number) => (
                <View key={i} style={[styles.matchCard, match.status === "live" && styles.matchCardLive, match.status === "completed" && styles.matchCardDone]}>
                  <View pointerEvents="none" style={styles.cardEdge} />
                  <Text style={styles.matchNumber}>Match {i + 1}</Text>
                  <Text style={styles.matchTeams}>{match.team1} vs {match.team2}</Text>
                  <View style={styles.matchMeta}>
  {match.date !== "TBD" && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AppIcon emoji="📅" size={11} color={COLORS.textSecondary} />
      <Text style={styles.matchMetaText}>{match.date}</Text>
    </View>
  )}
  {match.time !== "TBD" && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AppIcon emoji="⏰" size={11} color={COLORS.textSecondary} />
      <Text style={styles.matchMetaText}>{match.time}</Text>
    </View>
  )}
  {match.venue !== "TBD" && (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <AppIcon emoji="📍" size={11} color={COLORS.textSecondary} />
      <Text style={styles.matchMetaText}>{match.venue}</Text>
    </View>
  )}
</View>
                  <View style={styles.matchFooter}>
                    <View style={[styles.statusBadge, match.status === "live" && styles.statusLive, match.status === "completed" && styles.statusDone]}>
                      <Text style={styles.statusText}>{match.status === "completed" ? "Done" : match.status === "live" ? "Live" : "Scheduled"}</Text>
                    </View>
                    {match.status === "scheduled" && canScoreThisMatch(tournament, match) && <TouchableOpacity style={styles.startBtn} onPress={() => handleStartMatch(match)}><Text style={styles.startBtnText}>Start Match</Text></TouchableOpacity>}
                    {match.status === "scheduled" && canManage && (
                      <TouchableOpacity onPress={() => handleRemoveScheduledMatch(match.id)} style={{ marginLeft: 8, justifyContent: "center" }}>
                        <Text style={{ color: COLORS.red, fontSize: 12, fontWeight: "bold" }}>Remove</Text>
                      </TouchableOpacity>
                    )}
                    {match.status === "scheduled" && canManage && (
                      <TouchableOpacity
                        onPress={() => { setAssignScorerPhone(match.assignedScorerPhone ?? ''); setAssignScorerMatchId(match.id); }}
                        style={{ marginLeft: 8, justifyContent: "center" }}
                      >
                        <Text style={{ color: COLORS.blue, fontSize: 12, fontWeight: "bold" }}>
                          {match.assignedScorerPhone ? `Scorer: ${match.assignedScorerPhone}` : 'Assign Scorer'}
                        </Text>
                      </TouchableOpacity>
                    )}
                                        {match.status === "live" && canScoreThisMatch(tournament, match) && <TouchableOpacity style={[styles.startBtn, styles.continueBtn]} onPress={() => handleStartMatch(match)}><Text style={styles.startBtnText}>Continue</Text></TouchableOpacity>}
                    {match.status === "completed" && match.matchId && <TouchableOpacity style={[styles.startBtn, styles.viewBtn]} onPress={() => navigation.navigate("Scorecard", { matchId: match.matchId })}><Text style={styles.startBtnText}>Scorecard</Text></TouchableOpacity>}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        {tab === "teams" && (
  <View style={styles.tabContent}>
    {canManage && (
    <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border }}>
      <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>Team Lock</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        {[
          { key: 'manual', label: 'Manual' },
          { key: 'onStart', label: 'On Tournament Start' },
          { key: 'afterLeague', label: 'After League/Pool Stage' },
          { key: 'beforeKnockout', label: 'Before Knockout' },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.teamChip, tournament.teamLockMode === opt.key && styles.teamChipActive]}
            onPress={() => setTeamLockMode(tournamentId, opt.key)}
          >
            <Text style={[styles.teamChipText, tournament.teamLockMode === opt.key && styles.teamChipTextActive]}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {tournament.teamLockMode === 'manual' && (
        <TouchableOpacity
          style={[styles.startBtn, tournament.teamsLocked && { backgroundColor: COLORS.red }]}
          onPress={() => setTeamsLocked(tournamentId, !tournament.teamsLocked)}
        >
          <Text style={styles.startBtnText}>{tournament.teamsLocked ? '🔒 Locked — Tap to Unlock' : '🔓 Unlocked — Tap to Lock'}</Text>
        </TouchableOpacity>
      )}
    </View>
    )}
    {canManage && (
  <View style={styles.addTeamRow}>
      <TouchableOpacity
        style={[styles.addTeamBtn, {flex: 1}]}
        onPress={() => navigation.navigate('MyTeams', { selectMode: true, tournamentId })}
        >
      <Text style={styles.addTeamBtnText}>Add Team from My Teams</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.addTeamBtn, {flex: 1, backgroundColor: COLORS.blue}]}
        onPress={() => {
  setShowEditTournament(false);
  setShowPoolModal(false);
  setPoolMatchModal(null);
  setShowBracketSetup(false);
  setEditingFixture(null);
  setShowDeleteConfirm(false);
  setShowInfoModal(false);
  setRenamingPool(null);

  setInviteTeamName("");
  setGeneratedInviteCode(null);
  setShowInviteModal(true);
}}
        >
      <Text style={styles.addTeamBtnText}>Invite Team Captain</Text>
      </TouchableOpacity>
  </View>
  )}
            
            {(tournament.teams ?? []).length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyIcon}></Text><Text style={styles.emptyText}>No teams added yet</Text><Text style={styles.emptyHint}>Add teams to start the tournament</Text></View>
            ) : (
              (tournament.teams ?? []).map((team: any, i: number) => {
  const invite = (tournament.captainInvites ?? []).find((inv: any) => inv.teamId === team.teamId);
  return (
    <View key={i} style={styles.teamCard}>
      <View pointerEvents="none" style={styles.cardEdge} />
      <View style={[styles.teamLogoBox, { backgroundColor: TEAM_ACCENTS[i % TEAM_ACCENTS.length] + '22', borderColor: TEAM_ACCENTS[i % TEAM_ACCENTS.length] + '55' }]}>
        <Text style={[styles.teamLogoText, { color: TEAM_ACCENTS[i % TEAM_ACCENTS.length] }]}>{team.teamName.charAt(0).toUpperCase()}</Text>
      </View>
      {/* Tapping a team opens its squad, read-only, for ANYONE viewing the
          tournament — not just the organiser. The roster is passed straight
          from the tournament record we already have, so TeamPlayersScreen
          needs no permission of its own. Some teams (added before rosters
          were saved, or via a captain invite) carry no players array; that
          screen shows an empty state rather than failing. */}
      <TouchableOpacity
        style={styles.teamInfo}
        onPress={() => navigation.navigate('TeamPlayers', { teamName: team.teamName, players: team.players ?? [] })}
      >
        <Text style={styles.teamName}>{team.teamName}</Text>
        <Text style={styles.teamStats}>P:{team.played} W:{team.won} L:{team.lost} Pts:{team.points}</Text>
        {invite && (
          <Text style={{ color: invite.status === 'pending' ? COLORS.orange : invite.status === 'submitted' ? COLORS.blue : COLORS.primary, fontSize: 11, fontWeight: 'bold', marginTop: 2 }}>
            {invite.status === 'pending' ? `Invite pending — Code: ${invite.inviteCode}` : invite.status === 'submitted' ? `Squad submitted (${team.players?.length ?? 0} players) — tap to approve` : 'Approved'}
          </Text>
        )}
        <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 2 }}>
          {getTeamProgressLabel(team)} · Status: {getTeamRegistrationStatus(tournament, team)}
        </Text>
      </TouchableOpacity>
      {canManage && invite && invite.status === 'submitted' && (
        <TouchableOpacity onPress={() => approveCaptainSubmission(tournamentId, team.teamId)} style={{ marginRight: 8 }}>
          <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: 'bold' }}>Approve</Text>
        </TouchableOpacity>
      )}
      {canManage && (
        <TouchableOpacity onPress={() => handleRemoveTeam(team.teamId)}><Text style={styles.removeText}>X</Text></TouchableOpacity>
      )}
    </View>
  );
})
            )}
          </View>
        )}

        {tab === "pools" && (
  <View style={styles.tabContent}>
    {canManage && (
      <TouchableOpacity style={styles.addMatchBtn} onPress={() => { setNewPoolName(""); setNewPoolQualify(2); setShowPoolModal(true); }}>
        <Text style={styles.addMatchBtnText}>Create Pool</Text>
      </TouchableOpacity>
    )}

    {(tournament.pools ?? []).length === 0 ? (
      <View style={styles.empty}>
        <AppIcon emoji="🏊" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>No pools created yet</Text>
        <Text style={styles.emptyHint}>Create pools (e.g. "Pool A", "Virat Pool") then assign teams to each</Text>
      </View>
    ) : (
      (tournament.pools ?? []).map((pool: any) => {
        const unassignedTeams = (tournament.teams ?? []).filter((t: any) =>
          !(tournament.pools ?? []).some((p: any) => (p.teamIds ?? []).includes(t.teamId))
        );
        return (
          <View key={pool.poolId} style={styles.matchCard}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={styles.matchTeams}>{pool.poolName}</Text>
              {canManage && (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <TouchableOpacity onPress={() => { setRenamingPool({ poolId: pool.poolId, currentName: pool.poolName }); setRenamePoolValue(pool.poolName); }}>
  <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold" }}>Rename</Text>
</TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  Alert.alert("Delete Pool", `Delete "${pool.poolName}"? Teams will become unassigned.`, [
                    { text: "Cancel", style: "cancel" },
                    { text: "Delete", style: "destructive", onPress: () => deletePool(tournamentId, pool.poolId) },
                  ]);
                }}>
                  <Text style={{ color: COLORS.red, fontSize: 12, fontWeight: "bold" }}>Delete</Text>
                </TouchableOpacity>
              </View>
              )}
            </View>

            <Text style={styles.matchMetaText}>Qualifies: Top {pool.qualifyCount} • {(pool.teamIds ?? []).length} teams</Text>

            <View style={{ marginTop: 10, marginBottom: 10 }}>
              {(pool.teamIds ?? []).length === 0 ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>No teams assigned yet</Text>
              ) : (
                (pool.teamIds ?? []).map((teamId: string) => {
                  const team = (tournament.teams ?? []).find((t: any) => t.teamId === teamId);
                  return (
                    <View key={teamId} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.border + "55" }}>
                      <Text style={{ color: COLORS.text, fontSize: 13 }}>{team?.teamName ?? teamId}</Text>
                      {canManage && (
                      <TouchableOpacity onPress={() => removeTeamFromPool(tournamentId, pool.poolId, teamId)}>
                        <Text style={{ color: COLORS.red, fontSize: 12, fontWeight: "bold" }}>Remove</Text>
                      </TouchableOpacity>
                      )}
                    </View>
                  );
                })
              )}
            </View>

            {canManage && unassignedTeams.length > 0 && (
              <View style={{ marginBottom: 10 }}>
                <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginBottom: 6 }}>Add team to this pool:</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {unassignedTeams.map((t: any) => (
                    <TouchableOpacity key={t.teamId} style={styles.teamChip} onPress={() => assignTeamToPool(tournamentId, pool.poolId, t.teamId)}>
                      <Text style={styles.teamChipText}>+ {t.teamName}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {canManage && (
            <TouchableOpacity style={[styles.startBtn, { alignSelf: "flex-start" }]} onPress={() => {
              setPoolMatchTeam1(""); setPoolMatchTeam2(""); setPoolMatchDate(getTodayString());
              setPoolMatchModal({ poolId: pool.poolId });
            }}>
              <Text style={styles.startBtnText}>Schedule Pool Match</Text>
            </TouchableOpacity>
            )}

            {(pool.matches ?? []).length > 0 && (
              <View style={{ marginTop: 10 }}>
                {pool.matches.map((m: any) => (
                  <View key={m.id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 }}>
                    <Text style={{ color: COLORS.text, fontSize: 13 }}>{m.team1} vs {m.team2}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                       {m.status === "scheduled" && canManage && (
                      <TouchableOpacity onPress={() => { setAssignScorerPhone(m.assignedScorerPhone ?? ''); setAssignScorerMatchId(m.id); }}>
                        <Text style={{ color: COLORS.blue, fontSize: 12, fontWeight: "bold" }}>
                          {m.assignedScorerPhone ? `Scorer: ${m.assignedScorerPhone}` : 'Assign Scorer'}
                        </Text>
                      </TouchableOpacity>
                    )}
                       {m.status === "scheduled" && canScoreThisMatch(tournament, m) && (
                      <TouchableOpacity style={styles.startBtn} onPress={() => handleStartMatch(m)}>
                        <Text style={styles.startBtnText}>Start</Text>
                      </TouchableOpacity>
                    )}
                    {m.status === "live" && canScoreThisMatch(tournament, m) && (
                      <TouchableOpacity style={[styles.startBtn, styles.continueBtn]} onPress={() => handleStartMatch(m)}>
                        <Text style={styles.startBtnText}>Continue</Text>
                      </TouchableOpacity>
                    )}
                    {m.status === "completed" && (
                      <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold" }}>{m.winner}</Text>
                    )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Pool-wise points table */}
            <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10 }}>
              <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: "bold", marginBottom: 8 }}>Pool Standings</Text>
              <View style={styles.pointsHeader}>
                <Text style={[styles.pointsCell, styles.pointsName]}>Team</Text>
                <Text style={styles.pointsCell}>P</Text><Text style={styles.pointsCell}>W</Text><Text style={styles.pointsCell}>L</Text>
                <Text style={styles.pointsCell}>NRR</Text><Text style={[styles.pointsCell, { color: COLORS.primary }]}>Pts</Text>
              </View>
              {[...(pool.standings ?? [])].sort((a: any, b: any) => b.points - a.points || b.nrr - a.nrr).map((t: any, i: number) => (
                <View key={t.teamId} style={[styles.pointsRow, i < pool.qualifyCount && { borderColor: COLORS.yellow, borderWidth: 2 }]}>
                  <Text style={[styles.pointsCell, styles.pointsName]}>{i < pool.qualifyCount ? "✓ " : ""}{t.teamName}</Text>
                  <Text style={styles.pointsCell}>{t.played}</Text>
                  <Text style={[styles.pointsCell, { color: COLORS.primary }]}>{t.won}</Text>
                  <Text style={[styles.pointsCell, { color: COLORS.red }]}>{t.lost}</Text>
                  <Text style={[styles.pointsCell, { color: (t.nrr ?? 0) >= 0 ? COLORS.primary : COLORS.red }]}>{(t.nrr ?? 0) > 0 ? "+" : ""}{(t.nrr ?? 0).toFixed(2)}</Text>
                  <Text style={[styles.pointsCell, styles.pointsPts]}>{t.points}</Text>
                </View>
              ))}
              {(pool.standings ?? []).length > 0 && (
                <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 4 }}>✓ = qualifies for knockout</Text>
              )}
            </View>
          </View>
        );
      })
    )}
  </View>
)}

{tab === "bracket" && (
  <View style={styles.tabContent}>
    {tournament.tournamentFormat === "Pool + Knockout" && arePoolsComplete(tournament) && (tournament.pools ?? []).length > 0 && (
      <View style={{ backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border }}>
        <Text style={{ color: COLORS.primary, fontSize: 13, fontWeight: "bold", marginBottom: 10 }}>Qualified Teams</Text>
        {(tournament.pools ?? []).map((pool: any) => (
          <View key={pool.poolId} style={{ marginBottom: 10 }}>
            <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: "bold", marginBottom: 4 }}>{pool.poolName}</Text>
            {getPoolQualifiers(pool).map((q: any) => (
              <Text key={q.teamId} style={{ color: COLORS.textSecondary, fontSize: 12, marginLeft: 8 }}>
                {q.poolRank}. {q.teamName}
              </Text>
            ))}
          </View>
        ))}
      </View>
    )}
    {tournament.tournamentFormat === "Pool + Knockout" && !arePoolsComplete(tournament) ? (
      <View style={styles.empty}>
        <AppIcon emoji="🔒" size={48} color={COLORS.textMuted} />
        <Text style={styles.emptyText}>Bracket Locked</Text>
        <Text style={styles.emptyHint}>Complete all pool matches to unlock the knockout bracket</Text>
      </View>
    ) : (tournament.knockoutFixtures ?? []).length === 0 ? (
  <>
    <View style={styles.empty}>
      <AppIcon emoji="🏆" size={48} color={COLORS.textMuted} />
      <Text style={styles.emptyText}>No Bracket Yet</Text>
      <Text style={styles.emptyHint}>Auto-generate from pool qualifiers, or build manually</Text>
    </View>
    {canManage && (
      <TouchableOpacity style={styles.addMatchBtn} onPress={() => setShowBracketSetup(true)}>
        <Text style={styles.addMatchBtnText}>Auto-Generate Bracket</Text>
      </TouchableOpacity>
    )}
    {canManage && (
      <TouchableOpacity style={[styles.addMatchBtn, { backgroundColor: COLORS.blue }]} onPress={() => {
        setManualStage('Quarter Final'); setManualHomeTeam(''); setManualAwayTeam('');
        setShowManualBracket(true);
      }}>
        <Text style={styles.addMatchBtnText}>Add Match Manually</Text>
      </TouchableOpacity>
    )}
  </>
) : (
      STAGE_ORDER_DISPLAY.filter((stage) => (tournament.knockoutFixtures ?? []).some((f: any) => f.stage === stage)).map((stage) => (
        <View key={stage} style={{ marginBottom: 16 }}>
          <Text style={{ color: COLORS.primary, fontSize: 14, fontWeight: "bold", marginBottom: 8 }}>{stage}</Text>
          {(tournament.knockoutFixtures ?? []).filter((f: any) => f.stage === stage).sort((a: any, b: any) => a.slot - b.slot).map((f: any) => (
            <View key={f.id} style={styles.matchCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={styles.matchTeams}>
                  {f.homeTeamName ?? (f.homeSourcePool ? `${f.homeSourcePool} #${f.homeSourcePoolRank}` : "Winner of previous match")}
                  {"  vs  "}
                  {f.awayTeamName ?? (f.awaySourcePool ? `${f.awaySourcePool} #${f.awaySourcePoolRank}` : "Winner of previous match")}
                </Text>
              </View>
                            {f.homeSourcePool && (
                <Text style={styles.matchMetaText}>{f.homeSourcePool} #{f.homeSourcePoolRank} vs {f.awaySourcePool} #{f.awaySourcePoolRank}</Text>
              )}
              {f.date && f.time && (
                <Text style={styles.matchMetaText}>📅 {f.date}  •  🕐 {f.time}</Text>
              )}
              <View style={styles.matchFooter}>
                <View style={[styles.statusBadge, f.status === "live" && styles.statusLive, f.status === "completed" && styles.statusDone]}>
                  <Text style={styles.statusText}>{f.status === "completed" ? "Done" : f.status === "live" ? "Live" : "Scheduled"}</Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {f.status === "scheduled" && canManage && (
                    <TouchableOpacity onPress={() => { setAssignScorerPhone(f.assignedScorerPhone ?? ''); setAssignScorerMatchId(f.id); }} style={{ justifyContent: "center" }}>
                      <Text style={{ color: COLORS.blue, fontSize: 12, fontWeight: "bold" }}>
                        {f.assignedScorerPhone ? `Scorer: ${f.assignedScorerPhone}` : 'Assign Scorer'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {f.status === "scheduled" && f.homeTeamName && f.awayTeamName && canScoreThisMatch(tournament, { assignedScorerPhone: f.assignedScorerPhone }) && (
                    <TouchableOpacity style={styles.startBtn} onPress={() => handleStartMatch({ id: f.id, team1: f.homeTeamName, team2: f.awayTeamName, date: "TBD", time: "TBD", venue: tournament.venue ?? "TBD", status: "scheduled" })}>
                      <Text style={styles.startBtnText}>Start</Text>
                    </TouchableOpacity>
                  )}
                  {f.status === "live" && canScoreThisMatch(tournament, { assignedScorerPhone: f.assignedScorerPhone }) && (
                    // Routed through handleStartMatch, NOT straight to Scoring.
                    // A fixture is marked live the moment Start is tapped, but
                    // matchId is only attached once the setup wizard finishes
                    // creating the real match. Leaving the app mid-setup left a
                    // live fixture with no matchId, and navigating to Scoring
                    // with matchId undefined renders a dead screen (see the
                    // `if (!matchId) return` guard in ScoringScreen) — that is
                    // the "stuck in Live" bug. handleStartMatch already handles
                    // both cases: it resumes scoring when matchId exists, and
                    // re-enters setup when it doesn't, so no duplicate match is
                    // ever created. This mirrors the Matches tab's Continue.
                    <TouchableOpacity style={[styles.startBtn, styles.continueBtn]} onPress={() => handleStartMatch({ id: f.id, team1: f.homeTeamName, team2: f.awayTeamName, date: "TBD", time: "TBD", venue: tournament.venue ?? "TBD", status: "live", matchId: f.matchId })}>
                      <Text style={styles.startBtnText}>Continue</Text>
                    </TouchableOpacity>
                  )}
                  {f.status === "completed" && f.matchId && (
                    <TouchableOpacity style={[styles.startBtn, styles.viewBtn]} onPress={() => navigation.navigate("Scorecard", { matchId: f.matchId })}>
                      <Text style={styles.startBtnText}>Scorecard</Text>
                    </TouchableOpacity>
                  )}
                  {f.status === "scheduled" && canManage && (
                    <TouchableOpacity style={[styles.startBtn, { backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border }]} onPress={() => {
                      setEditingFixture(f); setEditHomeTeam(f.homeTeamName ?? ""); setEditAwayTeam(f.awayTeamName ?? "");
                    }}>
                      <Text style={[styles.startBtnText, { color: COLORS.text }]}>Edit</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      ))
    )}
  </View>
)}
        {tab === "points" && (
          <View style={styles.tabContent}>
            {(tournament.teams ?? []).length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyIcon}></Text><Text style={styles.emptyText}>No teams yet</Text></View>
            ) : (
              <>
                <View style={styles.pointsHeader}>
                  <Text style={[styles.pointsCell, styles.pointsName]}>Team</Text>
                  <Text style={styles.pointsCell}>P</Text><Text style={styles.pointsCell}>W</Text><Text style={styles.pointsCell}>L</Text><Text style={styles.pointsCell}>T</Text><Text style={styles.pointsCell}>NRR</Text>
                  <Text style={[styles.pointsCell, { color: COLORS.primary }]}>Pts</Text>
                </View>
                {[...(tournament.teams ?? [])].sort((a: any, b: any) => b.points - a.points).map((team: any, i: number) => (
                  <View key={i} style={[styles.pointsRow, i === 0 && styles.pointsRowFirst, i === 1 && styles.pointsRowSecond, i === 2 && styles.pointsRowThird]}>
                    <Text style={[styles.pointsCell, styles.pointsName]}>{i === 0 ? " " : i === 1 ? " " : i === 2 ? " " : ""}{team.teamName}</Text>
                    <Text style={styles.pointsCell}>{team.played}</Text><Text style={[styles.pointsCell, { color: COLORS.primary }]}>{team.won}</Text><Text style={[styles.pointsCell, { color: COLORS.red }]}>{team.lost}</Text><Text style={[styles.pointsCell, { color: COLORS.orange }]}>{team.tied}</Text>
                    <Text style={[styles.pointsCell, { color: team.nrr >= 0 ? COLORS.primary : COLORS.red }]}>{team.nrr > 0 ? "+" : ""}{team.nrr.toFixed(2)}</Text>
                    <Text style={[styles.pointsCell, styles.pointsPts]}>{team.points}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        {tab === "stats" && (
  <View style={styles.tabContent} onLayout={() => {
    if (!statsInterstitialShownRef.current && !statsLoading && completedMatchesData.length > 0) {
      statsInterstitialShownRef.current = true;
      setShowStatsInterstitial(true);
    }
  }}>
    {statsLoading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 30 }} />
            ) : completedMatchesData.length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyIcon}></Text><Text style={styles.emptyText}>Stats available after matches</Text><Text style={styles.emptyHint}>Complete matches to see statistics</Text></View>
            ) : (
              <>
                <View style={styles.statsSubTabs}>
                  {["batting", "bowling", "fielding"].map((st) => (
                    <TouchableOpacity key={st} style={[styles.statsSubTab, statsTab === st && styles.statsSubTabActive]} onPress={() => setStatsTab(st as any)}>
                      <Text style={[styles.statsSubTabText, statsTab === st && styles.statsSubTabTextActive]}>{st.charAt(0).toUpperCase() + st.slice(1)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {statsTab === "batting" && (
                  Object.keys(tournBatMap).length === 0 ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>No batting stats yet</Text></View>
                  ) : (
                    Object.entries(tournBatMap).sort(([, a]: any, [, b]: any) => b.runs - a.runs).map(([id, bs]: any) => {
                      const avg = bs.outs > 0 ? (bs.runs / bs.outs).toFixed(1) : bs.runs > 0 ? bs.runs + "*" : "0";
                      const sr = bs.balls > 0 ? ((bs.runs / bs.balls) * 100).toFixed(1) : "0.0";
                      const hs = bs.scores.length > 0 ? Math.max(...bs.scores) : 0;
                      return (
                        <View key={id} style={[styles.statPCard, styles.statPCardBatting]}>
                          <View pointerEvents="none" style={styles.cardEdge} />
                          <View style={styles.statPHead}>
                            <Text style={styles.statPName}>{bs.name}{bs.teamName ? " (" + bs.teamName + ")" : ""}</Text>
                            <Text style={styles.statPHighlight}>{bs.runs} runs</Text>
                          </View>
                          <Text style={styles.statPSub}>{bs.innings} inn • {bs.balls} balls • SR {sr} • Avg {avg} • HS {hs} • 4s {bs.fours} • 6s {bs.sixes}</Text>
                        </View>
                      );
                    })
                  )
                )}

                {statsTab === "bowling" && (
                  Object.keys(tournBolMap).length === 0 ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>No bowling stats yet</Text></View>
                  ) : (
                    Object.entries(tournBolMap).sort(([, a]: any, [, b]: any) => b.wickets - a.wickets).map(([id, bw]: any) => {
                      const totalOv = (bw.overs ?? 0) + (bw.balls ?? 0) / 6;
                      const eco = totalOv > 0 ? (bw.runs / totalOv).toFixed(2) : "0.00";
                      const figs = bw.figures ?? [];
                      const bbf = figs.length > 0 ? [...figs].sort((a: any, b: any) => b.w - a.w || a.r - b.r)[0] : null;
                      return (
                        <View key={id} style={[styles.statPCard, styles.statPCardBowling]}>
                          <View pointerEvents="none" style={styles.cardEdge} />
                          <View style={styles.statPHead}>
                            <Text style={styles.statPName}>{bw.name}{bw.teamName ? " (" + bw.teamName + ")" : ""}</Text>
                            <Text style={[styles.statPHighlight, { color: COLORS.red }]}>{bw.wickets ?? 0} wkts</Text>
                          </View>
                          <Text style={styles.statPSub}>{bw.innings} inn • {bw.overs}.{bw.balls} ov • {bw.runs} runs • Eco {eco} • BBF {bbf ? bbf.w + "/" + bbf.r : "-"}</Text>
                        </View>
                      );
                    })
                  )
                )}

                {statsTab === "fielding" && (
                  Object.keys(tournFieldMap).length === 0 ? (
                    <View style={styles.empty}><Text style={styles.emptyText}>No fielding stats yet</Text></View>
                  ) : (
                    Object.entries(tournFieldMap).sort(([, a]: any, [, b]: any) => (b.catches + b.runOuts + b.stumpings) - (a.catches + a.runOuts + a.stumpings)).map(([id, f]: any) => (
                      <View key={id} style={[styles.statPCard, styles.statPCardFielding]}>
                        <View pointerEvents="none" style={styles.cardEdge} />
                        <View style={styles.statPHead}>
                          <Text style={styles.statPName}>{f.name}{f.teamName ? " (" + f.teamName + ")" : ""}</Text>
                        </View>
                        <Text style={styles.statPSub}>Catches {f.catches} • Run Outs {f.runOuts} • Stumpings {f.stumpings}</Text>
                      </View>
                    ))
                  )
                )}
              </>
            )}
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={showInfoModal} transparent animationType="fade">
  <View style={styles.modalOverlay}>
    <View style={styles.modal}>
      <Text style={styles.modalTitle}>Tournament Details</Text>
      <ScrollView style={{ maxHeight: 400 }}>
        {[
          { label: 'Tournament Name', value: tournament.name },
          { label: 'Organisation', value: tournament.organisationName },
          { label: 'Venue', value: tournament.venue || '-' },
          { label: 'Format (Overs)', value: tournament.format || '-' },
          { label: 'Ball Type', value: tournament.ballType || '-' },
          { label: 'Start Date', value: tournament.startDate || '-' },
          { label: 'End Date', value: tournament.endDate || '-' },
          { label: 'Status', value: getTournamentDisplayStatus(tournament) },
          { label: 'Teams', value: String(tournament.teams?.length ?? 0) },
          { label: 'Matches Scheduled', value: String(tournament.matches?.length ?? 0) },
        ].map((row, i) => (
          <View key={i} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{row.label}</Text>
            <Text style={styles.infoValue}>{row.value}</Text>
          </View>
        ))}
      </ScrollView>
      <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowInfoModal(false)}>
        <Text style={styles.modalCloseBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  </View>
</Modal>

      <Modal visible={showNewTeam} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add New Team</Text>
            <TextInput style={styles.modalInput} placeholder="Enter team name" placeholderTextColor={COLORS.textMuted} value={newTeamName} onChangeText={setNewTeamName} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowNewTeam(false); setNewTeamName(""); }}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={handleAddNewTeam}><Text style={styles.modalAddText}>Add Team</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showAddMatch} transparent animationType="slide">
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={[styles.modalOverlay, { minHeight: 600 }]}>
            <View style={styles.modal}>
              <View style={styles.modalHeader}>
                <TouchableOpacity onPress={() => matchStep > 1 ? setMatchStep(1) : closeMatchModal()} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle2}>Schedule Match ({matchStep}/2)</Text>
                <View style={{ width: 50 }} />
              </View>

              {matchStep === 1 && (
                <>
                  <Text style={styles.modalLabel}>Team 1 *</Text>
                  <View style={styles.teamChipRow}>
                    {(tournament.teams ?? []).map((t: any) => (
                      <TouchableOpacity key={t.teamId} style={[styles.teamChip, matchTeam1 === t.teamName && styles.teamChipActive]} onPress={() => setMatchTeam1(t.teamName)}>
                        <Text style={[styles.teamChipText, matchTeam1 === t.teamName && styles.teamChipTextActive]}>{t.teamName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.modalLabel}>Team 2 *</Text>
                  <View style={styles.teamChipRow}>
                    {(tournament.teams ?? []).map((t: any) => (
                      <TouchableOpacity key={t.teamId} style={[styles.teamChip, matchTeam2 === t.teamName && styles.teamChipActive]} onPress={() => setMatchTeam2(t.teamName)}>
                        <Text style={[styles.teamChipText, matchTeam2 === t.teamName && styles.teamChipTextActive]}>{t.teamName}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {matchStep === 2 && (
                <>
                  <View style={styles.selectedTeams}>
                    <Text style={styles.selectedTeamsText}>{matchTeam1} vs {matchTeam2}</Text>
                  </View>
                  <Text style={styles.modalLabel}>Date (DD/MM/YYYY)</Text>
                  <TextInput style={styles.modalInput} placeholderTextColor={COLORS.textMuted} value={matchDate} onChangeText={setMatchDate} />
                  <Text style={styles.modalLabel}>Time</Text>
                  <TextInput style={styles.modalInput} placeholder="e.g. 10:00 AM" placeholderTextColor={COLORS.textMuted} value={matchTime} onChangeText={setMatchTime} />
                  <Text style={styles.modalLabel}>Venue (optional)</Text>
                  <TextInput style={styles.modalInput} placeholder="Match venue" placeholderTextColor={COLORS.textMuted} value={matchVenue} onChangeText={setMatchVenue} />
                </>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={closeMatchModal}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={styles.modalAddBtn} onPress={matchStep === 1 ? handleNextStep : handleAddMatch}>
                  <Text style={styles.modalAddText}>{matchStep === 1 ? "Next" : "Schedule"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </Modal>

      <Modal visible={showPoolModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Create Pool</Text>
            <Text style={styles.modalLabel}>Pool Name *</Text>
            <TextInput style={styles.modalInput} placeholder='e.g. "Pool A" or "Virat Pool"' placeholderTextColor={COLORS.textMuted} value={newPoolName} onChangeText={setNewPoolName} autoFocus />
            <Text style={styles.modalLabel}>Qualify to Knockout</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
              {[1, 2, 4].map((n) => (
                <TouchableOpacity key={n} style={[styles.teamChip, newPoolQualify === n && styles.teamChipActive]} onPress={() => setNewPoolQualify(n as 1|2|4)}>
                  <Text style={[styles.teamChipText, newPoolQualify === n && styles.teamChipTextActive]}>Top {n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowPoolModal(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={async () => {
                if (!newPoolName.trim()) { Alert.alert("Error", "Enter a pool name"); return; }
                await createPool(tournamentId, newPoolName, newPoolQualify);
                setShowPoolModal(false);
              }}>
                <Text style={styles.modalAddText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!poolMatchModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Schedule Pool Match</Text>
            {poolMatchModal && (() => {
              const pool = (tournament.pools ?? []).find((p: any) => p.poolId === poolMatchModal.poolId);
              const poolTeamNames = (pool?.teamIds ?? []).map((tid: string) => (tournament.teams ?? []).find((t: any) => t.teamId === tid)?.teamName).filter(Boolean);
              return (
                <>
                  <Text style={styles.modalLabel}>Team 1 *</Text>
<View style={styles.teamChipRow}>
  {poolTeamNames.map((name: any) => (
    <TouchableOpacity key={name} style={[styles.teamChip, poolMatchTeam1 === name && styles.teamChipActive]} onPress={() => setPoolMatchTeam1(name)}>
      <Text style={[styles.teamChipText, poolMatchTeam1 === name && styles.teamChipTextActive]}>{name}</Text>
    </TouchableOpacity>
  ))}
</View>
                  <Text style={styles.modalLabel}>Team 2 *</Text>
<View style={styles.teamChipRow}>
  {poolTeamNames.map((name: any) => (
    <TouchableOpacity key={name} style={[styles.teamChip, poolMatchTeam2 === name && styles.teamChipActive]} onPress={() => setPoolMatchTeam2(name)}>
      <Text style={[styles.teamChipText, poolMatchTeam2 === name && styles.teamChipTextActive]}>{name}</Text>
    </TouchableOpacity>
  ))}
</View>
                  <Text style={styles.modalLabel}>Date (DD/MM/YYYY)</Text>
                  <TextInput style={styles.modalInput} value={poolMatchDate} onChangeText={setPoolMatchDate} />
                  <View style={styles.modalBtns}>
                    <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPoolMatchModal(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
                    <TouchableOpacity style={styles.modalAddBtn} onPress={async () => {
                      if (!poolMatchTeam1 || !poolMatchTeam2) { Alert.alert("Error", "Select both teams"); return; }
                      if (poolMatchTeam1 === poolMatchTeam2) { Alert.alert("Error", "Teams must be different"); return; }
                      await addPoolMatch(tournamentId, poolMatchModal.poolId, { team1: poolMatchTeam1, team2: poolMatchTeam2, date: poolMatchDate });
                      setPoolMatchModal(null);
                    }}>
                      <Text style={styles.modalAddText}>Schedule</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
      <Modal visible={showInviteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Invite Team Captain</Text>
            {!generatedInviteCode ? (
              <>
                <Text style={styles.modalLabel}>Team Name *</Text>
                <TextInput style={styles.modalInput} placeholder="Enter team name" placeholderTextColor={COLORS.textMuted} value={inviteTeamName} onChangeText={setInviteTeamName} autoFocus />
                <View style={styles.modalBtns}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowInviteModal(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.modalAddBtn} onPress={async () => {
                    if (!inviteTeamName.trim()) { Alert.alert("Error", "Enter a team name"); return; }
                    try {
                      const code = await createCaptainInvite(tournamentId, inviteTeamName);
                      setGeneratedInviteCode(code);
                    } catch (e: any) { Alert.alert("Error", e?.message); }
                  }}>
                    <Text style={styles.modalAddText}>Generate Invite</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <Text style={{ color: COLORS.textSecondary, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
                  Invite "{inviteTeamName}"'s captain via WhatsApp. They'll tap the link to join and add their players.
                </Text>
                <TouchableOpacity
                  style={[styles.modalAddBtn, { backgroundColor: COLORS.success, marginBottom: 10 }]}
                  onPress={async () => {
                    const { Linking } = require('react-native');
                    const msg = `You've been invited to join "${inviteTeamName}" for the tournament "${tournament.name}"!\n\nOpen CricketScorer app → Join as Captain → Enter code: ${generatedInviteCode}`;
                    const url = `whatsapp://send?text=${encodeURIComponent(msg)}`;
                    try {
                      // Skip canOpenURL — on Android 11+ it unreliably returns
                      // false for whatsapp:// even when WhatsApp IS installed,
                      // unless AndroidManifest.xml declares a <queries> entry for
                      // it. Attempting openURL directly and catching the failure
                      // avoids needing a native manifest change.
                      await Linking.openURL(url);
                    } catch {
                      Alert.alert('Could not open WhatsApp', 'Make sure WhatsApp is installed, or share the code manually.');
                    }
                  }}
                >
                  <Text style={styles.modalAddText}>📤 Share via WhatsApp</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowInviteModal(false)}>
                  <Text style={styles.modalCancelText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={!!editingFixture} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Fixture</Text>
            <TextInput
              style={styles.modalInput}
              value={editHomeTeam}
              onChangeText={setEditHomeTeam}
              placeholder="Home team"
              placeholderTextColor={COLORS.textMuted}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 10 }]}
              value={editAwayTeam}
              onChangeText={setEditAwayTeam}
              placeholder="Away team"
              placeholderTextColor={COLORS.textMuted}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditingFixture(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalAddBtn}
                onPress={async () => {
                  if (!editHomeTeam.trim() || !editAwayTeam.trim()) {
                    Alert.alert("Error", "Enter both team names");
                    return;
                  }
                  try {
                    await editKnockoutFixtureTeams(tournamentId, editingFixture.id, editHomeTeam.trim(), editAwayTeam.trim());
                    setEditingFixture(null);
                  } catch (e: any) {
                    Alert.alert("Error", e?.message ?? "Could not update the fixture");
                  }
                }}
              >
                <Text style={styles.modalAddText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={!!renamingPool} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Rename Pool</Text>
            <TextInput style={styles.modalInput} value={renamePoolValue} onChangeText={setRenamePoolValue} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setRenamingPool(null)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={async () => {
                if (!renamePoolValue.trim()) { Alert.alert("Error", "Enter a pool name"); return; }
                await renamePool(tournamentId, renamingPool!.poolId, renamePoolValue);
                setRenamingPool(null);
              }}>
                <Text style={styles.modalAddText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Delete Tournament?</Text>
            <Text style={{ color: COLORS.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 }}>
              This action cannot be undone. Deleting this tournament will permanently remove all associated data, including teams, fixtures, points tables, match history, and tournament statistics.
            </Text>
            <AdBanner />
            <View style={[styles.modalBtns, { marginTop: 16 }]}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowDeleteConfirm(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalAddBtn, { backgroundColor: COLORS.red }]} onPress={() => { setShowDeleteConfirm(false); setShowDeleteRewarded(true); }}>
                <Text style={styles.modalAddText}>Watch Ad & Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AdRewardedGate
        visible={showDeleteRewarded}
        onComplete={async () => {
          setShowDeleteRewarded(false);
          setDeletingTournament(true);
          try {
            await deleteTournament(tournamentId);
            Alert.alert('Deleted', 'Tournament deleted successfully.');
            navigation.reset({ index: 0, routes: [{ name: 'MyTournament' }] });
          } catch (e: any) {
            Alert.alert('Error', e?.message ?? 'Could not delete tournament');
          } finally {
            setDeletingTournament(false);
          }
        }}
        onSkip={() => {
          setShowDeleteRewarded(false);
          Alert.alert('Ad Skipped', 'Please watch the complete advertisement to delete the tournament.');
        }}
      />

      <Modal visible={showBracketSetup} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Generate Bracket</Text>
            <Text style={styles.modalLabel}>Start Stage</Text>
            <View style={styles.teamChipRow}>
              {(['Quarter Final', 'Semi Final', 'Final'] as const).map((stage) => (
                <TouchableOpacity key={stage} style={[styles.teamChip, bracketStartStage === stage && styles.teamChipActive]} onPress={() => setBracketStartStage(stage)}>
                  <Text style={[styles.teamChipText, bracketStartStage === stage && styles.teamChipTextActive]}>{stage}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 10 }} onPress={() => setIncludeThirdPlace(!includeThirdPlace)}>
              <View style={{ width: 20, height: 20, borderRadius: 4, borderWidth: 2, borderColor: COLORS.primary, backgroundColor: includeThirdPlace ? COLORS.primary : "transparent" }} />
              <Text style={{ color: COLORS.text, fontSize: 13 }}>Include Third Place Match</Text>
            </TouchableOpacity>
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowBracketSetup(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={async () => {
                try {
                  await autoGenerateKnockoutBracket(tournamentId, bracketStartStage, includeThirdPlace);
                  setShowBracketSetup(false);
                } catch (e: any) { Alert.alert("Error", e?.message); }
              }}>
                <Text style={styles.modalAddText}>Generate</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showManualBracket} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Match Manually</Text>
            <Text style={styles.modalLabel}>Stage *</Text>
            <View style={styles.teamChipRow}>
              {(['Quarter Final', 'Semi Final', 'Final', 'Third Place Match'] as const).map((stage) => (
                <TouchableOpacity key={stage} style={[styles.teamChip, manualStage === stage && styles.teamChipActive]} onPress={() => setManualStage(stage)}>
                  <Text style={[styles.teamChipText, manualStage === stage && styles.teamChipTextActive]}>{stage}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Team 1</Text>
            <View style={styles.teamChipRow}>
              {(tournament.teams ?? []).map((t: any) => (
                <TouchableOpacity key={t.teamId} style={[styles.teamChip, manualHomeTeam === t.teamName && styles.teamChipActive]} onPress={() => setManualHomeTeam(t.teamName)}>
                  <Text style={[styles.teamChipText, manualHomeTeam === t.teamName && styles.teamChipTextActive]}>{t.teamName}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Team 2 (leave unselected for a "Winner of..." placeholder)</Text>
            <View style={styles.teamChipRow}>
              {(tournament.teams ?? []).map((t: any) => (
                <TouchableOpacity key={t.teamId} style={[styles.teamChip, manualAwayTeam === t.teamName && styles.teamChipActive]} onPress={() => setManualAwayTeam(t.teamName)}>
                  <Text style={[styles.teamChipText, manualAwayTeam === t.teamName && styles.teamChipTextActive]}>{t.teamName}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Date (DD/MM/YYYY)</Text>
            <TextInput style={styles.modalInput} placeholderTextColor={COLORS.textMuted} value={manualMatchDate} onChangeText={setManualMatchDate} />
            <Text style={styles.modalLabel}>Time</Text>
            <TextInput style={styles.modalInput} placeholder="e.g. 10:00 AM" placeholderTextColor={COLORS.textMuted} value={manualMatchTime} onChangeText={setManualMatchTime} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowManualBracket(false)}><Text style={styles.modalCancelText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={async () => {
                const existingSlots = (tournament.knockoutFixtures ?? []).filter((f: any) => f.stage === manualStage).length;
                const fixture = {
                  id: 'ko_manual_' + Date.now(),
                  stage: manualStage,
                  slot: existingSlots + 1,
                  homeTeamName: manualHomeTeam || undefined,
                  awayTeamName: manualAwayTeam || undefined,
                  date: manualMatchDate || "TBD",
                  time: manualMatchTime || "TBD",
                  status: 'scheduled',
                };
                try {
                  await setManualKnockoutFixture(tournamentId, fixture);
                  setShowManualBracket(false);
                  setManualMatchDate(getTodayString());
                  setManualMatchTime("");
                } catch (e: any) { Alert.alert("Error", e?.message); }
              }}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditTournament} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Edit Tournament</Text>
            <Text style={styles.modalLabel}>Tournament Name</Text>
            <TextInput style={styles.modalInput} value={editName} onChangeText={setEditName} placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Organisation</Text>
            <TextInput style={styles.modalInput} value={editOrg} onChangeText={setEditOrg} placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Venue</Text>
            <TextInput style={styles.modalInput} value={editVenue} onChangeText={setEditVenue} placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>Start Date *</Text>
            <TextInput style={styles.modalInput} value={editStartDate} onChangeText={setEditStartDate} placeholderTextColor={COLORS.textMuted} />
            <Text style={styles.modalLabel}>End Date *</Text>
            <TextInput style={styles.modalInput} value={editEndDate} onChangeText={setEditEndDate} placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowEditTournament(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalAddBtn}
                onPress={async () => {
                  if (!editName.trim()) { Alert.alert('Error', 'Tournament name cannot be empty'); return; }
                  // Same rule as creation: both dates are required and must be
                  // real DD/MM/YYYY dates with end >= start. Without this, an
                  // edit could blank a date, which sends
                  // getTournamentDisplayStatus back to the never-updated
                  // stored `status` field and pins the tournament to
                  // "Upcoming" on the home dashboard.
                  const dateError = validateTournamentDates(editStartDate, editEndDate);
                  if (dateError) { Alert.alert('Invalid Dates', dateError); return; }
                  await updateTournament(tournamentId, {
                    name: editName.trim(),
                    organisationName: editOrg.trim(),
                    venue: editVenue.trim(),
                    startDate: editStartDate.trim(),
                    endDate: editEndDate.trim(),
                  });
                  setShowEditTournament(false);
                }}
              >
                <Text style={styles.modalAddText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!assignScorerMatchId} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Assign Scorer</Text>
            <Text style={styles.modalLabel}>Scorer's phone number (blank to unassign)</Text>
            <TextInput style={styles.modalInput} value={assignScorerPhone} onChangeText={setAssignScorerPhone} keyboardType="phone-pad" placeholderTextColor={COLORS.textMuted} />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAssignScorerMatchId(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalAddBtn}
                onPress={async () => {
                  await assignScorerToMatch(tournamentId, assignScorerMatchId!, assignScorerPhone.trim() || null);
                  setAssignScorerMatchId(null);
                }}
              >
                <Text style={styles.modalAddText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
            

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  infoBar: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.sm },
  infoText: { ...TYPE.caption, color: COLORS.textSecondary },
  banner: { width: "100%", height: 140 },

  // ── Tabs ──
  // Pill segmented control rather than a text row with an underline: the old
  // version gave no sense of a selected surface, only a 2px line.
  tabs: {
    flexDirection: "row", gap: 4,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: COLORS.card, borderRadius: RADIUS.round,
    padding: 4, borderWidth: 1, borderColor: COLORS.borderSoft,
  },
  tab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: RADIUS.round },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.onPrimary },

  content: { flex: 1 },
  tabContent: { padding: SPACING.lg },
  // Hairline highlight along a card's top edge, matching the same cheap
  // depth cue used by the shared Card/StatCard components — purely
  // decorative, absolutely positioned so it cannot affect layout.
  cardEdge: { position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  addMatchBtn: { backgroundColor: COLORS.primary, paddingVertical: 15, borderRadius: RADIUS.md, alignItems: "center", marginBottom: SPACING.md, ...SHADOW.glow(COLORS.primary) },
  addMatchBtnText: { ...TYPE.button, color: COLORS.onPrimary },

  // ── Match cards ──
  matchCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: 12, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: "hidden", ...SHADOW.md },
  matchCardLive: { borderColor: COLORS.live + "66", borderLeftWidth: 3, borderLeftColor: COLORS.live },
  matchCardDone: { borderLeftWidth: 3, borderLeftColor: COLORS.success + "88" },
  matchNumber: { ...TYPE.label, fontSize: 9, color: COLORS.textMuted, marginBottom: 5 },
  matchTeams: { ...TYPE.h2, color: COLORS.text, marginBottom: SPACING.sm },
  matchMeta: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.sm },
  matchMetaText: { ...TYPE.caption, color: COLORS.textSecondary },
  matchFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: SPACING.sm, paddingTop: SPACING.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft },
  statusBadge: { backgroundColor: COLORS.card2, paddingHorizontal: 11, paddingVertical: 5, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border },
  statusLive: { backgroundColor: COLORS.live + "22", borderColor: COLORS.live + "55" },
  statusDone: { backgroundColor: COLORS.success + "22", borderColor: COLORS.success + "55" },
  statusText: { ...TYPE.label, fontSize: 9, color: COLORS.text },
  startBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 9, borderRadius: RADIUS.round },
  continueBtn: { backgroundColor: COLORS.orange },
  viewBtn: { backgroundColor: COLORS.blue },
  startBtnText: { ...TYPE.label, fontSize: 10, color: COLORS.onPrimary },

  // ── Teams ──
  addTeamRow: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.md },
  addTeamBtn: { flex: 1, backgroundColor: COLORS.card2, paddingVertical: 12, borderRadius: RADIUS.round, alignItems: "center", borderWidth: 1, borderColor: COLORS.primary + "55" },
  addTeamBtnText: { ...TYPE.label, fontSize: 10, color: COLORS.primaryLight },
  teamCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 14, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderSoft, gap: 12, overflow: "hidden", ...SHADOW.sm },
  teamLogoBox: { width: 46, height: 46, borderRadius: 23, backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primary + "55", justifyContent: "center", alignItems: "center" },
  teamLogoText: { ...TYPE.h2, color: COLORS.primaryLight },
  teamInfo: { flex: 1 },
  teamName: { ...TYPE.title, color: COLORS.text },
  teamStats: { ...TYPE.numSm, color: COLORS.textSecondary, marginTop: 3 },
  removeText: { color: COLORS.error, fontSize: 18, fontWeight: "bold", padding: SPACING.sm },

  // ── Points table ──
  pointsHeader: { flexDirection: "row", backgroundColor: COLORS.card2, borderRadius: RADIUS.sm, paddingVertical: 10, paddingHorizontal: SPACING.sm, marginBottom: SPACING.sm },
  pointsRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: RADIUS.sm, paddingVertical: 12, paddingHorizontal: SPACING.sm, marginBottom: 6, borderWidth: 1, borderColor: COLORS.borderSoft },
  // Leader highlighted with a stripe rather than a full 2px gold outline,
  // which competed with the numbers.
  pointsRowFirst: { borderLeftWidth: 3, borderLeftColor: COLORS.yellow, backgroundColor: COLORS.yellow + "0d" },
  // Silver/bronze tints for 2nd/3rd, same convention as the dedicated
  // points-table screen — rank-based styling only, sort order untouched.
  pointsRowSecond: { borderLeftWidth: 3, borderLeftColor: COLORS.textSecondary, backgroundColor: COLORS.textSecondary + "0d" },
  pointsRowThird: { borderLeftWidth: 3, borderLeftColor: COLORS.orange, backgroundColor: COLORS.orange + "0d" },
  pointsCell: { flex: 1, ...TYPE.num, fontSize: 12, color: COLORS.textSecondary, textAlign: "center" },
  pointsName: { flex: 2.5, textAlign: "left", ...TYPE.bodyStrong, color: COLORS.text },
  pointsPts: { ...TYPE.num, color: COLORS.primaryLight },

  // ── Stats ──
  statsSubTabs: { flexDirection: "row", gap: 6, marginBottom: SPACING.md, backgroundColor: COLORS.card, borderRadius: RADIUS.round, padding: 4, borderWidth: 1, borderColor: COLORS.borderSoft },
  statsSubTab: { flex: 1, paddingVertical: 9, borderRadius: RADIUS.round, backgroundColor: "transparent", alignItems: "center" },
  statsSubTabActive: { backgroundColor: COLORS.primary },
  statsSubTabText: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  statsSubTabTextActive: { color: COLORS.onPrimary },
  statPCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 14, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderSoft, overflow: "hidden", ...SHADOW.sm },
  // Per-category accent stripe, mirroring the matchCardLive/matchCardDone
  // convention above — colour/borderWidth only, same card shape and size.
  statPCardBatting: { borderLeftWidth: 3, borderLeftColor: COLORS.primary },
  statPCardBowling: { borderLeftWidth: 3, borderLeftColor: COLORS.red },
  statPCardFielding: { borderLeftWidth: 3, borderLeftColor: COLORS.teal },
  statPHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  statPName: { ...TYPE.title, color: COLORS.text, flex: 1 },
  statPHighlight: { ...TYPE.num, fontSize: 16, color: COLORS.primaryLight },
  statPSub: { ...TYPE.numSm, color: COLORS.textSecondary, lineHeight: 18 },

  // ── Empty ──
  empty: { alignItems: "center", paddingVertical: SPACING.xxl },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyText: { ...TYPE.h2, color: COLORS.text, marginBottom: 6 },
  emptyHint: { ...TYPE.body, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20, maxWidth: 300 },

  // ── Modals ──
  // Bottom sheets on the highest surface, with a heavier scrim so the sheet
  // clearly sits above the page.
  modalOverlay: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.surface3, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg, borderTopWidth: 1, borderColor: COLORS.border, ...SHADOW.lg },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: SPACING.md },
  modalTitle: { ...TYPE.h1, color: COLORS.text, marginBottom: SPACING.md, textAlign: "center" },
  infoRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft },
  infoLabel: { ...TYPE.label, fontSize: 10, color: COLORS.textSecondary },
  infoValue: { ...TYPE.bodyStrong, color: COLORS.text, flex: 1, textAlign: "right", marginLeft: SPACING.sm },
  modalTitle2: { ...TYPE.h2, color: COLORS.text, textAlign: "center", flex: 1 },
  backBtn: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border },
  backBtnText: { ...TYPE.label, fontSize: 10, color: COLORS.primaryLight },
  modalLabel: { ...TYPE.label, color: COLORS.textSecondary, marginBottom: SPACING.sm, marginTop: SPACING.sm },
  modalInput: { backgroundColor: COLORS.background, color: COLORS.text, padding: 14, borderRadius: RADIUS.md, marginBottom: SPACING.sm, ...TYPE.body, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  selectedTeams: { backgroundColor: COLORS.primarySoft, padding: 14, borderRadius: RADIUS.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.primary + "55" },
  selectedTeamsText: { ...TYPE.title, color: COLORS.primaryLight, textAlign: "center" },
  teamChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: SPACING.sm },
  teamChip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border },
  teamChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  teamChipText: { ...TYPE.body, fontSize: 13, color: COLORS.textSecondary },
  teamChipTextActive: { color: COLORS.onPrimary, fontWeight: "700" },
  modalBtns: { flexDirection: "row", gap: SPACING.sm, marginTop: SPACING.md },
  modalCancelBtn: { flex: 1, backgroundColor: COLORS.card2, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  modalCancelText: { ...TYPE.button, fontSize: 14, color: COLORS.text },
  modalAddBtn: { flex: 1, backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: "center" },
  modalAddText: { ...TYPE.button, fontSize: 14, color: COLORS.onPrimary },
  modalCloseBtn: { backgroundColor: COLORS.card2, paddingVertical: 14, borderRadius: RADIUS.md, alignItems: "center", marginTop: SPACING.sm, borderWidth: 1, borderColor: COLORS.border },
  modalCloseBtnText: { ...TYPE.button, fontSize: 14, color: COLORS.text },
  teamSelectRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card2, padding: 14, borderRadius: RADIUS.md, marginBottom: SPACING.sm, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  teamSelectRowAdded: { opacity: 0.45 },
  teamSelectLogo: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: COLORS.primary + "55", justifyContent: "center", alignItems: "center" },
  teamSelectLogoText: { ...TYPE.title, color: COLORS.primaryLight },
  teamSelectName: { ...TYPE.bodyStrong, color: COLORS.text },
  teamSelectSub: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: 2 },
  teamSelectAction: { ...TYPE.label, fontSize: 10, color: COLORS.primaryLight },
});
