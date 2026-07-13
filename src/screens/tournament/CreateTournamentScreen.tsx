import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Modal } from 'react-native';
import { createTournament } from '../../utils/firebase';
import { BallType, TournamentTeam, TournamentMatch } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';

const getTodayString = () => { const d = new Date(); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); };
const BALL_TYPES: BallType[] = ['Leather Ball', 'Tennis Ball'];
const FORMAT_OPTIONS = ['6 Overs', '8 Overs', '20 Overs', '50 Overs', 'Others'];

export default function CreateTournamentScreen({ navigation }: any) {
  const [step, setStep] = useState<1|2|3>(1);
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [venue, setVenue] = useState('');
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState('');
  const [ballType, setBallType] = useState<BallType>('Tennis Ball');
  const [format, setFormat] = useState('20 Overs');
  const [customFormat, setCustomFormat] = useState('');
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchTeam1, setMatchTeam1] = useState('');
  const [matchTeam2, setMatchTeam2] = useState('');
  const [matchDate, setMatchDate] = useState(getTodayString());
  const [matchTime, setMatchTime] = useState('');
  const [matchVenue, setMatchVenue] = useState('');
  const [tournamentFormat, setTournamentFormat] = useState<'League'|'Knockout'|'Pool + Knockout'>('League');

  const addTeam = () => {
    if (!newTeamName.trim()) return;
    setTeams([...teams, { teamId: Date.now().toString(), teamName: newTeamName.trim(), played: 0, won: 0, lost: 0, tied: 0, nrr: 0, points: 0 }]);
    setNewTeamName(''); setShowTeamModal(false);
  };

  const addMatch = () => {
    if (!matchTeam1 || !matchTeam2) { Alert.alert('Error', 'Select both teams'); return; }
    if (matchTeam1 === matchTeam2) { Alert.alert('Error', 'Teams must be different'); return; }
    if (matchDate) {
      const parts = matchDate.split('/');
      if (parts.length === 3) {
        const entered = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        if (entered < today) { Alert.alert('Invalid Date', 'Cannot schedule in the past'); return; }
      }
    }
    setMatches([...matches, { id: Date.now().toString(), team1: matchTeam1, team2: matchTeam2, date: matchDate || 'TBD', time: matchTime || 'TBD', venue: matchVenue || venue || 'TBD', status: 'scheduled' }]);
    setMatchTeam1(''); setMatchTeam2(''); setMatchDate(getTodayString());
    setMatchTime(''); setMatchVenue(''); setShowMatchModal(false);
  };

  const handleCreate = async () => {
    if (!name.trim() || !orgName.trim()) { Alert.alert('Error', 'Enter tournament name and organisation name'); return; }
    const finalFormat = format === 'Others' ? customFormat || 'Custom' : format;
    setSaving(true);
    try {
      const id = await createTournament({ name: name.trim(), organisationName: orgName.trim(), venue: venue.trim(), startDate: startDate.trim(), endDate: endDate.trim(), ballType, format: finalFormat, teams, matches, status: 'upcoming' });
      Alert.alert('Created!', 'Tournament ID: ' + id, [{ text: 'View', onPress: () => navigation.replace('TournamentDetail', { tournamentId: id }) }]);
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <Header title="Create Tournament" onBack={() => step > 1 ? setStep(step === 3 ? 2 : 1) : navigation.goBack()} />

      <View style={styles.steps}>
        {[1, 2, 3].map(s => (
          <React.Fragment key={s}>
            <View style={styles.stepItem}>
              <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
                <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>{s}</Text>
              </View>
              <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]}>
                {s === 1 ? 'Details' : s === 2 ? 'Teams' : 'Schedule'}
              </Text>
            </View>
            {s < 3 && <View style={[styles.stepLine, step > s && styles.stepLineActive]} />}
          </React.Fragment>
        ))}
      </View>

      <ScrollView style={styles.scroll}>
        {step === 1 && (
          <View style={styles.form}>
            <Text style={styles.label}>Tournament Name *</Text>
            <TextInput style={styles.input} placeholder="Tournament name" placeholderTextColor={COLORS.textMuted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Organisation Name *</Text>
            <TextInput style={styles.input} placeholder="Club / Organisation" placeholderTextColor={COLORS.textMuted} value={orgName} onChangeText={setOrgName} />
            <Text style={styles.label}>Venue</Text>
            <TextInput style={styles.input} placeholder="Main venue" placeholderTextColor={COLORS.textMuted} value={venue} onChangeText={setVenue} />
            <View style={styles.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor={COLORS.textMuted} value={startDate} onChangeText={setStartDate} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>End Date</Text>
                <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor={COLORS.textMuted} value={endDate} onChangeText={setEndDate} />
              </View>
            </View>
            <Text style={styles.dateHint}>Only today or future dates allowed</Text>
            <Text style={styles.label}>Ball Type</Text>
            <View style={styles.chipRow}>
              {BALL_TYPES.map(b => (
                <TouchableOpacity key={b} style={[styles.chip, ballType === b && styles.chipActive]} onPress={() => setBallType(b)}>
                  <Text style={[styles.chipText, ballType === b && styles.chipTextActive]}>
                    {b === 'Leather Ball' ? 'Red Ball - ' : 'Tennis Ball - '}{b}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Tournament Format *</Text>
<View style={styles.chipRow}>
  {(['League', 'Knockout', 'Pool + Knockout'] as const).map(f => (
    <TouchableOpacity key={f} style={[styles.chip, tournamentFormat === f && styles.chipActive]} onPress={() => setTournamentFormat(f)}>
      <Text style={[styles.chipText, tournamentFormat === f && styles.chipTextActive]}>{f}</Text>
    </TouchableOpacity>
  ))}
</View>
            <Text style={styles.label}>Match Format (Overs)</Text>
            <View style={styles.chipRow}>
              {FORMAT_OPTIONS.map(f => (
                <TouchableOpacity key={f} style={[styles.chip, format === f && styles.chipActive]} onPress={() => setFormat(f)}>
                  <Text style={[styles.chipText, format === f && styles.chipTextActive]}>{f}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {format === 'Others' && (
              <TextInput style={styles.input} placeholder="Enter overs e.g. 15" placeholderTextColor={COLORS.textMuted} value={customFormat} onChangeText={setCustomFormat} keyboardType="numeric" />
            )}
            <TouchableOpacity style={styles.nextBtn} onPress={async () => {
  if (!name.trim() || !orgName.trim()) { Alert.alert('Error', 'Fill required fields'); return; }
  const finalFormat = format === 'Others' ? customFormat || 'Custom' : format;
  setSaving(true);
  try {
    const id = await createTournament({
      name: name.trim(), organisationName: orgName.trim(), venue: venue.trim(),
      startDate: startDate.trim(), endDate: endDate.trim(), ballType, format: finalFormat,
      tournamentFormat,
      teams: [], matches: [], status: 'upcoming',
    });
    navigation.replace('TournamentDetail', { tournamentId: id });
  } catch (e: any) {
    Alert.alert('Error', e?.message);
  } finally {
    setSaving(false);
  }
}} disabled={saving}>
  <Text style={styles.nextBtnText}>{saving ? 'Creating...' : 'Create Tournament'}</Text>
</TouchableOpacity>
          </View>
        )}

        {step === 2 && (
          <View style={styles.form}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Teams ({teams.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowTeamModal(true)}>
                <Text style={styles.addBtnText}>+ Add Team</Text>
              </TouchableOpacity>
            </View>
            {teams.length === 0 ? (
              <View style={styles.emptyBox}>
                <AppIcon emoji="👥" size={40} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>Add at least 2 teams</Text>
              </View>
            ) : (
              teams.map((team, i) => (
                <View key={team.teamId} style={styles.teamRow}>
                  <View style={styles.teamNum}><Text style={styles.teamNumText}>{i + 1}</Text></View>
                  <Text style={styles.teamName}>{team.teamName}</Text>
                  <TouchableOpacity onPress={() => setTeams(teams.filter(t => t.teamId !== team.teamId))}>
                    <Text style={styles.removeBtn}>X</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={styles.stepBtns}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(1)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nextBtn, { flex: 2, marginTop: 0 }]} onPress={() => { if (teams.length < 2) { Alert.alert('Error', 'Add at least 2 teams'); return; } setStep(3); }}>
                <Text style={styles.nextBtnText}>Next: Schedule</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 3 && (
          <View style={styles.form}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Matches ({matches.length})</Text>
              <TouchableOpacity style={styles.addBtn} onPress={() => setShowMatchModal(true)}>
                <Text style={styles.addBtnText}>+ Schedule</Text>
              </TouchableOpacity>
            </View>
            {matches.length === 0 ? (
              <View style={styles.emptyBox}>
                <AppIcon emoji="📅" size={40} color={COLORS.textMuted} />
                <Text style={styles.emptyText}>No matches scheduled yet</Text>
              </View>
            ) : (
              matches.map(m => (
                <View key={m.id} style={styles.matchRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.matchTeams}>{m.team1} vs {m.team2}</Text>
                    <Text style={styles.matchMeta}>{m.date} {m.time} - {m.venue}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setMatches(matches.filter(x => x.id !== m.id))}>
                    <Text style={styles.removeBtn}>X</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <View style={styles.stepBtns}>
              <TouchableOpacity style={styles.backBtn} onPress={() => setStep(2)}>
                <Text style={styles.backBtnText}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.createBtn, saving && { backgroundColor: COLORS.textMuted }]} onPress={handleCreate} disabled={saving}>
                <Text style={styles.createBtnText}>{saving ? 'Creating...' : 'Create Tournament'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>

      <Modal visible={showTeamModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Add Team</Text>
            <TextInput style={styles.modalInput} placeholder="Team name" placeholderTextColor={COLORS.textMuted} value={newTeamName} onChangeText={setNewTeamName} autoFocus />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowTeamModal(false); setNewTeamName(''); }}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalAddBtn} onPress={addTeam}>
                <Text style={styles.modalAddText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showMatchModal} transparent animationType="slide">
        <ScrollView>
          <View style={styles.modalOverlay}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>Schedule Match</Text>
              <Text style={styles.modalLabel}>Team 1 *</Text>
              <View style={styles.teamSelectRow}>
                {teams.map(t => (
                  <TouchableOpacity key={t.teamId} style={[styles.teamSelectBtn, matchTeam1 === t.teamName && styles.teamSelectBtnActive]} onPress={() => setMatchTeam1(t.teamName)}>
                    <Text style={[styles.teamSelectText, matchTeam1 === t.teamName && styles.teamSelectTextActive]}>{t.teamName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalLabel}>Team 2 *</Text>
              <View style={styles.teamSelectRow}>
                {teams.map(t => (
                  <TouchableOpacity key={t.teamId} style={[styles.teamSelectBtn, matchTeam2 === t.teamName && styles.teamSelectBtnActive]} onPress={() => setMatchTeam2(t.teamName)}>
                    <Text style={[styles.teamSelectText, matchTeam2 === t.teamName && styles.teamSelectTextActive]}>{t.teamName}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.modalLabel}>Date (DD/MM/YYYY)</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 20/03/2026" placeholderTextColor={COLORS.textMuted} value={matchDate} onChangeText={setMatchDate} />
              <Text style={styles.modalLabel}>Time</Text>
              <TextInput style={styles.modalInput} placeholder="e.g. 10:00 AM" placeholderTextColor={COLORS.textMuted} value={matchTime} onChangeText={setMatchTime} />
              <Text style={styles.modalLabel}>Venue (optional)</Text>
              <TextInput style={styles.modalInput} placeholder="Match venue" placeholderTextColor={COLORS.textMuted} value={matchVenue} onChangeText={setMatchVenue} />
              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowMatchModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalAddBtn} onPress={addMatch}>
                  <Text style={styles.modalAddText}>Schedule</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  steps: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15, paddingHorizontal: SPACING.lg },
  stepItem: { alignItems: 'center', gap: 4 },
  stepCircle: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.border },
  stepCircleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepNum: { color: COLORS.textSecondary, fontSize: 12, fontWeight: 'bold' },
  stepNumActive: { color: '#fff' },
  stepLabel: { color: COLORS.textSecondary, fontSize: 10 },
  stepLabelActive: { color: COLORS.primary, fontWeight: 'bold' },
  stepLine: { width: 30, height: 2, backgroundColor: COLORS.border, marginHorizontal: 6, marginBottom: 15 },
  stepLineActive: { backgroundColor: COLORS.primary },
  scroll: { flex: 1 },
  form: { padding: SPACING.lg },
  label: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 8, marginTop: 5 },
  input: { backgroundColor: COLORS.card, color: COLORS.text, padding: 14, borderRadius: RADIUS.md, marginBottom: 15, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  dateRow: { flexDirection: 'row', gap: 12 },
  dateHint: { color: COLORS.textSecondary, fontSize: 11, marginTop: -10, marginBottom: 15 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.round, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontWeight: 'bold' },
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.round },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyIcon: { fontSize: 40, marginBottom: 10 },
  emptyText: { color: COLORS.textSecondary, fontSize: 14 },
  teamRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border, gap: 12 },
  teamNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  teamNumText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  teamName: { color: COLORS.text, fontSize: 15, flex: 1 },
  removeBtn: { color: COLORS.red, fontSize: 16, fontWeight: 'bold', paddingHorizontal: 8, paddingVertical: 4 },
  matchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: RADIUS.md, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: COLORS.border },
  matchTeams: { color: COLORS.text, fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  matchMeta: { color: COLORS.textSecondary, fontSize: 12 },
  stepBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  backBtn: { flex: 1, backgroundColor: COLORS.card, padding: 14, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  backBtnText: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  nextBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 10 },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  createBtn: { flex: 2, backgroundColor: COLORS.yellow, padding: 14, borderRadius: RADIUS.md, alignItems: 'center' },
  createBtnText: { color: '#000', fontSize: 15, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: SPACING.lg, minHeight: 400 },
  modal: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 15 },
  modalLabel: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 6, marginTop: 8 },
  modalInput: { backgroundColor: COLORS.background, color: COLORS.text, padding: 12, borderRadius: RADIUS.md, marginBottom: 8, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  teamSelectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  teamSelectBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.round, backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border },
  teamSelectBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  teamSelectText: { color: COLORS.textSecondary, fontSize: 13 },
  teamSelectTextActive: { color: '#fff', fontWeight: 'bold' },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 15 },
  modalCancelBtn: { flex: 1, backgroundColor: COLORS.card2, padding: 12, borderRadius: RADIUS.md, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  modalCancelText: { color: COLORS.text, fontSize: 14, fontWeight: 'bold' },
  modalAddBtn: { flex: 1, backgroundColor: COLORS.primary, padding: 12, borderRadius: RADIUS.md, alignItems: 'center' },
  modalAddText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
});