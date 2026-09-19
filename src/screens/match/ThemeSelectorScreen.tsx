import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { updateMatch } from '../../utils/firebase';
import { STREAM_THEMES } from '../../utils/streamThemes';
import LiveScoreOverlay from '../../components/LiveScoreOverlay';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../../constants/theme';
import Header from '../../components/Header';
import AppIcon from '../../components/AppIcon';

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
            activeOpacity={0.85}
          >
            <View pointerEvents="none" style={s.themeCardEdge} />
            <View style={s.previewWrap}>
              <LiveScoreOverlay match={match} themeId={theme.id} />
            </View>
            <View style={[s.themeFooter, currentThemeId === theme.id && s.themeFooterActive]}>
              <Text style={s.themeName}>{theme.name}</Text>
              {theme.isPremium ? (
                <View style={s.premiumTag}>
                  <AppIcon emoji="🔒" size={11} color={COLORS.yellow} />
                  <Text style={s.premiumTagTxt}>Premium</Text>
                </View>
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
  scroll: { padding: SPACING.lg, gap: SPACING.md, paddingBottom: SPACING.xxl },
  // Each option is a preview card: the overlay renders inside it, so the choice
  // is made by looking at the thing rather than reading its name.
  themeCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.borderSoft,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOW.md,
  },
  // Hairline highlight along the card's top edge — same cheap-depth trick the
  // shared Card component uses, applied by hand here since this list needs
  // per-card selection styling that Card's own accent prop doesn't cover.
  themeCardEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: COLORS.edgeHighlight, zIndex: 1 },
  // Selection is carried by a brand-coloured edge plus a glow, so the current
  // theme is obvious at a glance in a scrolling list of similar cards.
  themeCardActive: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    ...SHADOW.glow(COLORS.primary),
  },
  // Darker inset so the overlay preview reads as a broadcast frame rather than
  // as part of the card chrome.
  previewWrap: { padding: SPACING.sm, backgroundColor: COLORS.background },
  themeFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 1,
    backgroundColor: COLORS.card2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.borderSoft,
  },
  themeFooterActive: { backgroundColor: COLORS.primarySoft },
  // A theme's own name, so title weight — not the uppercase label treatment.
  themeName: { ...TYPE.title, color: COLORS.text },
  premiumTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.yellow + '1f',
    borderWidth: 1, borderColor: COLORS.yellow + '55',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.round,
  },
  premiumTagTxt: { ...TYPE.label, color: COLORS.yellow },
  freeTag: {
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1, borderColor: COLORS.primary + '55',
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: RADIUS.round,
  },
  freeTagTxt: { ...TYPE.label, color: COLORS.primary },
});