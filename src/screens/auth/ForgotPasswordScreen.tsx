import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { startForgotPasswordOtp, verifyForgotPasswordOtp, resetPinWithPhoneAuth } from "../../utils/pinAuthService";
import { COLORS, RADIUS, SPACING } from "../../constants/theme";
import Header from "../../components/Header";

type Step = "phone" | "otp" | "newPin";

export default function ForgotPasswordScreen({ navigation }: any) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      Alert.alert("Error", "Please enter your 10-digit mobile number (the same one you used to log in, without +91 or spaces)");
      return;
    }
    setLoading(true);
    const res = await startForgotPasswordOtp(digits);
    setLoading(false);
    if (!res.success) {
      Alert.alert("Error", res.error ?? "Could not send OTP");
      return;
    }
    setPhone(digits);
    setConfirmation(res.confirmation);
    setStep("otp");
  };

  const handleVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length < 4) {
      Alert.alert("Error", "Enter the code you received");
      return;
    }
    setLoading(true);
    const res = await verifyForgotPasswordOtp(confirmation, otp.trim());
    setLoading(false);
    if (!res.success) {
      Alert.alert("Error", res.error ?? "Verification failed");
      return;
    }
    setStep("newPin");
  };

  const handleResetPin = async () => {
    if (!/^\d{4,6}$/.test(newPin)) {
      Alert.alert("Error", "PIN must be 4-6 digits");
      return;
    }
    if (newPin !== confirmPin) {
      Alert.alert("Error", "PINs do not match");
      return;
    }
    setLoading(true);
    const res = await resetPinWithPhoneAuth(phone.trim(), newPin);
    setLoading(false);
    if (!res.success) {
      Alert.alert("Error", res.error ?? "Could not reset PIN");
      return;
    }
    Alert.alert("Success", "Your PIN has been reset. Please log in with your new PIN.", [
      { text: "OK", onPress: () => navigation.reset({ index: 0, routes: [{ name: "Login" }] }) },
    ]);
  };

  return (
    <View style={s.container}>
      <Header title="Forgot Password" onBack={() => navigation.goBack()} />
      <View style={s.content}>
        {step === "phone" && (
          <>
            <Text style={s.label}>Enter your registered mobile number</Text>
            <TextInput
              style={s.input}
              placeholder="10-digit mobile number (no +91, no spaces)"
              placeholderTextColor={COLORS.textMuted}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <TouchableOpacity style={s.btn} onPress={handleSendOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Send OTP</Text>}
            </TouchableOpacity>
          </>
        )}

        {step === "otp" && (
          <>
            <Text style={s.label}>Enter the OTP sent to {phone}</Text>
            <TextInput
              style={s.input}
              placeholder="6-digit code"
              placeholderTextColor={COLORS.textMuted}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
            />
            <TouchableOpacity style={s.btn} onPress={handleVerifyOtp} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Verify OTP</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep("phone")}>
              <Text style={s.link}>Change phone number</Text>
            </TouchableOpacity>
          </>
        )}

        {step === "newPin" && (
          <>
            <Text style={s.label}>Set a new PIN</Text>
            <TextInput
              style={s.input}
              placeholder="New PIN (4-6 digits)"
              placeholderTextColor={COLORS.textMuted}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <TextInput
              style={s.input}
              placeholder="Confirm New PIN"
              placeholderTextColor={COLORS.textMuted}
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={6}
            />
            <TouchableOpacity style={s.btn} onPress={handleResetPin} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnTxt}>Reset PIN</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, gap: 12 },
  label: { color: COLORS.textSecondary, fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: COLORS.card, color: COLORS.text, padding: 14, borderRadius: RADIUS.md, fontSize: 15, borderWidth: 1, borderColor: COLORS.border },
  btn: { backgroundColor: COLORS.primary, padding: 15, borderRadius: RADIUS.md, alignItems: "center", marginTop: 6 },
  btnTxt: { color: "#fff", fontSize: 15, fontWeight: "bold" },
  link: { color: COLORS.primary, textAlign: "center", marginTop: 10, fontSize: 13 },
});