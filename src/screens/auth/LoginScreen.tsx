import React, { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar } from "react-native";
import { checkPhoneExists, createPinAccount, loginWithPin } from "../../utils/pinAuthService";
import { startForgotPasswordOtp, verifyForgotPasswordOtp, checkOtpRateLimit, recordOtpSent } from "../../utils/pinAuthService";
import AppIcon from "../../components/AppIcon";
import { isValidPinFormat } from "../../utils/pinAuth";
import { COLORS, RADIUS, SPACING, TYPE, SHADOW } from "../../constants/theme";
import Card from "../../components/Card";

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

  const checkNumber = async () => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      Alert.alert("Invalid Number", "Please enter a valid 10-digit mobile number.");
      return;
    }
    try {
      setLoading(true);
      const exists = await checkPhoneExists(digits);
      if (exists) {
        setMode("login-pin");
        setPin("");
      } else {
        // New number — verify ownership via OTP before allowing PIN setup.
        const rateCheck = await checkOtpRateLimit(digits);
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
        const conf = await authMod().signInWithPhoneNumber('+91' + digits);
        await recordOtpSent(digits);
        setConfirmation(conf);
        setMode("verify-otp");
        setResendCooldown(30);
      }
    } catch (error: any) {
      Alert.alert("Error", error?.message ?? "Unknown error");
    } finally {
      setLoading(false);
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
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.header}>
        {/* Soft colour blobs behind the logo mark — same plain tinted,
            absolutely positioned View technique used on the Home screen's
            hero header. Purely decorative: no touch handling, sits below
            the logo/text in stacking order, no layout impact. */}
        <View pointerEvents="none" style={styles.headerBlobWrap}>
          <View style={[styles.headerBlob, { backgroundColor: COLORS.primary, top: -50, left: 10 }]} />
          <View style={[styles.headerBlob, { backgroundColor: COLORS.purple, top: -20, right: 0 }]} />
        </View>
        <View style={styles.logoBadge}>
          <AppIcon emoji="🏏" size={42} color={COLORS.primary} />
        </View>
        <Text style={styles.appName}>CricketScorer</Text>
        <Text style={styles.tagline}>Score every ball, track every match</Text>
      </View>
      <Card tone="base" elevation="lg" padded={false} accent={COLORS.primary} style={styles.card}>
        <Text style={styles.cardTitle}>{titleFor()}</Text>
        <Text style={styles.cardSub}>{subFor()}</Text>

        {mode === "phone" && (
          <>
            <View style={styles.phoneRow}>
              <View style={styles.countryBox}>
                <Text style={styles.flag}>🇮🇳</Text>
                <Text style={styles.countryCode}>+91</Text>
              </View>
              <TextInput style={styles.phoneInput} placeholder="Enter mobile number" placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" maxLength={10} value={phone} onChangeText={setPhone} selectionColor={COLORS.primary} />
            </View>
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={checkNumber} disabled={loading}>
              {loading ? <ActivityIndicator color={COLORS.onPrimary} /> : <Text style={styles.btnText}>Continue</Text>}
            </TouchableOpacity>
          </>
        )}

        {mode === "verify-otp" && (
  <>
    <TextInput style={styles.otpInput} placeholder="Enter OTP" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} selectionColor={COLORS.primary} />
    <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleVerifyRegistrationOtp} disabled={loading}>
      {loading ? <ActivityIndicator color={COLORS.onPrimary} /> : <Text style={styles.btnText}>Verify OTP</Text>}
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
            <TextInput style={styles.otpInput} placeholder="Set 4-6 digit PIN" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" maxLength={6} secureTextEntry value={pin} onChangeText={setPin} selectionColor={COLORS.primary} />
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
            <TextInput style={styles.otpInput} placeholder="Re-enter PIN" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" maxLength={6} secureTextEntry value={confirmPinValue} onChangeText={setConfirmPinValue} selectionColor={COLORS.primary} />
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleConfirmPinAndCreate} disabled={loading}>
              {loading ? <ActivityIndicator color={COLORS.onPrimary} /> : <Text style={styles.btnText}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={() => setMode("setup-pin")}>
              <Text style={styles.changeBtnText}>Back</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "login-pin" && (
          <>
            <TextInput style={styles.otpInput} placeholder="Enter PIN" placeholderTextColor={COLORS.textMuted} keyboardType="number-pad" maxLength={6} secureTextEntry value={pin} onChangeText={setPin} selectionColor={COLORS.primary} />
            <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleLogin} disabled={loading}>
              {loading ? <ActivityIndicator color={COLORS.onPrimary} /> : <Text style={styles.btnText}>Login</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={() => navigation.navigate("ForgotPassword", { phone })}>
              <Text style={styles.changeBtnText}>Forgot Password?</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.changeBtn} onPress={goBackToPhone}>
              <Text style={styles.changeBtnText}>Change Number</Text>
            </TouchableOpacity>
          </>
        )}
      </Card>
      <Text style={styles.footer}>
        {mode === "login-pin"
          ? "Logging in here will sign you out of any other device."
          : "By continuing, you agree to our Terms of Service"}
      </Text>
    </KeyboardAvoidingView>
  );
}

