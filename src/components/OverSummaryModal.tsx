import React from "react";
import { View, Text, Modal, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { COLORS, RADIUS, SPACING } from "../constants/theme";
import { isLegacyWicket } from "../engine/legacy";

/**
 * One-line-per-over history, shared by the Scoring Screen (scorer) and the
 * Live View Screen (viewer) — both just have a ball history and a bowler
 * roster to name ids from.
 */
export default function OverSummaryModal({
  visible,
  onClose,
  ballHistory,
  wormPoints,
  bowlingPlayers,
}: {
  visible: boolean;
  onClose: () => void;
  ballHistory: any[];
  wormPoints?: Array<{ over: number; runs: number }>;
  bowlingPlayers?: any[];
}) {
  const realBalls = (ballHistory ?? []).filter((b: any) => b?.type !== "NEW_BATSMAN" && b?.over !== undefined);
  const overMap: Record<number, any[]> = {};
  realBalls.forEach((b: any) => {
    const k = b.over ?? 0;
    if (!overMap[k]) overMap[k] = [];
    overMap[k].push(b);
  });
  const overKeys = Object.keys(overMap).map(Number).sort((a, b) => a - b);

  const runsInOver = (ov: number): number => {
    if (!wormPoints || wormPoints.length === 0) return 0;
    const after = wormPoints.find((w) => w.over === ov + 1);
    const before = wormPoints.find((w) => w.over === ov);
    if (after) return after.runs - (before?.runs ?? 0);
    // Current, still-in-progress over: nothing recorded in wormPoints yet.
    const last = wormPoints[wormPoints.length - 1];
    return last ? last.runs - (before?.runs ?? last.runs) : 0;
  };

  const bowlerName = (id: number) =>
    bowlingPlayers?.find((p: any) => p.id === id)?.name ?? `Bowler ${(id ?? 0) + 1}`;

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={st.overlay}>
        <View style={st.sheet}>
          <View style={st.header}>
            <Text style={st.title}>Over-by-Over Summary</Text>
            <TouchableOpacity onPress={onClose}><Text style={st.close}>Close</Text></TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 480 }}>
            {overKeys.length === 0 && <Text style={st.empty}>No balls bowled yet.</Text>}
            {[...overKeys].reverse().map((ov) => {
              const balls = overMap[ov];
              const wkts = balls.filter((b: any) => isLegacyWicket(b.result ?? "")).length;
              return (
                <View key={ov} style={st.overRow}>
                  <View style={st.overLabelCol}>
                    <Text style={st.overNum}>Ov {ov + 1}</Text>
                    <Text style={st.overBowler} numberOfLines={1}>{bowlerName(balls[0]?.bowlerId)}</Text>
                  </View>
                  <View style={st.ballsWrap}>
                    {balls.map((b: any, i: number) => (
                      <View key={i} style={[st.ball,
                        isLegacyWicket(b.result ?? "") && st.bW,
                        b.result === "4" && st.b4, b.result === "6" && st.b6,
                        (b.result?.startsWith?.("WD") || b.result?.startsWith?.("NB")) && st.bExtra]}>
                        <Text style={st.ballTxt}>{(b.result ?? "").length > 3 ? b.result.slice(0, 3) : b.result}</Text>
                      </View>
                    ))}
                  </View>
                  <Text style={st.overTotal}>{runsInOver(ov)}{wkts > 0 ? `-${wkts}` : ""}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, padding: SPACING.md, maxHeight: "75%" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: COLORS.text, fontSize: 16, fontWeight: "bold" },
  close: { color: COLORS.primary, fontSize: 14, fontWeight: "600" },
  empty: { color: COLORS.textMuted, textAlign: "center", paddingVertical: 24 },
  overRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  overLabelCol: { width: 74 },
  overNum: { color: COLORS.text, fontSize: 13, fontWeight: "bold" },
  overBowler: { color: COLORS.textMuted, fontSize: 10 },
  ballsWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  ball: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.card2, justifyContent: "center", alignItems: "center" },
  bW: { backgroundColor: COLORS.live },
  b4: { backgroundColor: COLORS.success },
  b6: { backgroundColor: COLORS.primary },
  bExtra: { backgroundColor: COLORS.warning },
  ballTxt: { color: "#fff", fontSize: 9, fontWeight: "bold" },
  overTotal: { color: COLORS.text, fontSize: 13, fontWeight: "bold", width: 40, textAlign: "right" },
});
