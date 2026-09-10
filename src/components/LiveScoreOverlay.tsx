import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getOversString, getRunRate, getRequiredRunRate, statKey } from '../utils/cricketLogic';
import { getTheme } from '../utils/streamThemes';

interface Props {
  match: any;
  themeId?: string;
}

export default function LiveScoreOverlay({ match, themeId = 'classic' }: Props) {
  const theme = getTheme(themeId);
  const inn = match?.currentInnings === 1 ? match?.innings1 : match?.innings2;
  const batP = match?.currentInnings === 1 ? match?.team1Players : match?.team2Players;
  const bolP = match?.currentInnings === 1 ? match?.team2Players : match?.team1Players;
  const tgt = match?.currentInnings === 2 ? (match?.innings1?.runs ?? 0) + 1 : null;
  // Stats are stored keyed `p<id>` (statKey) so Firebase keeps the map as an
  // object rather than converting it to a sparse array. Indexing with the
  // bare numeric id returns undefined, which is why these figures used to
  // render as zeros on the stream overlay.
  const ss = inn?.batsmanStats?.[statKey(inn?.strikerId)];
  const ns = inn?.batsmanStats?.[statKey(inn?.nonStrikerId)];
  const bws = inn?.bowlerStats?.[statKey(inn?.currentBowlerId)];

  const nameOf = (players: any[], id: number) => players?.find((p: any) => p.id === id)?.name ?? ('P' + (id + 1));

  const lastOver = (inn?.ballHistory ?? [])
    .filter((b: any) => b.type !== 'NEW_BATSMAN' && b.over === (inn?.overs ?? 0))
    .map((b: any) => b.result);

  const partnershipRuns = (ss?.runs ?? 0) + (ns?.runs ?? 0); // simplified partnership approximation for overlay display

  if (!match || !inn) return null;

  return (
    <View style={[st.container, { backgroundColor: theme.colors.secondary }]}>
      {/* Top scoreboard */}
      <View style={st.topRow}>
        <Text style={[st.teams, { color: theme.colors.text }]}>{match.team1} vs {match.team2}</Text>
        <View style={st.scoreRow}>
          <Text style={[st.score, { color: theme.colors.text }]}>{inn.runs ?? 0}/{inn.wickets ?? 0}</Text>
          <Text style={[st.overs, { color: theme.colors.primary }]}>({getOversString(inn.overs ?? 0, inn.balls ?? 0)})</Text>
        </View>
        <View style={st.metaRow}>
          <Text style={[st.metaTxt, { color: theme.colors.text }]}>CRR {getRunRate(inn.runs ?? 0, inn.overs ?? 0, inn.balls ?? 0)}</Text>
          {tgt && (
            <>
              <Text style={[st.metaTxt, { color: theme.colors.accent }]}>
                RRR {getRequiredRunRate(tgt, inn.runs ?? 0, match.totalOvers, inn.overs ?? 0, inn.balls ?? 0)}
              </Text>
              <Text style={[st.metaTxt, { color: theme.colors.accent }]}>Target {tgt}</Text>
            </>
          )}
        </View>
      </View>

      {/* Bottom overlay */}
      <View style={st.bottomRow}>
        <View style={st.bottomLeft}>
          <Text style={[st.batter, { color: theme.colors.text }]}>* {nameOf(batP, inn.strikerId)} {ss?.runs ?? 0}({ss?.balls ?? 0})</Text>
          <Text style={[st.batterSub, { color: theme.colors.text }]}>{nameOf(batP, inn.nonStrikerId)} {ns?.runs ?? 0}({ns?.balls ?? 0})</Text>
        </View>
        <View style={st.bottomRight}>
          <Text style={[st.bowler, { color: theme.colors.text }]}>{nameOf(bolP, inn.currentBowlerId)} {bws?.wickets ?? 0}/{bws?.runs ?? 0}</Text>
          <Text style={[st.partnership, { color: theme.colors.primary }]}>Partnership: {partnershipRuns}</Text>
        </View>
      </View>

      {lastOver.length > 0 && (
        <View style={st.lastOverRow}>
          <Text style={[st.lastOverLabel, { color: theme.colors.text }]}>This over:</Text>
          {lastOver.map((r: string, i: number) => (
            <View key={i} style={[st.ballDot, { borderColor: theme.colors.primary }]}>
              <Text style={[st.ballTxt, { color: theme.colors.text }]}>{r}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  container: { padding: 10, borderRadius: 8, gap: 8 },
  topRow: { gap: 2 },
  teams: { fontSize: 12, fontWeight: '600', opacity: 0.85 },
  scoreRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  score: { fontSize: 32, fontWeight: 'bold' },
  overs: { fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  metaRow: { flexDirection: 'row', gap: 12 },
  metaTxt: { fontSize: 11, fontWeight: '600' },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between' },
  bottomLeft: {},
  bottomRight: { alignItems: 'flex-end' },
  batter: { fontSize: 12, fontWeight: 'bold' },
  batterSub: { fontSize: 11, opacity: 0.75 },
  bowler: { fontSize: 12, fontWeight: '600' },
  partnership: { fontSize: 11, marginTop: 2 },
  lastOverRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  lastOverLabel: { fontSize: 10, opacity: 0.7 },
  ballDot: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  ballTxt: { fontSize: 8, fontWeight: 'bold' },
});