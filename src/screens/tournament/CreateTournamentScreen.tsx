import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { createTournament, uploadLocalImageToStorage, validateTournamentDates } from '../../utils/firebase';
import { BallType } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

const getTodayString = () => { const d = new Date(); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0')+'/'+d.getFullYear(); };
const BALL_TYPES: BallType[] = ['Leather Ball', 'Tennis Ball', 'Turf'];
const FORMAT_OPTIONS = ['6 Overs', '8 Overs', '20 Overs', '50 Overs', 'Others'];

export default function CreateTournamentScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [venue, setVenue] = useState('');
  const [startDate, setStartDate] = useState(getTodayString());
  const [endDate, setEndDate] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [ballType, setBallType] = useState<BallType>('Tennis Ball');
  const [format, setFormat] = useState('20 Overs');
  const [customFormat, setCustomFormat] = useState('');
  const [saving, setSaving] = useState(false);
  const [tournamentFormat, setTournamentFormat] = useState<'League'|'Knockout'|'Pool + Knockout'>('League');

  // Mirrors pickLogo in CreateTeamScreen — same library, same quality setting.
  const pickBanner = () => {
    Alert.alert('Tournament Photo', 'Choose photo source', [
      { text: 'Camera', onPress: () => launchCamera({ mediaType: 'photo', quality: 0.5 }, res => { if (res.assets?.[0]?.uri) setBanner(res.assets[0].uri); }) },
      { text: 'Gallery', onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.5 }, res => { if (res.assets?.[0]?.uri) setBanner(res.assets[0].uri); }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleCreate = async () => {
    if (!name.trim() || !orgName.trim()) { Alert.alert('Error', 'Enter tournament name and organisation name'); return; }
    const dateError = validateTournamentDates(startDate, endDate);
    if (dateError) { Alert.alert('Invalid Dates', dateError); return; }
    const finalFormat = format === 'Others' ? customFormat || 'Custom' : format;
    setSaving(true);
    try {
      // The tournament id doesn't exist until createTournament generates it,
      // so the banner can't use an id-keyed storage path here. Use the
      // timestamp+random fallback, the same convention CreateTeamScreen uses
      // for a not-yet-saved team.
      let bannerUrl: string | null = null;
      if (banner && !/^https?:\/\//.test(banner)) {
        bannerUrl = await uploadLocalImageToStorage(banner, `tournament_banners/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`);
      } else if (banner) {
        bannerUrl = banner;
      }
      const id = await createTournament({
        name: name.trim(),
        organisationName: orgName.trim(),
        venue: venue.trim(),
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        // Explicit null, never undefined — createTournament uses .set() and an
        // undefined value in that payload is not safe with RN Firebase.
        bannerUrl: bannerUrl ?? null,
        ballType,
        format: finalFormat,
        tournamentFormat,
        // Teams and matches are added after creation, from the tournament's
        // own Teams / Matches / Pools tabs. Kept as explicit empty arrays so
        // the shape stays consistent (RTDB drops empty arrays on write, and
        // every downstream reader already guards with `?? []`).
        teams: [],
        matches: [],
        status: 'upcoming',
      });
      Alert.alert('Created!', 'Tournament ID: ' + id, [{ text: 'View', onPress: () => navigation.replace('TournamentDetail', { tournamentId: id }) }]);
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  return (
    <View style={styles.container}>
      <Header title="Create Tournament" onBack={() => navigation.goBack()} />

      <ScrollView style={styles.scroll}>
        <View style={styles.form}>
          <TouchableOpacity style={styles.bannerBox} onPress={pickBanner}>
            {banner ? (
              <Image source={{ uri: banner }} style={styles.bannerImg} resizeMode="cover" />
            ) : (
              <View style={styles.bannerPlaceholder}>
                <Text style={styles.bannerPlaceholderIcon}>+</Text>
                <Text style={styles.bannerLabel}>Add Tournament Photo</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.label}>Tournament Name *</Text>
          <TextInput style={styles.input} placeholder="Tournament name" placeholderTextColor={COLORS.textMuted} value={name} onChangeText={setName} />
          <Text style={styles.label}>Organisation Name *</Text>
          <TextInput style={styles.input} placeholder="Club / Organisation" placeholderTextColor={COLORS.textMuted} value={orgName} onChangeText={setOrgName} />
          <Text style={styles.label}>Venue</Text>
          <TextInput style={styles.input} placeholder="Main venue" placeholderTextColor={COLORS.textMuted} value={venue} onChangeText={setVenue} />
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Start Date *</Text>
              <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor={COLORS.textMuted} value={startDate} onChangeText={setStartDate} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>End Date *</Text>
              <TextInput style={styles.input} placeholder="DD/MM/YYYY" placeholderTextColor={COLORS.textMuted} value={endDate} onChangeText={setEndDate} />
            </View>
          </View>
          <Text style={styles.dateHint}>These dates set whether the tournament shows as Upcoming, Live or Completed on the home screen.</Text>
          <Text style={styles.label}>Ball Type</Text>
          <View style={styles.chipRow}>
            {BALL_TYPES.map(b => (
              <TouchableOpacity key={b} style={[styles.chip, ballType === b && styles.chipActive]} onPress={() => setBallType(b)}>
                <Text style={[styles.chipText, ballType === b && styles.chipTextActive]}>
                  {b === 'Leather Ball' ? 'Red Ball - ' : b === 'Turf' ? 'Turf - ' : 'Tennis Ball - '}{b}
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
          {tournamentFormat === 'Pool + Knockout' && (
            <Text style={styles.dateHint}>
              You'll set up pools, assign teams, and configure qualification after creating the tournament — from the new "Pools" tab.
            </Text>
          )}
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
          <Text style={styles.dateHint}>Add teams and schedule matches from the tournament's own tabs once it's created.</Text>
          <TouchableOpacity style={[styles.nextBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving}>
            <Text style={styles.nextBtnText}>{saving ? 'Creating...' : 'Create Tournament'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  bannerBox: { height: 140, borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card },
  bannerImg: { width: '100%', height: '100%' },
  bannerPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4 },
  bannerPlaceholderIcon: { color: COLORS.primary, fontSize: 30, fontWeight: 'bold' },
  bannerLabel: { color: COLORS.textSecondary, fontSize: 12 },
  nextBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 10 },
  nextBtnText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
