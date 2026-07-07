import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Modal, TextInput, Alert } from "react-native";
import { subscribeToTournament, updateTournament, getMyTeams, getMatchById } from "../../utils/firebase";
import { Tournament, TournamentTeam, Team } from "../../types/cricket";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";
import AppIcon from "../../components/AppIcon";

const getTodayString = () => { const d = new Date(); return String(d.getDate()).padStart(2,"0")+"/"+String(d.getMonth()+1).padStart(2,"0")+"/"+d.getFullYear(); };

export default function TournamentDetailScreen({ route, navigation }: any) {
  const { tournamentId } = route.params;
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

  useEffect(() => {
    const unsub = subscribeToTournament(tournamentId, setTournament);
    getMyTeams().then(setMyTeams);
    return unsub;
  }, [tournamentId]);

  // Whenever the tournament's completed matches change, fetch their full
  // match data (innings/batsmanStats/bowlerStats/fieldingStats) for stats aggregation.
  useEffect(() => {
    const completedIds = (tournament?.matches ?? [])
      .filter((m: any) => m.status === "completed" && m.matchId)
      .map((m: any) => m.matchId);
    if (completedIds.length === 0) { setCompletedMatchesData([]); return; }
    setStatsLoading(true);
    Promise.all(completedIds.map((id: string) => getMatchById(id)))
      .then((results: any[]) => setCompletedMatchesData(results.filter(Boolean)))
      .finally(() => setStatsLoading(false));
  }, [tournament?.matches]);

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

  const handleStartMatch = (match: any) => {
    if (!tournament) return;
    if (match.status === "completed" && match.matchId) { navigation.navigate("Scorecard", { matchId: match.matchId }); return; }
    if (match.status === "live" && match.matchId) { navigation.navigate("Scoring", { matchId: match.matchId }); return; }

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

  const startMatchFlow = (match: any, team1Players: any[], team2Players: any[]) => {
    const overs = tournament?.format?.replace(" Overs", "") ?? "20";
    navigation.navigate("PlayerSetup", { team1: match.team1, team2: match.team2, overs, venue: match.venue !== "TBD" ? match.venue : tournament?.venue ?? "", team1Players, team2Players, tournamentId, tournamentMatchId: match.id });
  };

  if (!tournament) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  const TABS = [
    { key: "matches", label: "Matches", icon: "M" },
    { key: "teams", label: "Teams", icon: "T" },
    { key: "points", label: "Points", icon: "P" },
    { key: "stats", label: "Stats", icon: "S" },
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
        const key = gid ?? ("local:" + bs.playerId + ":" + (battingRoster === m.team1Players ? "t1" : "t2") + ":" + battingTeamName);
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
        const key = gid ?? ("local:" + bw.playerId + ":" + (bowlingRoster === m.team1Players ? "t1" : "t2") + ":" + bowlingTeamName);
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
      <Header title={tournament.name} onBack={() => navigation.goBack()} />
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
    <AppIcon emoji={tournament.ballType === "Leather Ball" ? "🔴" : "🎾"} size={12} color={COLORS.textSecondary} />
    <Text style={styles.infoText}>{tournament.format}</Text>
  </View>
</View>
      <View style={styles.tabs}>
        {TABS.map((t: any) => (
          <TouchableOpacity key={t.key} style={[styles.tab, tab === t.key && styles.tabActive]} onPress={() => setTab(t.key)}>
            <Text style={styles.tabIcon}>{t.icon}</Text>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {tab === "matches" && (
          <View style={styles.tabContent}>
            <TouchableOpacity style={styles.addMatchBtn} onPress={() => { if ((tournament.teams ?? []).length < 2) { Alert.alert("Add Teams First", "Add at least 2 teams before scheduling matches"); setTab("teams"); return; } setShowAddMatch(true); }}>
              <Text style={styles.addMatchBtnText}>+ Schedule New Match</Text>
            </TouchableOpacity>
            {(tournament.matches ?? []).length === 0 ? (
              <View style={styles.empty}><AppIcon emoji="📅" size={48} color={COLORS.textMuted} /><Text style={styles.emptyText}>No matches scheduled</Text><Text style={styles.emptyHint}>Add teams first, then schedule matches</Text></View>
            ) : (
              (tournament.matches ?? []).map((match: any, i: number) => (
                <View key={i} style={[styles.matchCard, match.status === "live" && styles.matchCardLive, match.status === "completed" && styles.matchCardDone]}>
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
                    {match.status === "scheduled" && <TouchableOpacity style={styles.startBtn} onPress={() => handleStartMatch(match)}><Text style={styles.startBtnText}>Start Match</Text></TouchableOpacity>}
                    {match.status === "live" && <TouchableOpacity style={[styles.startBtn, styles.continueBtn]} onPress={() => handleStartMatch(match)}><Text style={styles.startBtnText}>Continue</Text></TouchableOpacity>}
                    {match.status === "completed" && match.matchId && <TouchableOpacity style={[styles.startBtn, styles.viewBtn]} onPress={() => navigation.navigate("Scorecard", { matchId: match.matchId })}><Text style={styles.startBtnText}>Scorecard</Text></TouchableOpacity>}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
        {tab === "teams" && (
          <View style={styles.tabContent}>
            <View style={styles.addTeamRow}>
              <TouchableOpacity
                style={[styles.addTeamBtn, {flex: 1}]}
                onPress={() => navigation.navigate('MyTeams', { selectMode: true, tournamentId })}
                >
              <Text style={styles.addTeamBtnText}>+ Add Team from My Teams</Text>
              </TouchableOpacity>
          </View>
            
            {(tournament.teams ?? []).length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyIcon}></Text><Text style={styles.emptyText}>No teams added yet</Text><Text style={styles.emptyHint}>Add teams to start the tournament</Text></View>
            ) : (
              (tournament.teams ?? []).map((team: any, i: number) => (
                <View key={i} style={styles.teamCard}>
                  <View style={styles.teamLogoBox}><Text style={styles.teamLogoText}>{team.teamName.charAt(0).toUpperCase()}</Text></View>
                  <View style={styles.teamInfo}><Text style={styles.teamName}>{team.teamName}</Text><Text style={styles.teamStats}>P:{team.played} W:{team.won} L:{team.lost} Pts:{team.points}</Text></View>
                  <TouchableOpacity onPress={() => handleRemoveTeam(team.teamId)}><Text style={styles.removeText}>X</Text></TouchableOpacity>
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
                  <View key={i} style={[styles.pointsRow, i === 0 && styles.pointsRowFirst]}>
                    <Text style={[styles.pointsCell, styles.pointsName]}>{i === 0 ? " " : i === 1 ? " " : i === 2 ? " " : ""}{team.teamName}</Text>
                    <Text style={styles.pointsCell}>{team.played}</Text><Text style={styles.pointsCell}>{team.won}</Text><Text style={styles.pointsCell}>{team.lost}</Text><Text style={styles.pointsCell}>{team.tied}</Text>
                    <Text style={styles.pointsCell}>{team.nrr > 0 ? "+" : ""}{team.nrr.toFixed(2)}</Text>
                    <Text style={[styles.pointsCell, styles.pointsPts]}>{team.points}</Text>
                  </View>
                ))}
              </>
            )}
          </View>
        )}
        {tab === "stats" && (
          <View style={styles.tabContent}>
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
                        <View key={id} style={styles.statPCard}>
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
                        <View key={id} style={styles.statPCard}>
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
                      <View key={id} style={styles.statPCard}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  infoBar: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: SPACING.lg, paddingBottom: 10 },
  infoText: { color: COLORS.textSecondary, fontSize: 12 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabIcon: { fontSize: 16, marginBottom: 2 },
  tabText: { color: COLORS.textSecondary, fontSize: 11 },
  tabTextActive: { color: COLORS.primary, fontWeight: "bold" },
  content: { flex: 1 },
  tabContent: { padding: SPACING.lg },
  addMatchBtn: { backgroundColor: COLORS.primary, padding: 14, borderRadius: RADIUS.md, alignItems: "center", marginBottom: 15 },
  addMatchBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  matchCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  matchCardLive: { borderColor: COLORS.red, borderWidth: 2 },
  matchCardDone: { borderColor: COLORS.primary + "55" },
  matchNumber: { color: COLORS.textMuted, fontSize: 11, marginBottom: 4 },
  matchTeams: { color: COLORS.text, fontSize: 17, fontWeight: "bold", marginBottom: 8 },
  matchMeta: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 10 },
  matchMetaText: { color: COLORS.textSecondary, fontSize: 12 },
  matchFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusBadge: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.round },
  statusLive: { backgroundColor: COLORS.red + "33" },
  statusDone: { backgroundColor: COLORS.primary + "33" },
  statusText: { color: COLORS.text, fontSize: 12, fontWeight: "bold" },
  startBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: RADIUS.round },
  continueBtn: { backgroundColor: COLORS.orange },
  viewBtn: { backgroundColor: COLORS.blue },
  startBtnText: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  addTeamRow: { flexDirection: "row", gap: 10, marginBottom: 15 },
  addTeamBtn: { flex: 1, backgroundColor: COLORS.primary, paddingVertical: 10, borderRadius: RADIUS.round, alignItems: "center" },
  addTeamBtnText: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  teamCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  teamLogoBox: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center" },
  teamLogoText: { color: "#fff", fontSize: 18, fontWeight: "bold" },
  teamInfo: { flex: 1 },
  teamName: { color: COLORS.text, fontSize: 15, fontWeight: "bold" },
  teamStats: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  removeText: { color: COLORS.red, fontSize: 18, fontWeight: "bold", padding: 8 },
  pointsHeader: { flexDirection: "row", backgroundColor: COLORS.card2, borderRadius: RADIUS.sm, padding: 10, marginBottom: 8 },
  pointsRow: { flexDirection: "row", backgroundColor: COLORS.card, borderRadius: RADIUS.sm, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: COLORS.border },
  pointsRowFirst: { borderColor: COLORS.yellow, borderWidth: 2 },
  pointsCell: { flex: 1, color: COLORS.textSecondary, fontSize: 12, textAlign: "center" },
  pointsName: { flex: 2.5, textAlign: "left", color: COLORS.text, fontWeight: "bold" },
  pointsPts: { color: COLORS.primary, fontWeight: "bold" },
  statsSubTabs: { flexDirection: "row", gap: 8, marginBottom: 15 },
  statsSubTab: { flex: 1, paddingVertical: 8, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  statsSubTabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  statsSubTabText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: "bold" },
  statsSubTabTextActive: { color: "#fff" },
  statPCard: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  statPHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  statPName: { color: COLORS.text, fontSize: 15, fontWeight: "bold" },
  statPHighlight: { color: COLORS.primary, fontSize: 14, fontWeight: "bold" },
  statPSub: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { color: COLORS.text, fontSize: 16, fontWeight: "bold", marginBottom: 6 },
  emptyHint: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", justifyContent: "flex-end" },
  modal: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 15 },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: "bold", marginBottom: 15, textAlign: "center" },
  modalTitle2: { color: COLORS.text, fontSize: 16, fontWeight: "bold", textAlign: "center", flex: 1 },
  backBtn: { backgroundColor: COLORS.card2, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.round, borderWidth: 1, borderColor: COLORS.border },
  backBtnText: { color: COLORS.primary, fontSize: 13, fontWeight: "bold" },
  modalLabel: { color: COLORS.primary, fontSize: 13, fontWeight: "bold", marginBottom: 8, marginTop: 8 },
  modalInput: { backgroundColor: COLORS.background, color: COLORS.text, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  selectedTeams: { backgroundColor: COLORS.primary + "22", padding: 12, borderRadius: RADIUS.md, marginBottom: 10, borderWidth: 1, borderColor: COLORS.primary },
  selectedTeamsText: { color: COLORS.primary, fontSize: 15, fontWeight: "bold", textAlign: "center" },
  teamChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  teamChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border },
  teamChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  teamChipText: { color: COLORS.textSecondary, fontSize: 13 },
  teamChipTextActive: { color: "#fff", fontWeight: "bold" },
  modalBtns: { flexDirection: "row", gap: 10, marginTop: 15 },
  modalCancelBtn: { flex: 1, backgroundColor: COLORS.card2, padding: 12, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontWeight: "bold" },
  modalAddBtn: { flex: 1, backgroundColor: COLORS.primary, padding: 12, borderRadius: RADIUS.md, alignItems: "center" },
  modalAddText: { color: "#fff", fontSize: 14, fontWeight: "bold" },
  modalCloseBtn: { backgroundColor: COLORS.card2, padding: 12, borderRadius: RADIUS.md, alignItems: "center", marginTop: 10, borderWidth: 1, borderColor: COLORS.border },
  modalCloseBtnText: { color: COLORS.text, fontSize: 14, fontWeight: "bold" },
  teamSelectRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card2, padding: 14, borderRadius: RADIUS.md, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  teamSelectRowAdded: { opacity: 0.5 },
  teamSelectLogo: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center" },
  teamSelectLogoText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
  teamSelectName: { color: COLORS.text, fontSize: 14, fontWeight: "bold" },
  teamSelectSub: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  teamSelectAction: { color: COLORS.primary, fontSize: 13, fontWeight: "bold" },
});