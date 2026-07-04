import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { Player } from "../../types/cricket";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";

export default function PlayerSetupScreen({ route, navigation }: any) {
  const { team1, team2, overs, venue, team1Players, team2Players, team1Logo, team2Logo, tournamentId, tournamentMatchId } = route.params;
  const [selected1, setSelected1] = useState<number[]>([]);
  const [selected2, setSelected2] = useState<number[]>([]);
  const [activeTeam, setActiveTeam] = useState<1|2>(1);
  const [step, setStep] = useState<"playing11"|"toss">("playing11");
  const [tossWinner, setTossWinner] = useState("");
  const [tossChoice, setTossChoice] = useState("");

  const toggle = (team: 1|2, id: number) => {
    const sel = team === 1 ? selected1 : selected2;
    const setSel = team === 1 ? setSelected1 : setSelected2;
    if (sel.includes(id)) { setSel(sel.filter(s => s !== id)); }
    else { if (sel.length >= 11) { Alert.alert("Max 11", "Select exactly 11 players"); return; } setSel([...sel, id]); }
  };

  const handleNext = () => {
    if (activeTeam === 1) {
      if (selected1.length !== 11) { Alert.alert("Error", "Select exactly 11 for " + team1 + ". Selected: " + selected1.length); return; }
      setActiveTeam(2);
    } else {
      if (selected2.length !== 11) { Alert.alert("Error", "Select exactly 11 for " + team2 + ". Selected: " + selected2.length); return; }
      setStep("toss");
    }
  };

  const handleTossConfirm = () => {
    if (!tossWinner) { Alert.alert("Error", "Select toss winner"); return; }
    if (!tossChoice) { Alert.alert("Error", "Select Bat or Bowl"); return; }
    const playing1 = (team1Players as Player[]).filter(p => selected1.includes(p.id));
    const playing2 = (team2Players as Player[]).filter(p => selected2.includes(p.id));
    navigation.navigate("BattingSetup", { team1, team2, overs, venue, team1Players: playing1, team2Players: playing2, team1Logo, team2Logo, tossWinner, tossChoice, tournamentId, tournamentMatchId });
  };

  if (step === "toss") {
    return (
      <View style={st.container}>
        <Header title="Toss" onBack={() => setStep("playing11")} />
        <View style={st.tossCard}>
          <Text style={st.tossTitle}>🪙 Who won the toss?</Text>
          <View style={st.tossRow}>
            {[team1, team2].map(t => (
              <TouchableOpacity key={t} style={[st.tossTeamBtn, tossWinner === t && st.tossTeamBtnActive]} onPress={() => setTossWinner(t)}>
                <Text style={[st.tossTeamText, tossWinner === t && st.tossTeamTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {tossWinner !== "" && (
            <>
              <Text style={st.tossTitle}>{tossWinner} chose to...</Text>
              <View style={st.tossRow}>
                {["Bat", "Bowl"].map(c => (
                  <TouchableOpacity key={c} style={[st.tossChoiceBtn, tossChoice === c && st.tossChoiceBtnActive]} onPress={() => setTossChoice(c)}>
                    <Text style={st.tossChoiceIcon}>{c === "Bat" ? "🏏" : "🎯"}</Text>
                    <Text style={[st.tossChoiceText, tossChoice === c && { color: "#fff" }]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          {tossWinner && tossChoice && (
            <View style={st.tossResult}>
              <Text style={st.tossResultText}>
                {tossWinner} won toss and chose to {tossChoice}.
                {"\n"}{tossChoice === "Bat" ? tossWinner : (tossWinner === team1 ? team2 : team1)} will bat first.
              </Text>
            </View>
          )}
          <TouchableOpacity style={st.confirmBtn} onPress={handleTossConfirm}>
            <Text style={st.confirmBtnText}>Start Match →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const players = activeTeam === 1 ? team1Players : team2Players;
  const selected = activeTeam === 1 ? selected1 : selected2;
  const teamName = activeTeam === 1 ? team1 : team2;

  return (
    <ScrollView style={st.container}>
      <Header title="Playing 11" onBack={() => navigation.goBack()} />
      <View style={st.tabs}>
        {[{t:team1,s:selected1,n:1},{t:team2,s:selected2,n:2}].map(item => (
          <TouchableOpacity key={item.n} style={[st.tab, activeTeam === item.n && st.tabActive]} onPress={() => setActiveTeam(item.n as 1|2)}>
            <Text style={[st.tabText, activeTeam === item.n && st.tabTextActive]}>{item.t}</Text>
            <Text style={[st.tabCount, activeTeam === item.n && st.tabTextActive]}>{item.s.length}/11</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={st.hint}>Select 11 players for {teamName} ({selected.length}/11)</Text>
      {(players as Player[]).map(player => {
        const isSel = selected.includes(player.id);
        return (
          <TouchableOpacity key={player.id} style={[st.playerRow, isSel && st.playerRowSelected]} onPress={() => toggle(activeTeam, player.id)}>
            <View style={[st.avatar, isSel && st.avatarSelected]}>
              <Text style={st.avatarText}>{player.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={st.playerInfo}>
              <Text style={[st.playerName, isSel && st.playerNameSelected]}>
                {player.name}{player.isCaptain ? " (C)" : ""}{player.isWicketKeeper ? " (WK)" : ""}
              </Text>
              {player.role && <Text style={st.playerRole}>{player.role}</Text>}
            </View>
            <View style={[st.check, isSel && st.checkSelected]}>
              {isSel && <Text style={st.checkMark}>✓</Text>}
            </View>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity style={st.nextBtn} onPress={handleNext}>
        <Text style={st.nextBtnText}>{activeTeam === 1 ? "Next: " + team2 + " Playing 11 →" : "Continue to Toss →"}</Text>
      </TouchableOpacity>
      <View style={{ height: 50 }} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  tabs: { flexDirection: "row", marginHorizontal: SPACING.lg, marginBottom: 15, gap: 10 },
  tab: { flex: 1, padding: 12, borderRadius: RADIUS.round, backgroundColor: COLORS.card, alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { color: COLORS.textSecondary, fontWeight: "bold", fontSize: 13 },
  tabTextActive: { color: "#fff" },
  tabCount: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  hint: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", marginBottom: 15 },
  playerRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, padding: 12, marginHorizontal: SPACING.lg, marginBottom: 8, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  playerRowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.card2 },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.card2, justifyContent: "center", alignItems: "center" },
  avatarSelected: { backgroundColor: COLORS.primary },
  avatarText: { color: COLORS.text, fontSize: 16, fontWeight: "bold" },
  playerInfo: { flex: 1 },
  playerName: { color: COLORS.textSecondary, fontSize: 15 },
  playerNameSelected: { color: "#fff", fontWeight: "bold" },
  playerRole: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: COLORS.border, justifyContent: "center", alignItems: "center" },
  checkSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkMark: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  nextBtn: { backgroundColor: COLORS.primary, margin: SPACING.lg, padding: 15, borderRadius: RADIUS.md, alignItems: "center" },
  nextBtnText: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  tossCard: { margin: SPACING.lg, gap: 20 },
  tossTitle: { color: COLORS.text, fontSize: 18, fontWeight: "bold", textAlign: "center" },
  tossRow: { flexDirection: "row", gap: 12 },
  tossTeamBtn: { flex: 1, padding: 16, backgroundColor: COLORS.card, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 2, borderColor: COLORS.border },
  tossTeamBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + "22" },
  tossTeamText: { color: COLORS.textSecondary, fontSize: 15, fontWeight: "bold" },
  tossTeamTextActive: { color: COLORS.primary },
  tossChoiceBtn: { flex: 1, padding: 20, backgroundColor: COLORS.card, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 2, borderColor: COLORS.border },
  tossChoiceBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tossChoiceIcon: { fontSize: 32, marginBottom: 8 },
  tossChoiceText: { color: COLORS.text, fontSize: 16, fontWeight: "bold" },
  tossResult: { backgroundColor: COLORS.primary + "22", padding: 16, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary },
  tossResultText: { color: COLORS.primary, fontSize: 14, fontWeight: "bold", textAlign: "center", lineHeight: 22 },
  confirmBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.md, alignItems: "center" },
  confirmBtnText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
});