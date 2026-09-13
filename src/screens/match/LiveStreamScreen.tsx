import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from "../../constants/theme";
import Header from "../../components/Header";
import AppIcon from "../../components/AppIcon";
import Badge from "../../components/Badge";

export default function LiveStreamScreen({ navigation }: any) {
  return (
    <View style={s.container}>
      <Header title="Live Streaming" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll}>
        <View style={s.heroBox}>
          <Badge label="LIVE" tone="live" style={s.heroBadge} />
          <Text style={s.heroTitle}>Live Cricket Scoring</Text>
          <Text style={s.heroSub}>Start, share and follow live matches in real time</Text>
        </View>

        <View style={s.optionsBox}>
          <TouchableOpacity style={s.optionCard} onPress={() => navigation.navigate("NewMatch")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.primary + "33"}]}>
              <Text style={[s.optIconTxt, {color: COLORS.primary, fontSize: 22}]}>+</Text>
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>Go Live — Start Match</Text>
              <Text style={s.optSub}>Create a new match and score ball by ball. Others can follow live using your Match ID.</Text>
            </View>
            <AppIcon emoji="›" size={22} color={COLORS.textMuted} style={s.optArrow} />
          </TouchableOpacity>

          <TouchableOpacity style={s.optionCard} onPress={() => navigation.navigate("LiveView")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.blue + "33"}]}>
              <Text style={[s.optIconTxt, {color: COLORS.blue}]}>ID</Text>
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>Join by Match ID</Text>
              <Text style={s.optSub}>Enter a Match ID shared by scorer to follow live score updates.</Text>
            </View>
            <AppIcon emoji="›" size={22} color={COLORS.textMuted} style={s.optArrow} />
          </TouchableOpacity>

          <TouchableOpacity style={s.optionCard} onPress={() => Alert.alert("Share Match Score", "During a live match, tap the Share button on the Scoring screen to share the live score via WhatsApp, SMS or any app.")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.orange + "33"}]}>
              <Text style={[s.optIconTxt, {color: COLORS.orange}]}>SH</Text>
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>Share Live Score</Text>
              <Text style={s.optSub}>While scoring, tap Share to send live scores via WhatsApp or other apps.</Text>
            </View>
            <AppIcon emoji="›" size={22} color={COLORS.textMuted} style={s.optArrow} />
          </TouchableOpacity>

          {/* NEW: My Live Streams — organizer's stream history/status view */}
          <TouchableOpacity style={s.optionCard} onPress={() => navigation.navigate("MyLiveStreams")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.purple + "33"}]}>
              <AppIcon emoji="📊" size={22} color={COLORS.purple} />
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>My Live Streams</Text>
              <Text style={s.optSub}>View active, scheduled, completed, and draft live streams.</Text>
            </View>
            <AppIcon emoji="›" size={22} color={COLORS.textMuted} style={s.optArrow} />
          </TouchableOpacity>

          {/* NEW: Streaming Plans — pricing page, Coming Soon */}
          <TouchableOpacity style={s.optionCard} onPress={() => navigation.navigate("StreamingPlans")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.teal + "33"}]}>
              <Text style={[s.optIconTxt, {color: COLORS.teal}]}>💎</Text>
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>Streaming Plans</Text>
              <Text style={s.optSub}>Unlock more live matches and premium score themes.</Text>
            </View>
            <AppIcon emoji="›" size={22} color={COLORS.textMuted} style={s.optArrow} />
          </TouchableOpacity>
        </View>

        <View style={s.howBox}>
          <Text style={s.howTitle}>How to Go Live</Text>
          {[
            { step: "1", text: "Tap Go Live — Start Match above" },
            { step: "2", text: "Select teams, overs, toss" },
            { step: "3", text: "Choose opening batsmen and bowler" },
            { step: "4", text: "Start scoring — your match goes live instantly" },
            { step: "5", text: "Share the Match ID with others to follow live" },
          ].map(item => (
            <View key={item.step} style={s.howRow}>
              <View style={s.howNum}><Text style={s.howNumTxt}>{item.step}</Text></View>
              <Text style={s.howTxt}>{item.text}</Text>
            </View>
          ))}
        </View>
        <View style={{height: 40}} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  heroBox: { alignItems: "center", paddingVertical: SPACING.xl, paddingHorizontal: SPACING.xl },
  // The pulsing LIVE pill carries the "on air" idea; the old solid red block
  // read as an error banner. COLORS.live is deliberately not COLORS.error.
  heroBadge: { marginBottom: SPACING.md, paddingHorizontal: 14, paddingVertical: 6, ...SHADOW.glow(COLORS.live) },
  heroTitle: { ...TYPE.h1, color: COLORS.text, marginBottom: SPACING.xs + 1, textAlign: "center" },
  heroSub: { ...TYPE.body, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
  optionsBox: { paddingHorizontal: SPACING.lg, gap: SPACING.sm + 2 },
  optionCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.borderSoft,
    gap: 14, ...SHADOW.sm,
  },
  optIcon: { width: 48, height: 48, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  optIconTxt: { ...TYPE.label, fontSize: 14, letterSpacing: 0.5 },
  optInfo: { flex: 1 },
  optTitle: { ...TYPE.title, color: COLORS.text, marginBottom: 3 },
  optSub: { ...TYPE.caption, color: COLORS.textSecondary, lineHeight: 18 },
  optArrow: { flexShrink: 0 },
  howBox: {
    margin: SPACING.lg, backgroundColor: COLORS.card, borderRadius: RADIUS.lg,
    padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.borderSoft, ...SHADOW.sm,
  },
  howTitle: { ...TYPE.label, color: COLORS.primary, marginBottom: 14 },
  howRow: { flexDirection: "row", alignItems: "center", gap: SPACING.sm + 2, marginBottom: SPACING.sm + 2 },
  // Tinted step marker rather than a solid green dot: five solid green circles
  // down the card pulled attention away from the steps themselves.
  howNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1, borderColor: COLORS.primary + '66',
    justifyContent: "center", alignItems: "center", flexShrink: 0,
  },
  howNumTxt: { ...TYPE.numSm, color: COLORS.primaryLight },
  howTxt: { ...TYPE.body, color: COLORS.textSecondary, flex: 1, lineHeight: 19 },
});