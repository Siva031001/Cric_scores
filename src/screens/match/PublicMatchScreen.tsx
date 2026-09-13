import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import database from "@react-native-firebase/database";
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from "../../constants/theme";

export default function PublicMatchScreen({ route }: any) {
  const { matchId } = route.params ?? {};
  const [match, setMatch] = useState<any>(null);

  useEffect(() => {
    if (!matchId) return;

    const ref = database().ref(`matches/${matchId}`);

    const sub = ref.on("value", snap => {
      setMatch(snap.val());
    });

    return () => ref.off("value", sub);
  }, [matchId]);

  if (!matchId) return <View style={styles.center}><Text style={styles.error}>Match not found</Text></View>;

  if (!match) return <View style={styles.center}><Text style={styles.loading}>Loading...</Text></View>;

  const curInn = match.currentInnings === 1 ? match.innings1 : match.innings2;

  return (
    <View style={styles.container}>
      <View style={styles.scoreCard}>
        <View pointerEvents="none" style={styles.edge} />
        <Text style={styles.title}>{match.team1} vs {match.team2}</Text>
        <Text style={styles.score}>{curInn?.runs}/{curInn?.wickets}</Text>
        <Text style={styles.status}>Status: {match.status}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // This screen is the one an unauthenticated viewer lands on, so it needs the
  // app background rather than the OS default white.
  container: { flex: 1, backgroundColor: COLORS.background, padding: SPACING.lg, paddingTop: 60 },
  // Single card: teams, score, status. Nothing else competes with the score.
  scoreCard: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    padding: SPACING.lg,
    alignItems: "center",
    overflow: "hidden",
    ...SHADOW.md,
  },
  edge: { position: "absolute", top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight },
  title: { ...TYPE.h2, color: COLORS.text, textAlign: "center" },
  // Tabular figures: this updates ball by ball, and proportional digits make
  // the score jump sideways as it crosses 9 -> 10.
  score: { ...TYPE.display, color: COLORS.primaryLight, marginTop: SPACING.sm },
  status: { ...TYPE.caption, color: COLORS.textSecondary, marginTop: SPACING.xs },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },
  loading: { ...TYPE.body, color: COLORS.textSecondary },
  error: { ...TYPE.title, color: COLORS.textMuted },
});