// Every colour here used to be a one-off hex that belonged to no palette
// (a blue-ish #0a1628 / #1e2d45 scheme), so the app's first screen did not
// look like the rest of the app. All of it now comes from the design tokens.
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, justifyContent: "center", paddingHorizontal: SPACING.lg + 4 },
  header: { alignItems: "center", marginBottom: SPACING.xl },
  // Wrapper that clips the decorative blobs to a band behind the logo, so
  // they never bleed into the card below. Purely decorative, non-interactive.
  headerBlobWrap: { position: "absolute", top: -30, left: -40, right: -40, height: 190, overflow: "hidden" },
  headerBlob: { position: "absolute", width: 160, height: 160, borderRadius: 80, opacity: 0.18 },
  // The bat icon sits in a tinted, glowing tile instead of floating bare on
  // the background — it reads as a logo mark rather than a stray glyph.
  logoBadge: {
    width: 84, height: 84, borderRadius: RADIUS.xl,
    backgroundColor: COLORS.primarySoft,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: "center", justifyContent: "center",
    marginBottom: SPACING.md,
    ...SHADOW.glow(COLORS.primary),
  },
  appName: { ...TYPE.h1, fontSize: 30, color: COLORS.text },
  tagline: { ...TYPE.body, color: COLORS.primaryLight, marginTop: SPACING.xs, letterSpacing: 0.2 },
  // Padding only: the surface, radius, border and elevation come from <Card>.
  card: { padding: SPACING.lg + 4 },
  cardTitle: { ...TYPE.h1, fontSize: 22, color: COLORS.text, marginBottom: SPACING.xs },
  cardSub: { ...TYPE.body, color: COLORS.textSecondary, marginBottom: SPACING.lg, lineHeight: 20 },
  phoneRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.card2, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.md, overflow: "hidden",
  },
  // Darker than the field itself, so the fixed +91 reads as a prefix rather
  // than part of what you type.
  countryBox: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.md, paddingVertical: 17,
    borderRightWidth: 1, borderRightColor: COLORS.border,
    backgroundColor: COLORS.card, gap: 6,
  },
  flag: { fontSize: 18 },
  countryCode: { ...TYPE.title, color: COLORS.text },
  // Tabular figures: a phone number should not reflow as digits are typed.
  phoneInput: { flex: 1, ...TYPE.num, fontSize: 18, color: COLORS.text, paddingHorizontal: SPACING.md, paddingVertical: 17, letterSpacing: 1.5 },
  otpInput: {
    backgroundColor: COLORS.card2, color: COLORS.text,
    ...TYPE.displaySm, fontSize: 24, textAlign: "center", letterSpacing: 12,
    paddingVertical: 18, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.md,
  },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    height: 54, alignItems: "center", justifyContent: "center",
    ...SHADOW.glow(COLORS.primary),
  },
  // A darker violet rather than grey: still clearly the same button, clearly
  // not pressable, and white-on-violet label stays legible while it says "Next".
  btnDisabled: { backgroundColor: COLORS.primaryDark, shadowOpacity: 0, elevation: 0 },
  btnText: { ...TYPE.button, fontSize: 16, color: COLORS.onPrimary },
  changeBtn: { alignItems: "center", marginTop: SPACING.md, paddingVertical: 4 },
  changeBtnText: { ...TYPE.bodyStrong, color: COLORS.primaryLight },
  footer: { ...TYPE.caption, fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginTop: SPACING.xl, lineHeight: 16, paddingHorizontal: SPACING.md },
});
