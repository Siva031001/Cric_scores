import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { COLORS, RADIUS, SPACING } from '../constants/theme';

// TODO: Replace with real ad SDK's interstitial show() call once a provider
// is chosen. Shown at natural break points only (match complete, AI summary
// generated, scorecard downloaded, tournament closed, stats viewed) — never
// on every screen transition. onDismiss fires whether the user watches or
// closes it (interstitials, unlike rewarded ads, don't gate anything —
// they're a break-point placement, not a paywall).
export default function AdInterstitial({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const [showing, setShowing] = useState(false);

  React.useEffect(() => {
    if (visible && !showing) {
      setShowing(true);
      // TODO: replace this timeout with a real interstitial ad show() call,
      // calling onDismiss() in the ad SDK's close/dismiss callback.
      const t = setTimeout(() => { setShowing(false); onDismiss(); }, 2500);
      return () => clearTimeout(t);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={s.overlay}>
      <View style={s.box}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.text}>Advertisement</Text>
        <Text style={s.sub}>(Placeholder — wire to real ad SDK)</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  box: { alignItems: 'center', padding: SPACING.xl },
  text: { color: COLORS.text, fontSize: 16, fontWeight: 'bold', marginTop: 16 },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 6 },
});