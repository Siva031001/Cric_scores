import React, { useEffect, useRef } from "react";
import { View, Text, Animated, StyleSheet } from "react-native";
import { COLORS } from "../constants/theme";

export type UmpireEventKind =
  | "WICKET" | "FOUR" | "SIX" | "WIDE" | "NOBALL"
  | "FIFTY" | "HUNDRED" | "HUNDRED_FIFTY"
  | "THREE_WKTS" | "FOUR_WKTS" | "FIVE_WKTS";

// No 3D-model/Lottie asset pipeline exists in this project yet (no
// lottie-react-native, no Rive, no three.js) — this is a "3D-style" flip-in
// built from perspective + rotateY on plain views, which reads as depth
// without needing a real 3D asset. Swap `render` for a Lottie/Rive view
// later without touching the trigger logic if real umpire animations are
// added.
const CONFIG: Record<UmpireEventKind, { label: string; emoji: string; color: string; celebrate: boolean }> = {
  WICKET: { label: "OUT!", emoji: "☝️", color: COLORS.live, celebrate: false },
  FOUR: { label: "FOUR!", emoji: "🙌", color: COLORS.success, celebrate: false },
  SIX: { label: "SIX!", emoji: "🙆", color: COLORS.primary, celebrate: true },
  WIDE: { label: "WIDE", emoji: "🙋", color: COLORS.warning, celebrate: false },
  NOBALL: { label: "NO BALL", emoji: "🙅", color: COLORS.warning, celebrate: false },
  FIFTY: { label: "FIFTY!", emoji: "🏏", color: COLORS.yellow, celebrate: true },
  HUNDRED: { label: "CENTURY!", emoji: "💯", color: COLORS.primary, celebrate: true },
  HUNDRED_FIFTY: { label: "150!", emoji: "🏆", color: COLORS.primary, celebrate: true },
  THREE_WKTS: { label: "3 WICKETS!", emoji: "🎯", color: COLORS.live, celebrate: true },
  FOUR_WKTS: { label: "4 WICKETS!", emoji: "🔥", color: COLORS.live, celebrate: true },
  FIVE_WKTS: { label: "5-WICKET HAUL!", emoji: "⭐", color: COLORS.live, celebrate: true },
};

const SPARK_EMOJIS = ["✨", "🎉", "🎊", "✨", "🎉", "🎊"];

function Spark({ angle, active }: { angle: number; active: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) return;
    t.setValue(0);
    Animated.timing(t, { toValue: 1, duration: 900, useNativeDriver: true }).start();
  }, [active]);
  const distance = 70;
  const tx = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] });
  const ty = t.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * distance] });
  const opacity = t.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] });
  const scale = t.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.1] });
  return (
    <Animated.Text
      style={[
        st.spark,
        { opacity, transform: [{ translateX: tx }, { translateY: ty }, { scale }] },
      ]}
    >
      {SPARK_EMOJIS[Math.floor((angle * 3) % SPARK_EMOJIS.length)]}
    </Animated.Text>
  );
}

/**
 * Viewer-only event overlay, centered on screen with a light shadow —
 * absolutely positioned and pointerEvents="none", so it never resizes,
 * pushes, or blocks taps on the scorecard underneath. Auto-hides itself;
 * callers just clear their `event` state in onHide.
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
  const sparkAngles = cfg.celebrate ? Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2) : [];

  return (
    <View style={st.wrap} pointerEvents="none">
      <View style={st.center}>
        {sparkAngles.map((a, i) => (
          <Spark key={i} angle={a} active={!!event} />
        ))}
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
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center", zIndex: 999 },
  center: { justifyContent: "center", alignItems: "center" },
  card: {
    backgroundColor: "#151322f2",
    borderWidth: 2,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 26,
    alignItems: "center",
    // Light/subtle shadow, not the heavy drop-shadow the first pass used.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  emoji: { fontSize: 34 },
  label: { fontSize: 16, fontWeight: "900", letterSpacing: 0.5, marginTop: 4 },
  spark: { position: "absolute", fontSize: 20 },
});
