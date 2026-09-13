import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar } from "react-native";
import { checkPhoneExists, createPinAccount, loginWithPin } from "../../utils/pinAuthService";
import { startForgotPasswordOtp, verifyForgotPasswordOtp, checkOtpRateLimit, recordOtpSent } from "../../utils/pinAuthService";
import AppIcon from "../../components/AppIcon";
import { isValidPinFormat } from "../../utils/pinAuth";
import { COLORS } from "../../constants/theme";

type Mode = "phone" | "verify-otp" | "setup-pin" | "confirm-pin" | "login-pin";

export default function LoginScreen({ navigation }: any) {
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<Mode>("phone");
  const [pin, setPin] = useState("");
  const [confirmPinValue, setConfirmPinValue] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [confirmation, setConfirmation] = useState<any>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ── TEMPORARY DIAGNOSTIC — remove once the slowness is pinned down ──
  // Times each step of the number-entry flow and shows the breakdown, so we
  // can see WHICH call is slow instead of guessing. Every step below is a
  // separate network round trip; only signInWithPhoneNumber sends an SMS
  // (and on Android also runs Play Integrity / reCAPTCHA device checks,
  // which is the step most likely to take many seconds).
  const timings: string[] = [];
  const timed = async <T,>(label: string, fn: () => Promise<T>): Promise<T> => {
    const t0 = Date.now();
    try {
      return await fn();
    } finally {
      timings.push(`${label}: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  };

  const checkNumber = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit mobile number.");
      return;
    }
    const tStart = Date.now();
    try {
      setLoading(true);
      const exists = await timed("1 checkPhoneExists", () => checkPhoneExists(digits));
      if (exists) {
        setMode("login-pin");
        setPin("");
      } else {
        // New number — verify ownership via OTP before allowing PIN setup.
        const rateCheck = await timed("2 checkOtpRateLimit", () => checkOtpRateLimit(digits));
        if (!rateCheck.allowed) {
          if (rateCheck.secondsUntilResend) {
            Alert.alert("Please Wait", `You can request another OTP in ${rateCheck.secondsUntilResend}s.`);
          } else {
            Alert.alert("Limit Reached", rateCheck.error ?? "You've reached today's OTP limit. Please try again after 24 hours.");
          }
          return;
        }
        // startForgotPasswordOtp checks checkPhoneExists internally and
        // returns an error for unregistered numbers — bypass that check
        // for registration by calling signInWithPhoneNumber directly instead,
        // but still go through the same OTP rate limit gate above/below.
        const authMod = require('@react-native-firebase/auth').default;
        const conf = await timed("3 sendOtp(SMS)", () => authMod().signInWithPhoneNumber('+91' + digits));
        await timed("4 recordOtpSent", () => recordOtpSent(digits));
        setConfirmation(conf);
        setMode("verify-otp");
        setResendCooldown(30);
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "Unknown error");
    } finally {
      setLoading(false);
      Alert.alert(
        "TIMING (temporary)",
        timings.join("\n") + `\n\nTOTAL: ${((Date.now() - tStart) / 1000).toFixed(1)}s`
      );
    }
  };

  const handleVerifyRegistrationOtp = async () => {
    if (!otp.trim() || otp.trim().length < 4) {
      Alert.alert("Error", "Enter the code you received");
      return;
    }
    try {
      setLoading(true);
      await confirmation.confirm(otp.trim());
      setMode("setup-pin");
      setPin("");
    } catch (error: any) {
      Alert.alert("Error", "Incorrect or expired code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendRegistrationOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      setLoading(true);
      const digits = phone.replace(/\D/g, "");
      const rateCheck = await checkOtpRateLimit(digits);
      if (!rateCheck.allowed) {
        if (rateCheck.secondsUntilResend) {
          Alert.alert("Please Wait", `You can request another OTP in ${rateCheck.secondsUntilResend}s.`);
          setResendCooldown(rateCheck.secondsUntilResend);
        } else {
          Alert.alert("Limit Reached", rateCheck.error ?? "You've reached today's OTP limit. Please try again after 24 hours.");
        }
        return;
      }
      const authMod = require('@react-native-firebase/auth').default;
      const conf = await authMod().signInWithPhoneNumber('+91' + digits);
      await recordOtpSent(digits);
      setConfirmation(conf);
      setResendCooldown(30);
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "Could not resend OTP");
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
    if (mode === "verify-otp") return "Verify your number";
    if (mode === "setup-pin") return "Create a PIN";
    if (mode === "confirm-pin") return "Confirm your PIN";
    if (mode === "login-pin") return "Enter your PIN";
    return "Login with Mobile";
  };

  const subFor = () => {
    if (mode === "verify-otp") return "Enter the OTP sent to +91 " + phone;
    if (mode === "setup-pin") return "Set a 4-6 digit PIN for +91 " + phone;
    if (mode === "confirm-pin") return "Re-enter your PIN to confirm";
    if (mode === "login-pin") return "Enter your PIN for +91 " + phone;
    return "Enter your 10-digit mobile number";
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#0a1628" />
      <View style={styles.header}>
        <AppIcon emoji="🏏" size={64} color={COLORS.primary} />
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

        {mode === "verify-otp" && (
  <>
    <TextInput style={styles.otpInput} placeholder="Enter OTP" placeholderTextColor="#9ca3af" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} selectionColor="#4ade80" />
    <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleVerifyRegistrationOtp} disabled={loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Verify OTP</Text>}
    </TouchableOpacity>
    <TouchableOpacity style={styles.changeBtn} onPress={handleResendRegistrationOtp} disabled={resendCooldown > 0}>
      <Text style={[styles.changeBtnText, resendCooldown > 0 && { opacity: 0.5 }]}>
        {resendCooldown > 0 ? 'Resend OTP in ' + resendCooldown + 's' : 'Resend OTP'}
      </Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.changeBtn} onPress={goBackToPhone}>
      <Text style={styles.changeBtnText}>Change Number</Text>
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
