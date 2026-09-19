import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

export type UmpireEventKind = "WICKET" | "FOUR" | "SIX" | "WIDE" | "NOBALL";

// No 3D-model/Lottie asset pipeline exists in this project yet (no
// lottie-react-native, no Rive, no three.js) — this is a "3D-style" flip-in
// built from perspective + rotateY on plain views, which reads as depth
// without needing a real 3D asset. Swap `render` for a Lottie/Rive view
// later without touching the trigger logic below if real umpire animations
// are added.
const CONFIG: Record<UmpireEventKind, { label: string; emoji: string; color: string }> = {
  WICKET: { label: "OUT!", emoji: "☝️", color: COLORS.live },
  FOUR: { label: "FOUR!", emoji: "🙌", color: COLORS.success },
  SIX: { label: "SIX!", emoji: "🙆", color: COLORS.primary },
  WIDE: { label: "WIDE", emoji: "🙋", color: COLORS.warning },
  NOBALL: { label: "NO BALL", emoji: "🙅", color: COLORS.warning },
};

/**
 * Viewer-only event overlay. Small and corner-anchored (not full-screen)
 * so it never covers the score or ball-by-ball strip underneath, and
 * pointerEvents="none" so it can never intercept a tap.
 */
export default function UmpireEventPopup({ event, onHide }: { event: UmpireEventKind | null; onHide: () => void }) {
  const rotateY = useRef(new Animated.Value(90)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (!event) return;
    rotateY.setValue(90);
    opacity.setValue(0);
    scale.setValue(0.7);
    Animated.sequence([
      Animated.parallel([
        Animated.timing(rotateY, { toValue: 0, duration: 350, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 6 }),
      ]),
      Animated.delay(1300),
      Animated.timing(opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [event]);

  if (!event) return null;
  const cfg = CONFIG[event];
  const spin = rotateY.interpolate({ inputRange: [0, 90], outputRange: ["0deg", "90deg"] });

  return (
    <View style={st.wrap} pointerEvents="none">
      <Animated.View
        style={[
          st.card,
          { borderColor: cfg.color, opacity, transform: [{ perspective: 800 }, { rotateY: spin }, { scale }] },
        ]}
      >
        <Text style={st.emoji}>{cfg.emoji}</Text>
        <Text style={[st.label, { color: cfg.color }]}>{cfg.label}</Text>
      </Animated.View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: "absolute", top: 60, right: 12, zIndex: 999 },
  card: {
    backgroundColor: "#0d0d0dee",
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  emoji: { fontSize: 26 },
  label: { fontSize: 13, fontWeight: "900", letterSpacing: 0.5, marginTop: 2 },
});
