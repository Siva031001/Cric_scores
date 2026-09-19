import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

export type PopupEventKind = "WICKET" | "FOUR" | "SIX" | "WIDE" | "NOBALL";

const CONFIG: Record<PopupEventKind, { label: string; emoji: string; color: string }> = {
  WICKET: { label: "WICKET!", emoji: "🎯", color: COLORS.live },
  FOUR: { label: "FOUR!", emoji: "🏏", color: COLORS.success },
  SIX: { label: "SIX!", emoji: "🚀", color: COLORS.primary },
  WIDE: { label: "WIDE", emoji: "↔️", color: COLORS.warning },
  NOBALL: { label: "NO BALL", emoji: "⚠️", color: COLORS.warning },
};

/**
 * A ~2s pop-up for a scoring event. Purely visual — sits above everything
 * via absolute positioning but is non-interactive (pointerEvents="none"), so
 * it never blocks scoring or navigation taps underneath it.
 */
export default function EventPopup({ event, onHide }: { event: PopupEventKind | null; onHide: () => void }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!event) return;
    scale.setValue(0.5);
    opacity.setValue(0);
    Animated.sequence([
      Animated.parallel([
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
      Animated.delay(1400),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [event]);

  if (!event) return null;
  const cfg = CONFIG[event];
  return (
    <View style={st.wrap} pointerEvents="none">
      <Animated.View style={[st.badge, { borderColor: cfg.color, transform: [{ scale }], opacity }]}>
        <Text style={st.emoji}>{cfg.emoji}</Text>
        <Text style={[st.label, { color: cfg.color }]}>{cfg.label}</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 999 },
  badge: { backgroundColor: "#0d0d0dee", borderWidth: 2, borderRadius: 20, paddingVertical: 18, paddingHorizontal: 32, alignItems: "center" },
  emoji: { fontSize: 40, marginBottom: 4 },
  label: { fontSize: 24, fontWeight: "900", letterSpacing: 1 },
});
