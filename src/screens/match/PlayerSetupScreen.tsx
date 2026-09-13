import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { Player } from "../../types/cricket";
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from "../../constants/theme";
import Header from "../../components/Header";
import Card from "../../components/Card";
import AppIcon from "../../components/AppIcon";

export default function PlayerSetupScreen({ route, navigation }: any) {
  const { team1, team2, overs, venue, ballType, team1Players, team2Players, team1Logo, team2Logo, tournamentId, tournamentMatchId, playersPerSide } = route.params;
  const requiredCount = playersPerSide ?? 11;
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
        else { if (sel.length >= requiredCount) { Alert.alert(`Max ${requiredCount}`, `Select exactly ${requiredCount} players`); return; } setSel([...sel, id]); }
  };

  const handleNext = () => {
    if (activeTeam === 1) {
     if (selected1.length !== requiredCount) { Alert.alert("Error", `Select exactly ${requiredCount} for ` + team1 + ". Selected: " + selected1.length); return; }
      setActiveTeam(2);
    } else {
            if (selected2.length !== requiredCount) { Alert.alert("Error", `Select exactly ${requiredCount} for ` + team2 + ". Selected: " + selected2.length); return; }
      setStep("toss");
    }
  };

  const handleTossConfirm = () => {
    if (!tossWinner) { Alert.alert("Error", "Select toss winner"); return; }
    if (!tossChoice) { Alert.alert("Error", "Select Bat or Bowl"); return; }
    const playing1 = (team1Players as Player[]).filter(p => selected1.includes(p.id));
    const playing2 = (team2Players as Player[]).filter(p => selected2.includes(p.id));
        navigation.navigate("BattingSetup", { team1, team2, overs, venue, ballType, team1Players: playing1, team2Players: playing2, team1Logo, team2Logo, tossWinner, tossChoice, tournamentId, tournamentMatchId, playersPerSide: requiredCount });
  };

  if (step === "toss") {
    return (
      <View style={st.container}>
        <Header title="Toss" onBack={() => setStep("playing11")} />
        <Card tone="base" elevation="lg" style={st.tossCard}>
          <View style={st.tossTitleRow}>
            <AppIcon emoji="🪙" size={20} color={COLORS.warning} />
            <Text style={st.tossTitle}>Who won the toss?</Text>
          </View>
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
                    <AppIcon
                      emoji={c === "Bat" ? "🏏" : "🎯"}
                      size={30}
                      color={tossChoice === c ? COLORS.background : COLORS.primary}
                      style={st.tossChoiceIcon}
                    />
                    <Text style={[st.tossChoiceText, tossChoice === c && st.tossChoiceTextActive]}>{c}</Text>
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
        </Card>
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
            <Text style={[st.tabCount, activeTeam === item.n && st.tabTextActive]}>{item.s.length}/{requiredCount}</Text>
          </TouchableOpacity>
        ))}
      </View>
        <Text style={st.hint}>Select {requiredCount} players for {teamName} ({selected.length}/{requiredCount})</Text>
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
              {isSel && <AppIcon emoji="✓" size={14} color={COLORS.background} />}
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
  // Segmented team switcher: the active side is the brand green, so which
  // team you are picking for is unmistakable.
  tabs: { flexDirection: "row", marginHorizontal: SPACING.lg, marginBottom: SPACING.md, gap: SPACING.sm },
  tab: {
    flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.round,
    backgroundColor: COLORS.card2, alignItems: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  tabText: { ...TYPE.bodyStrong, fontSize: 13, color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.background },
  tabCount: { ...TYPE.numSm, color: COLORS.textMuted, marginTop: 2 },
  hint: { ...TYPE.caption, color: COLORS.textSecondary, textAlign: "center", marginBottom: SPACING.md },
  playerRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card, padding: 12,
    marginHorizontal: SPACING.lg, marginBottom: SPACING.sm - 2,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.borderSoft,
    gap: 12, ...SHADOW.sm,
  },
  // Selected rows lift: brand border plus a tinted surface.
  playerRowSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.card2, justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: COLORS.border },
  avatarSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  avatarText: { ...TYPE.title, color: COLORS.text },
  playerInfo: { flex: 1 },
  playerName: { ...TYPE.body, fontSize: 15, color: COLORS.textSecondary },
  playerNameSelected: { ...TYPE.bodyStrong, fontSize: 15, color: COLORS.text },
  playerRole: { ...TYPE.caption, color: COLORS.textMuted, marginTop: 2 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: COLORS.border, justifyContent: "center", alignItems: "center" },
  checkSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  nextBtn: {
    backgroundColor: COLORS.primary, margin: SPACING.lg,
    minHeight: 54, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.md,
    borderRadius: RADIUS.md, alignItems: "center", justifyContent: "center",
    ...SHADOW.glow(COLORS.primary),
  },
  nextBtnText: { ...TYPE.button, fontSize: 16, color: COLORS.background, textAlign: "center" },
  tossCard: { margin: SPACING.lg, padding: SPACING.lg, gap: SPACING.lg },
  tossTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm },
  tossTitle: { ...TYPE.h2, color: COLORS.text, textAlign: "center" },
  tossRow: { flexDirection: "row", gap: 12 },
  tossTeamBtn: { flex: 1, padding: SPACING.md, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 2, borderColor: COLORS.border },
  tossTeamBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primarySoft },
  tossTeamText: { ...TYPE.title, fontSize: 15, color: COLORS.textSecondary },
  tossTeamTextActive: { color: COLORS.primary },
  tossChoiceBtn: { flex: 1, paddingVertical: SPACING.lg, backgroundColor: COLORS.card2, borderRadius: RADIUS.md, alignItems: "center", borderWidth: 2, borderColor: COLORS.border },
  tossChoiceBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  tossChoiceIcon: { marginBottom: SPACING.sm },
  tossChoiceText: { ...TYPE.title, color: COLORS.text },
  tossChoiceTextActive: { color: COLORS.background },
  tossResult: { backgroundColor: COLORS.primarySoft, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.primary + "55" },
  tossResultText: { ...TYPE.bodyStrong, color: COLORS.primaryLight, textAlign: "center", lineHeight: 22 },
  confirmBtn: {
    backgroundColor: COLORS.primary, height: 54, borderRadius: RADIUS.md,
    alignItems: "center", justifyContent: "center",
    ...SHADOW.glow(COLORS.primary),
  },
  confirmBtnText: { ...TYPE.button, fontSize: 16, color: COLORS.background },
});