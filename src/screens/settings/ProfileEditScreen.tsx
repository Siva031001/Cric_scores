import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator, Modal, FlatList } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { getUserProfile, saveUserProfile } from '../../utils/firebase';
import { PlayerRole, BattingStyle } from '../../types/cricket';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ROLES: PlayerRole[] = ['Batter', 'Bowler', 'Wicket Keeper', 'All Rounder'];
const BATTING_STYLES: BattingStyle[] = ['Right Hand', 'Left Hand'];
const COUNTRIES = ['India','Australia','England','Pakistan','South Africa','New Zealand','West Indies','Sri Lanka','Bangladesh','Zimbabwe','Afghanistan','Ireland','Netherlands','Scotland','UAE','Nepal','USA','Canada','Kenya','Singapore'];

export default function ProfileEditScreen({ navigation }: any) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<PlayerRole>('Batter');
  const [battingStyle, setBattingStyle] = useState<BattingStyle>('Right Hand');
  const [bowlingStyle, setBowlingStyle] = useState('');
  const [country, setCountry] = useState('India');
  const [photo, setPhoto] = useState<string | null>(null);
  const [showCountry, setShowCountry] = useState(false);

  useEffect(() => {
  (async () => {
    const loginPhone = await AsyncStorage.getItem('cricketscorer_phone');
    const p = await getUserProfile();
    if (p) {
      setName(p.name ?? '');
      setEmail(p.email ?? '');
      setRole(p.role ?? 'Batter');
      setBattingStyle(p.battingStyle ?? 'Right Hand');
      setBowlingStyle(p.bowlingStyle ?? '');
      setCountry(p.country ?? 'India');
      setPhoto(p.photo ?? null);
    }
    // Mobile number always reflects the number used to log in — not
    // editable here, since it's the account identity used by pinAuth.
    setMobile(loginPhone ?? p?.mobile ?? '');
    setLoading(false);
  })();
  }, []);

  const pickPhoto = () => {
    Alert.alert('Profile Photo', 'Choose source', [
      { text: 'Camera', onPress: () => launchCamera({ mediaType: 'photo', quality: 0.5 }, res => { if (res.assets?.[0]?.uri) setPhoto(res.assets[0].uri); }) },
      { text: 'Gallery', onPress: () => launchImageLibrary({ mediaType: 'photo', quality: 0.5 }, res => { if (res.assets?.[0]?.uri) setPhoto(res.assets[0].uri); }) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('Error', 'Please enter your name'); return; }
    setSaving(true);
    try {
      await saveUserProfile({ name: name.trim(), mobile: mobile.trim(), email: email.trim(), role, battingStyle, bowlingStyle: bowlingStyle.trim(), country: country.trim(), photo: photo ?? undefined });
      Alert.alert('Saved!', 'Profile updated successfully', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e: any) { Alert.alert('Error', e?.message); }
    finally { setSaving(false); }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.primary} /></View>;

  return (
    <View style={styles.container}>
      <ScrollView>
        <Header title="Edit Profile" onBack={() => navigation.goBack()} rightText="Save" onRight={handleSave} />
        <View style={styles.photoSection}>
          <TouchableOpacity style={styles.photoCircle} onPress={pickPhoto}>
            {photo ? <Image source={{ uri: photo }} style={styles.photoImg} /> : (
              <View style={styles.photoPlaceholder}>
                <AppIcon emoji="📷" size={26} color={COLORS.textSecondary} />
                <Text style={styles.photoLabel}>Add Photo</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={pickPhoto} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppIcon emoji="📷" size={14} color={COLORS.primary} />
            <Text style={styles.changePhoto}>Change Photo</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.form}>
          <Text style={styles.label}>Full Name *</Text>
          <TextInput style={styles.input} placeholder="Enter your name" placeholderTextColor={COLORS.textMuted} value={name} onChangeText={setName} />
          <Text style={styles.label}>Mobile Number</Text>
            <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card2 }]}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 15, flex: 1 }}>{mobile ? '+91 ' + mobile : 'Not set'}</Text>
          <AppIcon emoji="🔒" size={14} color={COLORS.textMuted} />
          </View>
          <Text style={styles.label}>Email ID</Text>
          <TextInput style={styles.input} placeholder="Enter email address" placeholderTextColor={COLORS.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Text style={styles.label}>Playing Role</Text>
          <View style={styles.chipRow}>
            {ROLES.map(r => (
              <TouchableOpacity key={r} style={[styles.chip, role === r && styles.chipActive]} onPress={() => setRole(r)}>
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Batting Style</Text>
          <View style={styles.chipRow}>
            {BATTING_STYLES.map(s => (
              <TouchableOpacity key={s} style={[styles.chip, battingStyle === s && styles.chipActive]} onPress={() => setBattingStyle(s)}>
                <Text style={[styles.chipText, battingStyle === s && styles.chipTextActive]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.label}>Bowling Style</Text>
          <TextInput style={styles.input} placeholder="e.g. Right Arm Fast, Left Arm Spin..." placeholderTextColor={COLORS.textMuted} value={bowlingStyle} onChangeText={setBowlingStyle} />
          <Text style={styles.label}>Country</Text>
          <TouchableOpacity style={styles.dropdownBtn} onPress={() => setShowCountry(true)}>
            <Text style={styles.dropdownText}>{country}</Text>
            <AppIcon emoji="▼" size={12} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 50 }} />
      </ScrollView>

      <Modal visible={showCountry} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Select Country</Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={item => item}
              style={{ maxHeight: 400 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.countryRow, country === item && styles.countryRowActive]}
                  onPress={() => { setCountry(item); setShowCountry(false); }}>
                  <Text style={[styles.countryText, country === item && styles.countryTextActive]}>{item}</Text>
                  {country === item && <AppIcon emoji="✓" size={16} color={COLORS.primary} />}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.modalClose} onPress={() => setShowCountry(false)}>
              <Text style={styles.modalCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background },
  photoSection: { alignItems: 'center', paddingVertical: 20 },
  photoCircle: { width: 100, height: 100, borderRadius: 50, overflow: 'hidden', borderWidth: 3, borderColor: COLORS.primary, marginBottom: 10 },
  photoImg: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, backgroundColor: COLORS.card, justifyContent: 'center', alignItems: 'center' },
  photoPlus: { fontSize: 28 },
  photoLabel: { color: COLORS.textSecondary, fontSize: 11, marginTop: 4 },
  changePhoto: { color: COLORS.primary, fontSize: 14, fontWeight: 'bold' },
  form: { paddingHorizontal: SPACING.lg },
  label: { color: COLORS.primary, fontSize: 13, fontWeight: 'bold', marginBottom: 8, marginTop: 5 },
  input: { backgroundColor: COLORS.card, color: COLORS.text, padding: 14, borderRadius: RADIUS.md, marginBottom: 15, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.round, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { color: COLORS.textSecondary, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  dropdownBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.card, padding: 14, borderRadius: RADIUS.md, marginBottom: 15, borderWidth: 1, borderColor: COLORS.border },
  dropdownText: { color: COLORS.text, fontSize: 15 },
  dropdownArrow: { color: COLORS.primary, fontSize: 12 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 16, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 10 },
  saveBtnDisabled: { backgroundColor: COLORS.textMuted },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.card, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: SPACING.lg },
  modalTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center' },
  countryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  countryRowActive: { backgroundColor: COLORS.primary + '22' },
  countryText: { color: COLORS.text, fontSize: 15 },
  countryTextActive: { color: COLORS.primary, fontWeight: 'bold' },
  modalClose: { backgroundColor: COLORS.card2, padding: 14, borderRadius: RADIUS.md, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: COLORS.border },
  modalCloseText: { color: COLORS.text, fontSize: 15, fontWeight: 'bold' },
});