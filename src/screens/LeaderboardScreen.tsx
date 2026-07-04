import React from "react";
import { View, Text } from "react-native";
import { calculatePoints } from "../utils/leaderboard";

export default function Leaderboard({ matches }: any) {
  const data = calculatePoints(matches);

  return (
    <View>
      {data.map((t, i) => (
        <Text key={i}>{i + 1}. {(t as any).team} - {(t as any).pts} pts</Text>
      ))}
    </View>
  );
}
