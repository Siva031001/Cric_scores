import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import auth from "@react-native-firebase/auth";
import database from "@react-native-firebase/database";

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
      <Text style={styles.title}>Profile</Text>

      <Text style={styles.text}>👤 {profileName ?? 'Unnamed Player'}</Text>
      <Text style={styles.text}>🏏 Matches: {matchCount}</Text>

      <TouchableOpacity style={styles.btn} onPress={logout}>
        <Text style={styles.btnText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, justifyContent: "center" },
  title: { fontSize: 22, marginBottom: 20, textAlign: "center" },
  text: { fontSize: 16, marginBottom: 10 },
  btn: { backgroundColor: "red", padding: 15, alignItems: "center" },
  btnText: { color: "#fff" },
});
