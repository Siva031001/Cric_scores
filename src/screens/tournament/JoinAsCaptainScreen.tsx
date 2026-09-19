import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { resolveInviteCode, getTournamentPreview } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';

export default function JoinAsCaptainScreen({ navigation }: any) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { Alert.alert('Error', 'Enter the invite code your organizer shared with you'); return; }
    setLoading(true);
    try {
      const result = await resolveInviteCode(trimmed);
      if (!result) {
        Alert.alert('Invalid Code', 'No tournament found for this invite code. Please check with your organizer.');
        return;
      }
      if (result.status === 'submitted' || result.status === 'approved') {
        Alert.alert('Already Submitted', `The squad for "${result.teamName}" has already been submitted.`);
        return;
      }
      const preview = await getTournamentPreview(result.tournamentId);
      navigation.navigate('TournamentInvitePreview', {
        preview,
        inviteResult: result,
      });
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Could not verify invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={s.container}>
      <Header title="Join as Team Captain" onBack={() => navigation.goBack()} />
      {/* Soft colour blobs behind the form — same plain tinted-View technique
          used elsewhere in the app, purely decorative. Starts below the
          header's own opaque background so it never overlaps the title. */}
      <View pointerEvents="none" style={s.heroBlobWrap}>
        <View style={[s.heroBlob, { backgroundColor: COLORS.live, top: -50, left: -40 }]} />
        <View style={[s.heroBlob, { backgroundColor: COLORS.purple, top: -20, right: -60 }]} />
      </View>
      <View style={s.content}>
        <View style={s.logoBlock}>
          <View style={s.logoRing}>
            <AppIcon emoji="🏏" size={40} color={COLORS.primary} />
          </View>
          <Text style={s.logoText}>CricketScorer</Text>
        </View>
        <Text style={s.label}>Enter the invite code shared by your tournament organizer</Text>
        <TextInput
          style={s.input}
          placeholder="e.g. A7X92K"
          placeholderTextColor={COLORS.textMuted}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={10}
        />
        <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  // Starts at ~ the header's own height (paddingTop 50 + paddingBottom +
  // title line) so the blobs never draw over the header's title/back button.
  heroBlobWrap: { position: 'absolute', top: 95, left: 0, right: 0, height: 150, overflow: 'hidden' },
  heroBlob: { position: 'absolute', width: 170, height: 170, borderRadius: 85, opacity: 0.14 },
  content: { padding: SPACING.lg },
  logoBlock: { alignItems: 'center', marginBottom: SPACING.xl, marginTop: SPACING.sm },
  // Tinted ring around the mark: gives the bare glyph a surface to sit on so
  // the top of the form reads as branded rather than as a stray icon.
  logoRing: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1, borderColor: COLORS.primary + '55',
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW.glow(COLORS.primary),
  },
  logoText: { ...TYPE.h2, color: COLORS.text, marginTop: SPACING.sm },
  label: { ...TYPE.body, color: COLORS.textSecondary, marginBottom: SPACING.md, lineHeight: 20, textAlign: 'center' },
  // Code field: tabular figures + wide tracking so a 6-character code reads as
  // discrete characters, which is how people check one against a message.
  input: {
    backgroundColor: COLORS.card2, color: COLORS.text,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderRadius: RADIUS.lg, fontSize: 22, fontWeight: '800',
    fontVariant: ['tabular-nums'],
    borderWidth: 1, borderColor: COLORS.border,
    textAlign: 'center', letterSpacing: 6,
    marginBottom: SPACING.md,
    ...SHADOW.sm,
  },
  btn: {
    backgroundColor: COLORS.primary, height: 54,
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    ...SHADOW.glow(COLORS.primary),
  },
  btnTxt: { ...TYPE.button, color: COLORS.onPrimary },
});