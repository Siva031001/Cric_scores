import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { resolveInviteCode, getTournamentPreview } from '../../utils/firebase';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

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
      <View style={s.content}>
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
  content: { padding: SPACING.lg },
  label: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 16, lineHeight: 20 },
  input: { backgroundColor: COLORS.card, color: COLORS.text, padding: 16, borderRadius: RADIUS.md, fontSize: 20, borderWidth: 1, borderColor: COLORS.border, textAlign: 'center', letterSpacing: 4, marginBottom: 16 },
  btn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: RADIUS.md, alignItems: 'center' },
  btnTxt: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});