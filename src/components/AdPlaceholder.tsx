import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from '../constants/theme';

// TODO: Replace with real ad SDK (e.g. react-native-google-mobile-ads) once
// a provider is chosen. Banner shows a static placeholder; Rewarded
// simulates a 3s "watch" delay then calls onComplete — swap the body of
// showRewardedAd for a real rewarded-ad show() call, keeping the same
// onComplete/onSkip contract so callers don't need to change.

export function AdBanner() {
  return (
    <View style={s.banner}>
      <Text style={s.bannerText}>Ad Banner Placeholder</Text>
    </View>
  );
}

export function AdRewardedGate({ visible, onComplete, onSkip }: { visible: boolean; onComplete: () => void; onSkip: () => void }) {
  const [watching, setWatching] = useState(false);
  if (!visible) return null;

  const simulateWatch = () => {
    setWatching(true);
    // TODO: replace this timeout with real rewarded ad show(), calling
    // onComplete() only in the ad SDK's "earned reward" callback, and
    // onSkip() in its "dismissed without reward" callback.
    setTimeout(() => { setWatching(false); onComplete(); }, 3000);
  };

  return (
    <View style={s.rewardedOverlay}>
      <View style={s.rewardedBox}>
        {watching ? (
          <>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={s.rewardedText}>Watching ad...</Text>
          </>
        ) : (
          <>
            <Text style={s.rewardedTitle}>Rewarded Ad</Text>
            <Text style={s.rewardedText}>(Placeholder — wire to real ad SDK)</Text>
            <TouchableOpacity style={s.watchBtn} onPress={simulateWatch}>
              <Text style={s.watchBtnText}>Simulate: Watch Full Ad</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.skipBtn} onPress={onSkip}>
              <Text style={s.skipBtnText}>Simulate: Skip Ad</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  banner: { backgroundColor: COLORS.card, borderRadius: RADIUS.md, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  bannerText: { ...TYPE.label, fontSize: 9, color: COLORS.textMuted },
  rewardedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  rewardedBox: { backgroundColor: COLORS.surface3, borderRadius: RADIUS.xl, padding: SPACING.xl, alignItems: 'center', width: '85%', borderWidth: 1, borderColor: COLORS.border, ...SHADOW.lg },
  rewardedTitle: { ...TYPE.h1, color: COLORS.text, marginBottom: 6, textAlign: 'center' },
  rewardedText: { ...TYPE.body, color: COLORS.textSecondary, marginTop: SPACING.sm, marginBottom: SPACING.lg, textAlign: 'center', lineHeight: 20 },
  watchBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 15, borderRadius: RADIUS.md, marginBottom: SPACING.sm, width: '100%', alignItems: 'center', ...SHADOW.glow(COLORS.primary) },
  watchBtnText: { ...TYPE.button, color: COLORS.onPrimary },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  skipBtnText: { ...TYPE.caption, color: COLORS.textMuted },
});
