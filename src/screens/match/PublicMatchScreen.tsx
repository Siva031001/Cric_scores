import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import database from "@react-native-firebase/database";

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

  if (!match) return <Text>Loading...</Text>;

  const curInn = match.currentInnings === 1 ? match.innings1 : match.innings2;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{match.team1} vs {match.team2}</Text>
      <Text style={styles.score}>{curInn?.runs}/{curInn?.wickets}</Text>
      <Text>Status: {match.status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 20 },
  score: { fontSize: 24, marginTop: 10 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  error: { fontSize: 16 },
});
