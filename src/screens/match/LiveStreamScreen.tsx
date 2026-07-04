import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";

export default function LiveStreamScreen({ navigation }: any) {
  return (
    <View style={s.container}>
      <Header title="Live Streaming" onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll}>
        <View style={s.heroBox}>
          <View style={s.heroBadge}>
            <Text style={s.heroBadgeTxt}>LIVE</Text>
          </View>
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
            <Text style={s.optArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.optionCard} onPress={() => navigation.navigate("LiveView")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.blue + "33"}]}>
              <Text style={[s.optIconTxt, {color: COLORS.blue}]}>ID</Text>
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>Join by Match ID</Text>
              <Text style={s.optSub}>Enter a Match ID shared by scorer to follow live score updates.</Text>
            </View>
            <Text style={s.optArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.optionCard} onPress={() => Alert.alert("Share Match Score", "During a live match, tap the Share button on the Scoring screen to share the live score via WhatsApp, SMS or any app.")}>
            <View style={[s.optIcon, {backgroundColor: COLORS.orange + "33"}]}>
              <Text style={[s.optIconTxt, {color: COLORS.orange}]}>SH</Text>
            </View>
            <View style={s.optInfo}>
              <Text style={s.optTitle}>Share Live Score</Text>
              <Text style={s.optSub}>While scoring, tap Share to send live scores via WhatsApp or other apps.</Text>
            </View>
            <Text style={s.optArrow}>›</Text>
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
  heroBox: { alignItems: "center", paddingVertical: 36, paddingHorizontal: SPACING.xl },
  heroBadge: { backgroundColor: COLORS.red, paddingHorizontal: 20, paddingVertical: 8, borderRadius: RADIUS.round, marginBottom: 16 },
  heroBadgeTxt: { color: "#fff", fontSize: 16, fontWeight: "900", letterSpacing: 3 },
  heroTitle: { color: COLORS.text, fontSize: 22, fontWeight: "bold", marginBottom: 8, textAlign: "center" },
  heroSub: { color: COLORS.textSecondary, fontSize: 13, textAlign: "center", lineHeight: 20 },
  optionsBox: { paddingHorizontal: SPACING.lg, gap: 12 },
  optionCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: 16, borderWidth: 1, borderColor: COLORS.border, gap: 14 },
  optIcon: { width: 52, height: 52, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  optIconTxt: { fontSize: 15, fontWeight: "900" },
  optInfo: { flex: 1 },
  optTitle: { color: COLORS.text, fontSize: 15, fontWeight: "bold", marginBottom: 4 },
  optSub: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  optArrow: { color: COLORS.textSecondary, fontSize: 24, fontWeight: "bold" },
  howBox: { margin: SPACING.lg, backgroundColor: COLORS.card, borderRadius: RADIUS.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.border },
  howTitle: { color: COLORS.primary, fontSize: 14, fontWeight: "bold", marginBottom: 14 },
  howRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  howNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, justifyContent: "center", alignItems: "center", flexShrink: 0 },
  howNumTxt: { color: "#fff", fontSize: 13, fontWeight: "bold" },
  howTxt: { color: COLORS.textSecondary, fontSize: 13, flex: 1 },
});