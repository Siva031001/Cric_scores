import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { calculatePoints } from "../utils/leaderboard";
import { COLORS, RADIUS, SPACING, TYPE } from "../constants/theme";

export default function Leaderboard({ matches }: any) {
  const data = calculatePoints(matches);

  return (
    <View style={styles.container}>
      {data.map((t, i) => {
        // Rank-based accent only — same gold/silver/bronze convention used on
        // the other points-table screens. Purely a style choice keyed off the
        // existing sorted index; the ranking itself still comes from
        // calculatePoints and is untouched.
        const accent = i === 0 ? COLORS.yellow : i === 1 ? COLORS.textSecondary : i === 2 ? COLORS.orange : COLORS.border;
        return (
          <View key={i} style={[styles.row, { borderLeftColor: accent }]}>
            <Text style={styles.text}>{i + 1}. {(t as any).team} - {(t as any).pts} pts</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: SPACING.md, backgroundColor: COLORS.background, gap: 8 },
  row: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    borderLeftWidth: 3,
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
  },
  text: { ...TYPE.body, color: COLORS.text },
});
