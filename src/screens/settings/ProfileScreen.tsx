import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import auth from "@react-native-firebase/auth";
import database from "@react-native-firebase/database";

export default function ProfileScreen({ navigation }: any) {
  const [matchCount, setMatchCount] = useState(0);

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
  }, []);

  const logout = async () => {
    await auth().signOut();
    navigation.replace("Login");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      <Text style={styles.text}>📱 {user?.phoneNumber}</Text>
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
