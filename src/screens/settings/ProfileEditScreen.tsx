import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image, ActivityIndicator, Modal, FlatList } from 'react-native';
import { launchImageLibrary, launchCamera } from 'react-native-image-picker';
import { getUserProfile, saveUserProfile, getCurrentUser, uploadLocalImageToStorage, syncProfileToLinkedPlayer, getMyLinkedPlayerId } from '../../utils/firebase';
import database from '@react-native-firebase/database';
import { PlayerRole, BattingStyle } from '../../types/cricket';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';
import Card from '../../components/Card';
import Button from '../../components/Button';
import SectionHeader from '../../components/SectionHeader';
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
    // A user who just registered has no profile yet, but an organiser may
    // already have added their phone number to a team — in which case their
    // name (and possibly role) is sitting on the linked players/{id} record.
    // Seed the form from it rather than showing a blank Name field.
    if (!p?.name) {
      try {
        const linkedId = await getMyLinkedPlayerId();
        if (linkedId) {
          const snap = await database().ref('players/' + linkedId).once('value');
          const master = snap.val();
          if (master?.name) setName(master.name);
          if (!p?.role && master?.role) setRole(master.role);
          if (!p?.battingStyle && master?.battingStyle) setBattingStyle(master.battingStyle);
          if (!p?.bowlingStyle && master?.bowlingStyle) setBowlingStyle(master.bowlingStyle);
          if (!p?.photo && master?.photo) setPhoto(master.photo);
        }
      } catch (e) { console.warn('Could not prefill from linked player record:', e); }
    }
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
      let photoUrl = photo ?? undefined;
      if (photo && !photo.startsWith('http')) {
        const user = getCurrentUser();
        if (user) photoUrl = await uploadLocalImageToStorage(photo, `profile_photos/${user.uid}.jpg`);
      }
      await saveUserProfile({ name: name.trim(), mobile: mobile.trim(), email: email.trim(), role, battingStyle, bowlingStyle: bowlingStyle.trim(), country: country.trim(), photo: photoUrl });
      // Mirror the details onto the shared players/{id} record so teams,
      // scorecards and other users see this person's real name, role and
      // photo — the profile node itself is readable only by its owner.
      // A failure here must not block the save the user just made.
      try {
        await syncProfileToLinkedPlayer({ name: name.trim(), role, battingStyle, bowlingStyle: bowlingStyle.trim(), photo: photoUrl ?? null });
      } catch (e) { console.warn('Profile -> player sync failed:', e); }
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
          <View style={styles.avatarWrap}>
            {/* Two-tone tinted blobs behind the avatar ring — same layered
                "tint" technique StatCard uses, built from plain absolutely
                positioned Views since there's no gradient lib. */}
            <View pointerEvents="none" style={styles.avatarGlowA} />
            <View pointerEvents="none" style={styles.avatarGlowB} />
            <TouchableOpacity style={styles.photoCircle} onPress={pickPhoto}>
              {photo ? <Image source={{ uri: photo }} style={styles.photoImg} /> : (
                <View style={styles.photoPlaceholder}>
                  <AppIcon emoji="📷" size={26} color={COLORS.textSecondary} />
                  <Text style={styles.photoLabel}>Add Photo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={pickPhoto} style={styles.changePhotoBtn}>
            <AppIcon emoji="📷" size={14} color={COLORS.primary} />
            <Text style={styles.changePhoto}>Change Photo</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.form}>
          <SectionHeader title="Personal Details" />
          <Card tone="base" elevation="md" style={styles.group}>
            <Text style={styles.label}>Full Name *</Text>
            <TextInput style={styles.input} placeholder="Enter your name" placeholderTextColor={COLORS.textMuted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Mobile Number</Text>
            <View style={[styles.input, styles.lockedRow]}>
              <Text style={styles.lockedText}>{mobile ? '+91 ' + mobile : 'Not set'}</Text>
              <AppIcon emoji="🔒" size={14} color={COLORS.textMuted} />
            </View>
            <Text style={styles.label}>Email ID</Text>
            <TextInput style={[styles.input, styles.inputLast]} placeholder="Enter email address" placeholderTextColor={COLORS.textMuted} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </Card>

          <SectionHeader title="Playing Details" />
          <Card tone="base" elevation="md" style={styles.group}>
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
          </Card>

          <Button
            label={saving ? 'Saving...' : 'Save Profile'}
            onPress={handleSave}
            disabled={saving}
            variant="primary"
            size="lg"
            full
            style={styles.saveBtn}
          />
        </View>
        <View style={{ height: 50 }} />
      </ScrollView>

      <Modal visible={showCountry} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />
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
  photoSection: { alignItems: 'center', paddingVertical: SPACING.lg },
  // Wrapper sized exactly to the ring, so the decorative blobs behind it can
  // be positioned with simple negative offsets instead of guessing at the
  // section's padding.
  avatarWrap: {
    width: 108, height: 108, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.sm,
  },
  // Layered two-tone tinted blobs (same technique as StatCard's `tint`) —
  // purely decorative, sit behind the ring since they're earlier in the JSX.
  avatarGlowA: {
    position: 'absolute', top: -16, left: -16, width: 140, height: 140,
    borderRadius: 70, backgroundColor: COLORS.primary, opacity: 0.18,
  },
  avatarGlowB: {
    position: 'absolute', top: -6, left: -6, width: 120, height: 120,
    borderRadius: 60, backgroundColor: COLORS.primaryLight, opacity: 0.16,
  },
  // Ring + glow, so the avatar reads as the subject of the screen rather than
  // a cropped square.
  photoCircle: {
    width: 108, height: 108, borderRadius: 54, overflow: 'hidden',
    borderWidth: 3, borderColor: COLORS.primary,
    ...SHADOW.glow(COLORS.primary),
  },
  photoImg: { width: '100%', height: '100%' },
  photoPlaceholder: { flex: 1, backgroundColor: COLORS.card2, justifyContent: 'center', alignItems: 'center' },
  photoLabel: { ...TYPE.label, fontSize: 9, color: COLORS.textSecondary, marginTop: 4 },
  // The "Change Photo" affordance is a tinted pill, not bare text — it used to
  // be indistinguishable from a caption.
  changePhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderRadius: RADIUS.round, backgroundColor: COLORS.primarySoft,
  },
  changePhoto: { ...TYPE.bodyStrong, color: COLORS.primary },
  form: { paddingHorizontal: SPACING.lg },
  // Related fields grouped on one elevated surface per section.
  group: { padding: SPACING.md, marginBottom: SPACING.lg },
  label: { ...TYPE.label, color: COLORS.textSecondary, marginBottom: SPACING.sm },
  input: {
    backgroundColor: COLORS.card2, color: COLORS.text,
    ...TYPE.body, fontSize: 15,
    paddingHorizontal: SPACING.md, paddingVertical: 15,
    borderRadius: RADIUS.lg, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  inputLast: { marginBottom: 0 },
  // Read-only identity field: same shape as an input so the form stays aligned,
  // with the lock icon carrying the "not editable" message.
  lockedRow: { flexDirection: 'row', alignItems: 'center' },
  lockedText: { ...TYPE.body, fontSize: 15, color: COLORS.textSecondary, flex: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  chip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.round,
    backgroundColor: COLORS.card2, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, ...SHADOW.glow(COLORS.primary) },
  chipText: { ...TYPE.bodyStrong, fontSize: 13, color: COLORS.textSecondary },
  // Dark ink on the green chip: white on this green is barely legible.
  chipTextActive: { color: COLORS.background },
  dropdownBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.card2, paddingHorizontal: SPACING.md, paddingVertical: 15,
    borderRadius: RADIUS.lg, borderWidth: 1, borderColor: COLORS.border,
  },
  dropdownText: { ...TYPE.body, fontSize: 15, color: COLORS.text },
  dropdownArrow: { color: COLORS.primary, fontSize: 12 },
  saveBtn: { marginTop: SPACING.xs },
  modalOverlay: { flex: 1, backgroundColor: COLORS.scrim, justifyContent: 'flex-end' },
  // Highest surface level, plus a grabber, so the sheet reads as a layer above
  // the form rather than a panel welded to the bottom.
  modal: {
    backgroundColor: COLORS.surface3,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.edgeHighlight,
    ...SHADOW.lg,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: SPACING.md,
  },
  modalTitle: { ...TYPE.h2, color: COLORS.text, marginBottom: SPACING.md, textAlign: 'center' },
  countryRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderSoft,
  },
  countryRowActive: { backgroundColor: COLORS.primarySoft },
  countryText: { ...TYPE.body, fontSize: 15, color: COLORS.text },
  countryTextActive: { ...TYPE.bodyStrong, fontSize: 15, color: COLORS.primary },
  modalClose: {
    backgroundColor: COLORS.card2, height: 48, borderRadius: RADIUS.md,
    alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  modalCloseText: { ...TYPE.button, color: COLORS.text },
});