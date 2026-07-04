// @ts-nocheck
// ── PIN Auth Service ──────────────────────────────────────────
// Handles phone+PIN account creation/login and single-active-device
// session enforcement, backed by Firebase Realtime Database.
//
// Data shape at pinAuth/{phoneNumber}:
// {
//   phoneNumber: string,
//   salt: string,
//   pinHash: string,
//   activeSessionId: string,
//   uid: string,               // linked anonymous auth uid
//   createdAt: number,
//   lastLoginAt: number,
// }

import database from '@react-native-firebase/database';
import auth from '@react-native-firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateSalt, generateSessionId, hashPin, verifyPin, normalizePhone } from './pinAuth';

const LOCAL_SESSION_KEY = 'cricketscorer_session_id';
const LOCAL_PHONE_KEY = 'cricketscorer_phone';

// Checks if a phone number already has a PIN account set up.
export const checkPhoneExists = async (phone: string): Promise<boolean> => {
  const key = normalizePhone(phone);
  const snap = await database().ref(`pinAuth/${key}`).once('value');
  return snap.exists();
};

// Creates a new PIN account for a phone number. Call only after
// confirming checkPhoneExists() returned false.
export const createPinAccount = async (phone: string, pin: string): Promise<string> => {
  const key = normalizePhone(phone);

  // Ensure we have an anonymous Firebase Auth session — reuses your
  // existing signInAnonymously() pattern so all your other firebase.ts
  // functions (getCurrentUser, saveTeam, etc.) keep working unchanged.
  let user = auth().currentUser;
  if (!user) {
    const cred = await auth().signInAnonymously();
    user = cred.user;
  }

  const salt = generateSalt();
  const pinHash = hashPin(pin, salt);
  const sessionId = generateSessionId();

  await database().ref(`pinAuth/${key}`).set({
    phoneNumber: key,
    salt,
    pinHash,
    activeSessionId: sessionId,
    uid: user.uid,
    createdAt: Date.now(),
    lastLoginAt: Date.now(),
  });

  await AsyncStorage.setItem(LOCAL_SESSION_KEY, sessionId);
  await AsyncStorage.setItem(LOCAL_PHONE_KEY, key);

  return sessionId;
};

// Verifies a PIN attempt for an existing account. On success, generates
// a NEW session ID and overwrites activeSessionId — this is what forces
// any other device using this phone number to be logged out, since their
// locally-stored session ID will no longer match.
export const loginWithPin = async (phone: string, pin: string): Promise<{ success: boolean; error?: string }> => {
  const key = normalizePhone(phone);
  const snap = await database().ref(`pinAuth/${key}`).once('value');
  const record = snap.val();

  if (!record) {
    return { success: false, error: 'No account found for this number. Please set up a PIN first.' };
  }

  const isValid = verifyPin(pin, record.salt, record.pinHash);
  if (!isValid) {
    return { success: false, error: 'Incorrect PIN. Please try again.' };
  }

  // Sign in anonymously as the SAME uid this phone was originally linked to
  // isn't directly possible (anonymous auth can't "resume" a specific uid
  // across devices) — so we sign in fresh anonymously on this device, and
  // rely on the pinAuth/{phone} record (not the auth uid) as the source of
  // truth for "who this phone number belongs to." Your data functions that
  // key off getCurrentUser().uid for personal data (teams, matches) will
  // need to key off the phone number instead if cross-device data access
  // is required — flag this to Claude if that's the case, it's a bigger
  // change than session locking alone.
  if (!auth().currentUser) {
    await auth().signInAnonymously();
  }

  const newSessionId = generateSessionId();
  await database().ref(`pinAuth/${key}`).update({
    activeSessionId: newSessionId,
    lastLoginAt: Date.now(),
  });

  await AsyncStorage.setItem(LOCAL_SESSION_KEY, newSessionId);
  await AsyncStorage.setItem(LOCAL_PHONE_KEY, key);

  return { success: true };
};

// Call once at app startup (or in your root navigator) to watch for
// this device's session being invalidated by a login elsewhere.
// Returns an unsubscribe function.
export const subscribeToSessionValidity = (
  onInvalidated: () => void
): (() => void) => {
  let ref: any = null;

  (async () => {
    const phone = await AsyncStorage.getItem(LOCAL_PHONE_KEY);
    if (!phone) return;

    ref = database().ref(`pinAuth/${phone}/activeSessionId`);
    ref.on('value', async (snap: any) => {
      const remoteSessionId = snap.val();
      const localSessionId = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
      if (remoteSessionId && localSessionId && remoteSessionId !== localSessionId) {
        onInvalidated();
      }
    });
  })();

  return () => {
    if (ref) ref.off('value');
  };
};

// Local logout — clears this device's session so it stops being "active"
// (does not affect other devices, use only for an explicit user logout).
export const logoutLocalSession = async () => {
  await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
  await AsyncStorage.removeItem(LOCAL_PHONE_KEY);
};

// Change PIN — requires the current PIN for verification.
export const changePin = async (phone: string, oldPin: string, newPin: string): Promise<{ success: boolean; error?: string }> => {
  const key = normalizePhone(phone);
  const snap = await database().ref(`pinAuth/${key}`).once('value');
  const record = snap.val();
  if (!record) return { success: false, error: 'Account not found.' };

  if (!verifyPin(oldPin, record.salt, record.pinHash)) {
    return { success: false, error: 'Current PIN is incorrect.' };
  }

  const newSalt = generateSalt();
  const newHash = hashPin(newPin, newSalt);
  await database().ref(`pinAuth/${key}`).update({ salt: newSalt, pinHash: newHash });
  return { success: true };
};

// -- Forgot Password / PIN Reset via Firebase Phone Auth OTP -------------
export const startForgotPasswordOtp = async (phone: string) => {
  const key = normalizePhone(phone);
  const exists = await checkPhoneExists(key);
  if (!exists) {
    return { success: false, error: 'No account found for this number.' };
  }
  try {
    const confirmation = await auth().signInWithPhoneNumber('+91' + key); // TODO: swap to a country picker if you support non-India numbers
    return { success: true, confirmation };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Could not send OTP. Check the number and try again.' };
  }
};

export const verifyForgotPasswordOtp = async (confirmation: any, code: string) => {
  try {
    await confirmation.confirm(code);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: 'Incorrect or expired code. Please try again.' };
  }
};

export const resetPinWithPhoneAuth = async (phone: string, newPin: string): Promise<{ success: boolean; error?: string }> => {
  const key = normalizePhone(phone);
  const snap = await database().ref(`pinAuth/${key}`).once('value');
  const record = snap.val();
  if (!record) return { success: false, error: 'Account not found.' };

  const newSalt = generateSalt();
  const newHash = hashPin(newPin, newSalt);
  const newSessionId = generateSessionId();

  await database().ref(`pinAuth/${key}`).update({
    salt: newSalt,
    pinHash: newHash,
    activeSessionId: newSessionId,
    lastLoginAt: Date.now(),
  });

  if (!auth().currentUser) {
    await auth().signInAnonymously();
  }

  await AsyncStorage.setItem(LOCAL_SESSION_KEY, newSessionId);
  await AsyncStorage.setItem(LOCAL_PHONE_KEY, key);

  return { success: true };
};