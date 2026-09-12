import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

export default function TournamentInvitePreviewScreen({ route, navigation }: any) {
  const { preview, inviteResult } = route.params ?? {};
  const otherTeams = (preview?.teams ?? []).filter((team: any) => team.teamName !== inviteResult?.teamName);

  if (!preview) {
    return (
      <View style={s.container}>
        <Header title="Tournament Invite" onBack={() => navigation.goBack()} />
        <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: 40 }}>Tournament not found.</Text>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <Header title="Tournament Invite" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll}>
        <View style={s.card}>
          <Text style={s.tourneyName}>{preview.name}</Text>
          {preview.venue ? <Text style={s.meta}>📍 {preview.venue}</Text> : null}
          <Text style={s.meta}>{preview.startDate} — {preview.endDate}</Text>
          {preview.tournamentFormat ? <Text style={s.meta}>Format: {preview.tournamentFormat}</Text> : null}
        </View>

        <Text style={s.sectionTitle}>You're joining as captain of:</Text>
        <View style={s.card}>
          <Text style={s.teamName}>{inviteResult.teamName}</Text>
        </View>

        <Text style={s.sectionTitle}>Teams already in this tournament ({otherTeams.length})</Text>
        {otherTeams.length === 0 ? (
          <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>No other teams added yet.</Text>
        ) : (
          otherTeams.map((team: any, i: number) => (
            <View key={i} style={s.card}>
              <Text style={s.teamName}>{team.teamName}</Text>
              <Text style={s.meta}>{team.players.length} players</Text>
              {team.players.length > 0 && (
                <Text style={s.playerList}>{team.players.map((p: any) => p.name).join(', ')}</Text>
              )}
            </View>
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
  scroll: { flex: 1, padding: SPACING.lg },
  card: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: COLORS.border },
  tourneyName: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  meta: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 2 },
  sectionTitle: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginTop: 14, marginBottom: 8 },
  teamName: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
  playerList: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  confirmBtn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 16 },
  confirmBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});