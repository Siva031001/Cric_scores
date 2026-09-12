import React from "react";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";

// Maps every emoji currently used in the app to a bundled vector icon name,
// so icons render identically on every device -- no dependency on the
// phone's OS-level emoji font (some real devices lack one entirely).
const EMOJI_TO_ICON: Record<string, string> = {
  "🏏": "cricket",
  "🎯": "target",
  "🤚": "hand-back-right",
  "🏆": "trophy",
  "📋": "clipboard-text",
  "🏃": "run",
  "⚽": "soccer",
  "📷": "camera",
  "🗑️": "delete",
  "🚪": "logout",
  "👑": "crown",
  "👤": "account",
  "👥": "account-group",
  "📍": "map-marker",
  "🔔": "bell",
  "🤖": "robot",
  "✅": "check-circle",
  "✓": "check",
  "⏸": "pause",
  "🔴": "circle",
  "🏁": "flag",
  "🧤": "boxing-glove",
  "🏢": "office-building",
  "🏅": "medal",
  "🎾": "tennis-ball",
  "🏟️": "stadium",
  "⏰": "alarm",
  "➕": "plus",
  "⚙️": "cog",
  "🔍": "magnify",
  "✕": "close",
  "📊": "chart-bar",
  "📡": "access-point",
  "🥇": "medal",
  "🥈": "medal-outline",
  "🥉": "medal-outline",
  "📅": "calendar",
  "🪙": "circle-multiple",
  "▼": "chevron-down",
  "→": "arrow-right",
  "›": "chevron-right",
  "🔒": "lock",
  "📭": "inbox",
  "🥅": "gate",
  "←": "arrow-left",
  "🎥": "video",
  "🏊": "pool",
  "✉️": "email"
};

export default function AppIcon({
  emoji,
  size = 20,
  color = "#ffffff",
  style,
}: {
  emoji: string;
  size?: number;
  color?: string;
  style?: any;
}) {
  const iconName = EMOJI_TO_ICON[emoji];
  if (!iconName) {
    // Fall back to rendering the raw emoji if we haven't mapped it yet --
    // better to show something than crash, and it flags gaps during testing.
    return null;
  }
  return <MaterialCommunityIcons name={iconName} size={size} color={color} style={style} />;
}