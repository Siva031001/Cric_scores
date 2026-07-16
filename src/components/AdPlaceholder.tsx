import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

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
  banner: { backgroundColor: COLORS.card2, borderRadius: RADIUS.sm, padding: 10, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed' },
  bannerText: { color: COLORS.textMuted, fontSize: 11 },
  rewardedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  rewardedBox: { backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.xl, alignItems: 'center', width: '85%' },
  rewardedTitle: { color: COLORS.text, fontSize: 18, fontWeight: 'bold', marginBottom: 6 },
  rewardedText: { color: COLORS.textSecondary, fontSize: 13, marginTop: 8, marginBottom: 16, textAlign: 'center' },
  watchBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: RADIUS.md, marginBottom: 8, width: '100%', alignItems: 'center' },
  watchBtnText: { color: '#fff', fontWeight: 'bold' },
  skipBtn: { padding: 8 },
  skipBtnText: { color: COLORS.textMuted, fontSize: 12 },
});