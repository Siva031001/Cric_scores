import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import auth from "@react-native-firebase/auth";
import database from "@react-native-firebase/database";
import { COLORS, SPACING, TYPE, SHADOW } from "../../constants/theme";
import Header from "../../components/Header";
import Card from "../../components/Card";
import Button from "../../components/Button";
import AppIcon from "../../components/AppIcon";

export default function ProfileScreen({ navigation }: any) {
  const [matchCount, setMatchCount] = useState(0);
  const [profileName, setProfileName] = useState<string | null>(null);

  const user = auth().currentUser;

  useEffect(() => {
    if (!user) return;
    database()
      .ref(`users/${user.uid}/matches`)
      .once("value")
      .then(snap => {
        const data = snap.val();
        setMatchCount(data ? Object.keys(data).length : 0);
      });
    // user.phoneNumber is always null here — auth is anonymous, not phone-based.
    // Pull the display name from the same profile record Settings/ProfileEdit use.
    database()
      .ref(`users/${user.uid}/profile`)
      .once("value")
      .then(snap => setProfileName(snap.val()?.name ?? null));
  }, []);

  const logout = async () => {
    const { logoutLocalSession } = require('../../utils/pinAuthService');
    await logoutLocalSession();
    navigation.replace("Login");
  };

  return (
    <View style={styles.container}>
      <Header title="Profile" />
      <View style={styles.body}>
        <View style={styles.avatarWrap}>
          {/* Two-tone tinted blobs behind the avatar — same layered "tint"
              technique StatCard uses, built from plain tinted Views since
              there's no gradient lib. */}
          <View pointerEvents="none" style={styles.avatarGlowA} />
          <View pointerEvents="none" style={styles.avatarGlowB} />
          <View style={styles.avatarRing}>
            <AppIcon emoji="👤" size={40} color={COLORS.primary} />
          </View>
        </View>

        <Card tone="base" elevation="md" style={styles.infoCard}>
          <Text style={styles.text}>👤 {profileName ?? 'Unnamed Player'}</Text>
          <Text style={[styles.text, styles.textLast]}>🏏 Matches: {matchCount}</Text>
        </Card>

        <Button label="Logout" onPress={logout} variant="primary" tint={COLORS.error} size="lg" full style={styles.logoutBtn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  body: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: SPACING.lg },
  // Wrapper sized to the ring so the decorative blobs behind it can be
  // positioned with simple negative offsets.
  avatarWrap: {
    width: 96, height: 96, alignItems: "center", justifyContent: "center",
    marginBottom: SPACING.lg,
  },
  avatarGlowA: {
    position: "absolute", top: -18, left: -18, width: 132, height: 132,
    borderRadius: 66, backgroundColor: COLORS.primary, opacity: 0.18,
  },
  avatarGlowB: {
    position: "absolute", top: -8, left: -8, width: 112, height: 112,
    borderRadius: 56, backgroundColor: COLORS.primaryLight, opacity: 0.16,
  },
  avatarRing: {
    width: 96, height: 96, borderRadius: 48,
    borderWidth: 3, borderColor: COLORS.primary,
    backgroundColor: COLORS.card2,
    alignItems: "center", justifyContent: "center",
    ...SHADOW.glow(COLORS.primary),
  },
  infoCard: { width: "100%", marginBottom: SPACING.xl, gap: SPACING.sm },
  text: { ...TYPE.body, fontSize: 16, color: COLORS.text, marginBottom: SPACING.sm },
  textLast: { marginBottom: 0 },
  logoutBtn: { width: "100%" },
});
