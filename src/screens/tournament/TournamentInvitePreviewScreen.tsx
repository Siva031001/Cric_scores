import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import Card from '../../components/Card';
import AppIcon from '../../components/AppIcon';

export default function TournamentInvitePreviewScreen({ route, navigation }: any) {
  const { preview, inviteResult } = route.params ?? {};
  const otherTeams = (preview?.teams ?? []).filter((team: any) => team.teamName !== inviteResult?.teamName);

  if (!preview) {
    return (
      <View style={s.container}>
        <Header title="Tournament Invite" onBack={() => navigation.goBack()} />
        <Text style={s.notFound}>Tournament not found.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Header title="Tournament Invite" onBack={() => navigation.goBack()} />
      {/* Soft colour blobs behind the top of the scroll content — same plain
          tinted-View technique used across the app, purely decorative and
          non-interactive so it cannot intercept any tap below it. Starts
          below the header's own opaque background so it never overlaps the
          title. */}
      <View pointerEvents="none" style={s.heroBlobWrap}>
        <View style={[s.heroBlob, { backgroundColor: COLORS.yellow, top: -40, left: -30 }]} />
        <View style={[s.heroBlob, { backgroundColor: COLORS.orange, top: -20, right: -50 }]} />
      </View>
      <ScrollView style={s.scroll}>
        <Card style={s.card} accent={COLORS.primary}>
          <Text style={s.tourneyName}>{preview.name}</Text>
          {preview.venue ? (
            <View style={s.metaRow}>
              <AppIcon emoji="📍" size={13} color={COLORS.textMuted} />
              <Text style={s.meta}>{preview.venue}</Text>
            </View>
          ) : null}
          <View style={s.metaRow}>
            <AppIcon emoji="📅" size={13} color={COLORS.textMuted} />
            <Text style={s.metaNum}>{preview.startDate} — {preview.endDate}</Text>
          </View>
          {preview.tournamentFormat ? <Text style={s.meta}>Format: {preview.tournamentFormat}</Text> : null}
        </Card>

        <Text style={s.sectionTitle}>You're joining as captain of:</Text>
        <Card style={s.card} tone="raised" accent={COLORS.primaryLight}>
          <View style={s.captainRow}>
            <AppIcon emoji="👑" size={18} color={COLORS.primaryLight} />
            <Text style={s.teamName}>{inviteResult.teamName}</Text>
          </View>
        </Card>

        <Text style={s.sectionTitle}>Teams already in this tournament ({otherTeams.length})</Text>
        {otherTeams.length === 0 ? (
          <Text style={s.emptyTxt}>No other teams added yet.</Text>
        ) : (
          otherTeams.map((team: any, i: number) => (
            <Card key={i} style={s.card} elevation="sm">
              <Text style={s.teamName}>{team.teamName}</Text>
              <Text style={s.playerCount}>{team.players.length} players</Text>
              {team.players.length > 0 && (
                <Text style={s.playerList}>{team.players.map((p: any) => p.name).join(', ')}</Text>
              )}
            </Card>
          ))
        )}

        <TouchableOpacity
          style={s.confirmBtn}
          onPress={() =>
            navigation.navigate('CreateTeam', {
              captainInviteMode: true,
              inviteTournamentId: inviteResult.tournamentId,
              inviteTeamId: inviteResult.teamId,
              inviteTeamName: inviteResult.teamName,
            })
          }
        >
          <Text style={s.confirmBtnTxt}>Continue — Add My Team's Players</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Starts at ~ the header's own height so the blobs never draw over the
  // header's title/back button.
  heroBlobWrap: { position: 'absolute', top: 95, left: 0, right: 0, height: 140, overflow: 'hidden' },
  heroBlob: { position: 'absolute', width: 160, height: 160, borderRadius: 80, opacity: 0.12 },
  scroll: { flex: 1, padding: SPACING.lg },
  card: { marginBottom: SPACING.sm },
  notFound: { ...TYPE.body, color: COLORS.textMuted, textAlign: 'center', marginTop: SPACING.xxl },
  tourneyName: { ...TYPE.h2, color: COLORS.text, marginBottom: SPACING.xs },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  meta: { ...TYPE.caption, color: COLORS.textSecondary, marginBottom: 2 },
  // Dates get tabular figures so the two halves of the range line up.
  metaNum: { ...TYPE.numSm, color: COLORS.textSecondary },
  // Micro-label: uppercase + tracking so a section reads as a section without
  // competing with the tournament or team names below it.
  sectionTitle: { ...TYPE.label, color: COLORS.primary, marginTop: SPACING.md, marginBottom: SPACING.sm },
  captainRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  teamName: { ...TYPE.title, color: COLORS.text },
  playerCount: { ...TYPE.numSm, color: COLORS.textSecondary, marginTop: 3 },
  playerList: { ...TYPE.caption, color: COLORS.textMuted, marginTop: SPACING.xs, lineHeight: 17 },
  emptyTxt: { ...TYPE.caption, color: COLORS.textMuted, paddingVertical: SPACING.xs },
  confirmBtn: {
    backgroundColor: COLORS.primary, height: 54,
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.md,
    ...SHADOW.glow(COLORS.primary),
  },
  confirmBtnTxt: { ...TYPE.button, color: COLORS.onPrimary },
});