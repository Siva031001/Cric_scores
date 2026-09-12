import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { updateMatch } from '../../utils/firebase';
import { STREAM_THEMES } from '../../utils/streamThemes';
import LiveScoreOverlay from '../../components/LiveScoreOverlay';
import { COLORS, RADIUS, SPACING } from '../../constants/theme';
import Header from '../../components/Header';

export default function ThemeSelectorScreen({ route, navigation }: any) {
  const { matchId, match, currentThemeId } = route.params ?? {};

  const handleSelect = async (themeId: string, isPremium: boolean) => {
    // NOTE: this is a client-side-only gate — it just blocks the UI action.
    // Nothing server-side stops a modified/patched client from writing
    // streamThemeId directly. Real enforcement would need a matching
    // server-side check (e.g. a Firebase security rule restricting writes
    // to matches/{matchId}/streamThemeId, or a Cloud Function) once there's
    // an actual entitlement/payment system to check against.
    if (isPremium) {
      Alert.alert(
        'Premium Theme',
        'This theme is part of the Premium pack. Unlock it from Streaming Plans.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Plans', onPress: () => navigation.navigate('StreamingPlans') },
        ]
      );
      return;
    }
    await updateMatch(matchId, { streamThemeId: themeId });
    navigation.goBack();
  };

  return (
    <View style={s.container}>
      <Header title="Score Overlay Theme" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={s.scroll}>
        {STREAM_THEMES.map((theme) => (
          <TouchableOpacity
            key={theme.id}
            style={[s.themeCard, currentThemeId === theme.id && s.themeCardActive]}
            onPress={() => handleSelect(theme.id, theme.isPremium)}
          >
            <View style={s.previewWrap}>
              <LiveScoreOverlay match={match} themeId={theme.id} />
            </View>
            <View style={s.themeFooter}>
              <Text style={s.themeName}>{theme.name}</Text>
              {theme.isPremium ? (
                <View style={s.premiumTag}><Text style={s.premiumTagTxt}>🔒 Premium</Text></View>
              ) : (
                <View style={s.freeTag}><Text style={s.freeTagTxt}>Free</Text></View>
              )}
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: SPACING.lg, gap: 14 },
  themeCard: { borderRadius: RADIUS.lg, borderWidth: 2, borderColor: COLORS.border, overflow: 'hidden' },
  themeCardActive: { borderColor: COLORS.primary },
  previewWrap: { padding: 4 },
  themeFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, backgroundColor: COLORS.card },
  themeName: { color: COLORS.text, fontWeight: 'bold', fontSize: 14 },
  premiumTag: { backgroundColor: COLORS.yellow + '33', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.round },
  premiumTagTxt: { color: COLORS.yellow, fontSize: 11, fontWeight: 'bold' },
  freeTag: { backgroundColor: COLORS.primary + '33', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.round },
  freeTagTxt: { color: COLORS.primary, fontSize: 11, fontWeight: 'bold' },
});