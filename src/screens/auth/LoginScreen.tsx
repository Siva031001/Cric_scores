import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar } from "react-native";
import { checkPhoneExists, createPinAccount, loginWithPin } from "../../utils/pinAuthService";
import AppIcon from "../../components/AppIcon";
import { isValidPinFormat } from "../../utils/pinAuth";

type Mode = "phone" | "setup-pin" | "confirm-pin" | "login-pin";

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<Mode>("phone");
  const [pin, setPin] = useState("");
  const [confirmPinValue, setConfirmPinValue] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [loading, setLoading] = useState(false);

  const checkNumber = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit mobile number.");
      return;
    }
    try {
      setLoading(true);
      const exists = await checkPhoneExists(digits);
      setMode(exists ? "login-pin" : "setup-pin");
      setPin("");
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleSetupPinNext = () => {
    if (!isValidPinFormat(pin)) {
      Alert.alert("Invalid PIN", "PIN must be 4 to 6 digits.");
      return;
    }
    setFirstPin(pin);
    setConfirmPinValue("");
    setMode("confirm-pin");
  };

  const handleConfirmPinAndCreate = async () => {
    if (confirmPinValue !== firstPin) {
      Alert.alert("PIN Mismatch", "The PINs you entered don't match. Please try again.");
      setConfirmPinValue("");
      return;
    }
    try {
      setLoading(true);
      const digits = phone.replace(/\D/g, "");
      await createPinAccount(digits, firstPin);
      navigation.replace("Home");
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!isValidPinFormat(pin)) {
      Alert.alert("Invalid PIN", "PIN must be 4 to 6 digits.");
      return;
    }
    try {
      setLoading(true);
      const digits = phone.replace(/\D/g, "");
      const result = await loginWithPin(digits, pin);
      if (!result.success) {
        Alert.alert("Login Failed", result.error ?? "Incorrect PIN.");
        setPin("");
        return;
      }
      navigation.replace("Home");
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const goBackToPhone = () => {
    setMode("phone");
    setPin("");
    setFirstPin("");
    setConfirmPinValue("");
  };

  const titleFor = () => {
    if (mode === "setup-pin") return "Create a PIN";
    if (mode === "confirm-pin") return "Confirm your PIN";
    if (mode === "login-pin") return "Enter your PIN";
    return "Login with Mobile";
  };

  const subFor = () => {
    if (mode === "setup-pin") return "Set a 4-6 digit PIN for +91 " + phone;
    if (mode === "confirm-pin") return "Re-enter your PIN to confirm";
    if (mode === "login-pin") return "Enter your PIN for +91 " + phone;
    return "Enter your 10-digit mobile number";
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
      <View style={styles.header}>
        <Text style={styles.logo}>🏏</Text>
        <Text style={styles.appName}>CricketScorer</Text>
        <Text style={styles.tagline}>Score every ball, track every match</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{titleFor()}</Text>
        <Text style={styles.cardSub}>{subFor()}</Text>

        {mode === "phone" && (
          <>
            <View style={styles.phoneRow}>
              <View style={styles.countryBox}>
                <Text style={styles.flag}>🇮🇳</Text>
                <Text style={styles.countryCode}>+91</Text>
              </View>
              <TextInput style={styles.phoneInput} placeholder="Enter mobile number" placeholderTextColor="#9ca3af" keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} selectionColor="#4ade80" />
            </View>
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={checkNumber} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continue</Text>}
            </TouchableOpacity>
          </>
        )}

        {mode === "setup-pin" && (
          <>
            <TextInput style={styles.otpInput} placeholder="Set 4-6 digit PIN" placeholderTextColor="#9ca3af" keyboardType="number-pad" maxLength={6} secureTextEntry value={pin} onChangeText={setPin} selectionColor="#4ade80" />
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleSetupPinNext} disabled={loading}>
              <Text style={styles.btnText}>Next</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={goBackToPhone}>
              <Text style={styles.changeBtnText}>Change Number</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "confirm-pin" && (
          <>
            <TextInput style={styles.otpInput} placeholder="Re-enter PIN" placeholderTextColor="#9ca3af" keyboardType="number-pad" maxLength={6} secureTextEntry value={confirmPinValue} onChangeText={setConfirmPinValue} selectionColor="#4ade80" />
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleConfirmPinAndCreate} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={() => setMode("setup-pin")}>
              <Text style={styles.changeBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "login-pin" && (
          <>
            <TextInput style={styles.otpInput} placeholder="Enter PIN" placeholderTextColor="#9ca3af" keyboardType="number-pad" maxLength={6} secureTextEntry value={pin} onChangeText={setPin} selectionColor="#4ade80" />
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Login</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={() => navigation.navigate("ForgotPassword", { phone })}>
              <Text style={styles.changeBtnText}>Forgot Password?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={goBackToPhone}>
              <Text style={styles.changeBtnText}>Change Number</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
      <Text style={styles.footer}>
        {mode === "login-pin"
          ? "Logging in here will sign you out of any other device."
          : "By continuing, you agree to our Terms of Service"}
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0a1628", justifyContent: "center", paddingHorizontal: 24 },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 64, marginBottom: 12 },
  appName: { color: "#ffffff", fontSize: 32, fontWeight: "bold" },
  tagline: { color: "#4ade80", fontSize: 14, marginTop: 6 },
  card: { backgroundColor: "#1e2d45", borderRadius: 20, padding: 28, borderWidth: 1, borderColor: "#2d4a6e" },
  cardTitle: { color: "#ffffff", fontSize: 22, fontWeight: "bold", marginBottom: 6 },
  cardSub: { color: "#9ca3af", fontSize: 14, marginBottom: 24 },
  phoneRow: { flexDirection: "row", alignItems: "center", backgroundColor: "#0d2137", borderRadius: 12, borderWidth: 1.5, borderColor: "#2d4a6e", marginBottom: 16, overflow: "hidden" },
  countryBox: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 16, borderRightWidth: 1, borderRightColor: "#2d4a6e", gap: 6 },
  flag: { fontSize: 18 },
  countryCode: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
  phoneInput: { flex: 1, color: "#ffffff", fontSize: 18, paddingHorizontal: 14, paddingVertical: 16, letterSpacing: 1 },
  otpInput: { backgroundColor: "#0d2137", color: "#ffffff", fontSize: 24, textAlign: "center", letterSpacing: 12, paddingVertical: 18, borderRadius: 12, borderWidth: 1.5, borderColor: "#2d4a6e", marginBottom: 16 },
  btn: { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  btnDisabled: { backgroundColor: "#374151" },
  btnText: { color: "#ffffff", fontSize: 17, fontWeight: "bold" },
  changeBtn: { alignItems: "center", marginTop: 14 },
  changeBtnText: { color: "#4ade80", fontSize: 14 },
  footer: { color: "#4b5563", fontSize: 11, textAlign: "center", marginTop: 32 },
});
