import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView } from "react-native";
import { subscribeToTournament, tieBreakersFor } from "../../utils/firebase";
import { sortStandings } from "../../engine";
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from "../../constants/theme";
import Header from "../../components/Header";
import SectionHeader from "../../components/SectionHeader";
import AppIcon from "../../components/AppIcon";

export default function LeaderboardScreen({ route, navigation }: any) {
  const { tournamentId } = route.params ?? {};
  const [teams, setTeams] = useState<any[]>([]);
  const [tournamentName, setTournamentName] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tournamentId) { setLoading(false); return; }
    // subscribeToTournament reads tournaments/id and listens for real-time
    // updates. completeTournamentMatch() writes points/NRR into tournaments/id/teams
    // so this listener automatically reflects every match result as it happens.
    // The old LeaderboardScreen read tournaments/id/pointsTable — a path that
    // does not exist — so the table was always empty.
    const unsub = subscribeToTournament(tournamentId, (data: any) => {
      if (!data) { setLoading(false); return; }
      setTournamentName(data.name ?? "");
      // Mirrors the engine's own standings order (points, wins, NRR, head
      // to head, seeding) via sortStandings, instead of a simplified
      // points-then-NRR sort that could disagree with the real table.
      const sorted = sortStandings(data.teams ?? [], tieBreakersFor(data));
      setTeams(sorted);
      setLoading(false);
    });
    return unsub;
  }, [tournamentId]);

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );

  const medalFor = (i: number) =>
    i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

  return (
    <View style={s.container}>
      <Header
        title={tournamentName ? tournamentName + " — Points Table" : "Points Table"}
        onBack={() => navigation.goBack()}
      />

      {teams.length === 0 ? (
        <View style={s.empty}>
          <AppIcon emoji="🏅" size={52} color={COLORS.textMuted} />
          <Text style={s.emptyTitle}>No Teams Yet</Text>
          <Text style={s.emptySub}>Add teams and complete matches to see the points table</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Column header */}
          <View style={s.headerRow}>
            <Text style={[s.hCell, s.rankCell]}>#</Text>
            <Text style={[s.hCell, s.nameCell]}>Team</Text>
            <Text style={s.hCell}>P</Text>
            <Text style={s.hCell}>W</Text>
            <Text style={s.hCell}>L</Text>
            <Text style={s.hCell}>T</Text>
            <Text style={s.hCell}>NR</Text>
            <Text style={s.hCell}>NRR</Text>
            <Text style={[s.hCell, s.ptsCell]}>Pts</Text>
          </View>

          {teams.map((team: any, i: number) => {
            const isFirst = i === 0;
            const nrrVal = team.nrr ?? 0;
            const nrrStr = (nrrVal > 0 ? "+" : "") + nrrVal.toFixed(2);
            return (
              <View
                key={team.teamId ?? i}
                style={[
                  s.row,
                  isFirst && s.rowFirst,
                  i % 2 === 1 && s.rowAlt,
                ]}
              >
                <View style={[s.cell, s.rankCell]}>
                  {medalFor(i) ? (
                <AppIcon emoji={medalFor(i)!} size={isFirst ? 20 : 16} color={COLORS.text} />
                    ) : (
                <Text style={[s.cell, s.rankCell]}>{i + 1}</Text>
                    )}
                </View>
                <View style={s.nameCell}>
                  <Text style={[s.teamName, isFirst && { color: COLORS.yellow }]} numberOfLines={1}>
                    {team.teamName ?? team.teamId ?? "—"}
                  </Text>
                </View>
                <Text style={s.cell}>{team.played ?? 0}</Text>
                <Text style={[s.cell, { color: COLORS.primary }]}>{team.won ?? 0}</Text>
                <Text style={[s.cell, { color: COLORS.red }]}>{team.lost ?? 0}</Text>
                <Text style={[s.cell, { color: COLORS.orange }]}>{team.tied ?? 0}</Text>
                <Text style={[s.cell, { color: COLORS.textMuted }]}>{team.noResult ?? 0}</Text>
                <Text style={[s.cell, { color: nrrVal >= 0 ? COLORS.primary : COLORS.red }]}>
                  {nrrStr}
                </Text>
                <Text style={[s.cell, s.ptsCell, s.ptsVal]}>{team.points ?? 0}</Text>
              </View>
            );
          })}

          {/* Legend */}
          <View style={s.legend}>
            <Text style={s.legendTxt}>P = Played  W = Won  L = Lost  T = Tied  NR = No Result</Text>
            <Text style={s.legendTxt}>NRR = Net Run Rate  Pts = Points</Text>
            <Text style={s.legendTxt}>Sorted by Points, then NRR</Text>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.background },

  // Column headers: uppercase micro-labels, the convention for a standings
  // table, so they read as headers rather than data.
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card2,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginTop: SPACING.sm,
  },
  hCell: { flex: 1, ...TYPE.label, fontSize: 9, color: COLORS.primaryLight, textAlign: "center" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: 13,
    // Hairline separators: a full 1px border on every row turned the table
    // into a grid and competed with the figures.
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderSoft,
  },
  rowFirst: { backgroundColor: COLORS.yellow + "12", borderLeftWidth: 3, borderLeftColor: COLORS.yellow },
  rowAlt: { backgroundColor: "rgba(255,255,255,0.02)" },

  rankCell: { flex: 0.6, textAlign: "center" },
  nameCell: { flex: 2.5, justifyContent: "center" },
  ptsCell: { flex: 1 },

  // Tabular figures so every column lines up regardless of digit count.
  cell: { flex: 1, ...TYPE.num, fontSize: 13, color: COLORS.textSecondary, textAlign: "center" },
  rankFirst: { fontSize: 17, color: COLORS.yellow },
  teamName: { ...TYPE.bodyStrong, fontSize: 13, color: COLORS.text },
  // Points are what the table is sorted by, so they are the heaviest cell.
  ptsVal: { ...TYPE.num, fontSize: 16, color: COLORS.primaryLight },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  emptyIcon: { fontSize: 48, marginBottom: 14 },
  emptyTitle: { ...TYPE.h2, color: COLORS.text, marginBottom: SPACING.sm },
  emptySub: { ...TYPE.body, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20, maxWidth: 300 },

  legend: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.md,
    padding: 12,
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    gap: 4,
    ...SHADOW.sm,
  },
  legendTxt: { ...TYPE.caption, fontSize: 11, color: COLORS.textMuted, textAlign: "center" },
});
