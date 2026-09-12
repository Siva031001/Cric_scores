import React, { useState } from 'react';
import { View, Text, StyleSheet, LayoutChangeEvent } from 'react-native';
import { COLORS, RADIUS } from '../constants/theme';

interface Props {
  innings1Points: { over: number; runs: number }[];
  innings2Points: { over: number; runs: number }[];
  totalOvers: number;
  team1Name: string;
  team2Name: string;
}

export default function WormGraph({ innings1Points, innings2Points, totalOvers, team1Name, team2Name }: Props) {
  const maxRuns = Math.max(
    ...innings1Points.map((p) => p.runs),
    ...innings2Points.map((p) => p.runs),
    1
  );
  const graphHeight = 140;
  const [graphWidth, setGraphWidth] = useState(300);
  const onGraphLayout = (e: LayoutChangeEvent) => setGraphWidth(e.nativeEvent.layout.width);

  const renderLine = (points: { over: number; runs: number }[], color: string) => {
    if (points.length < 2) return null;
    return points.slice(1).map((p, i) => {
      const prev = points[i];
      const x1 = (prev.over / totalOvers) * 100;
      const x2 = (p.over / totalOvers) * 100;
      const y1 = graphHeight - (prev.runs / maxRuns) * graphHeight;
      const y2 = graphHeight - (p.runs / maxRuns) * graphHeight;
      const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow((y2 - y1) / graphHeight * 100, 2));
      const angle = Math.atan2(y2 - y1, ((x2 - x1) / 100) * graphWidth) * (180 / Math.PI);
      return (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: `${x1}%`,
            top: y1,
            width: `${length}%`,
            height: 2,
            backgroundColor: color,
            transform: [{ rotate: `${angle}deg` }],
            transformOrigin: 'left center',
          }}
        />
      );
    });
  };

  return (
    <View style={s.container}>
      <View style={s.legend}>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: COLORS.blue }]} /><Text style={s.legendTxt}>{team1Name}</Text></View>
        <View style={s.legendItem}><View style={[s.dot, { backgroundColor: COLORS.primary }]} /><Text style={s.legendTxt}>{team2Name}</Text></View>
      </View>
      <View style={[s.graphArea, { height: graphHeight }]} onLayout={onGraphLayout}>
        {renderLine(innings1Points, COLORS.blue)}
        {renderLine(innings2Points, COLORS.primary)}
      </View>
      <View style={s.xAxis}>
        <Text style={s.axisTxt}>0</Text>
        <Text style={s.axisTxt}>{totalOvers}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 12, borderWidth: 1, borderColor: COLORS.border },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendTxt: { color: COLORS.textSecondary, fontSize: 11 },
  graphArea: { position: 'relative', backgroundColor: COLORS.background, borderRadius: RADIUS.sm },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisTxt: { color: COLORS.textMuted, fontSize: 10 },
});