const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const crypto = require("crypto");
const {GoogleGenerativeAI} = require("@google/generative-ai");
admin.initializeApp();

// For cost control, caps concurrent container scaling per function.
setGlobalOptions({ maxInstances: 10 });

// Mirrors the otpAttempts lockout shape used for Forgot-Password OTP in
// pinAuthService.ts, but for PIN-login brute-force attempts. Stored on the
// account record itself (pinAuth/{phone}) since that's the record being
// guarded, and tracking it server-side means a fresh app install/reinstall
// can't reset the counter.
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// Mints an auth token bound to a STABLE uid derived from the phone number,
// not a random anonymous uid. Same phone -> same uid -> same custom token
// subject, on every device. Two callers, two different proofs required:
//   - loginWithPin (no Firebase Auth session exists — pure PIN check): the
//     client sends { phone, pin }. The PIN is verified HERE, server-side,
//     against pinAuth/{phone} via the admin SDK (which bypasses client
//     security rules), with failed-attempt lockout enforced here too since
//     this is the real enforcement point — a client-side "trust me, I
//     checked" claim proves nothing.
//   - createPinAccount / resetPinWithPhoneAuth (OTP-verified path): the
//     client sends just { phone } and must arrive here with the
//     phone-verified Firebase Auth session from signInWithPhoneNumber/
//     confirm() still intact. Firebase sets context.auth.token.phone_number
//     automatically for phone-auth sign-ins, so we check that instead.
exports.mintPhoneSessionToken = functions.https.onCall(async (data, context) => {
  // Defensive: some client/server callable-protocol version mismatches wrap
  // the actual payload one level deeper as data.data — handle both shapes.
  const rawPhone = data?.phone ?? data?.data?.phone ?? '';
  const phone = String(rawPhone).replace(/\D/g, '');
  const pin = data?.pin ?? data?.data?.pin;

  console.log('mintPhoneSessionToken - rawPhone:', rawPhone, 'parsedPhone:', phone);

  if (!/^\d{10}$/.test(phone)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number: received "' + rawPhone + '"');
  }

  if (pin !== undefined && pin !== null) {
    const ref = admin.database().ref('pinAuth/' + phone);
    const snap = await ref.once('value');
    const record = snap.val();
    if (!record) {
      throw new functions.https.HttpsError('not-found', 'No account found for this number. Please set up a PIN first.');
    }

    const now = Date.now();
    if (record.pinLockedUntil && now < record.pinLockedUntil) {
      throw new functions.https.HttpsError('resource-exhausted', 'Too many incorrect attempts. Please try again later.');
    }

    // Same algorithm as hashPin in src/utils/pinAuth.ts (SHA256 of pin+salt
    // as a hex string) — Node's crypto module produces an identical digest
    // to CryptoJS's SHA256(...).toString() here.
    const computedHash = crypto.createHash('sha256').update(String(pin) + record.salt).digest('hex');
    if (computedHash !== record.pinHash) {
      const newCount = (record.pinFailedAttempts ?? 0) + 1;
      const update = { pinFailedAttempts: newCount };
      if (newCount >= MAX_PIN_ATTEMPTS) {
        update.pinFailedAttempts = 0;
        update.pinLockedUntil = now + PIN_LOCKOUT_MS;
      }
      await ref.update(update);
      throw new functions.https.HttpsError('permission-denied', 'Incorrect PIN. Please try again.');
    }

    if (record.pinFailedAttempts || record.pinLockedUntil) {
      await ref.update({ pinFailedAttempts: 0, pinLockedUntil: null });
    }
  } else {
    const expectedPhoneNumber = '+91' + phone;
    if (!context.auth || context.auth.token.phone_number !== expectedPhoneNumber) {
      throw new functions.https.HttpsError('permission-denied', 'Phone verification required.');
    }
  }

  const stableUid = 'phone_' + phone;
  const customToken = await admin.auth().createCustomToken(stableUid);
  return { token: customToken, uid: stableUid };
});

// Verifies a phone number is not already claimed by a DIFFERENT account
// before allowing a phone-number CHANGE. Called from the (future) "change
// phone number" flow — rejects if pinAuth/{newPhone} already exists for
// someone else, satisfying "cannot switch to another user's number."
exports.verifyPhoneNotClaimed = functions.https.onCall(async (data, context) => {
  const rawNewPhone = data?.newPhone ?? data?.data?.newPhone ?? '';
  const newPhone = String(rawNewPhone).replace(/\D/g, '');
  if (!/^\d{10}$/.test(newPhone)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number');
  }
  const snap = await admin.database().ref('pinAuth/' + newPhone).once('value');
  if (snap.exists()) {
    throw new functions.https.HttpsError('already-exists', 'This phone number is already registered to another account.');
  }
  return { available: true };
});

// NOTE: Paid live-streaming (createStreamOrder / verifyStreamPayment via
// Razorpay) intentionally deferred until payment integration is actually
// being wired up. Re-add those two functions + `npm install razorpay` in
// this folder, plus `firebase functions:config:set razorpay.key_id=...
// razorpay.key_secret=...` with real keys, when that phase begins.

// ───────────────────────────────────────────────────────────
// AI MATCH SUMMARY — Gemini call, server-side only. The key must never be
// embedded in the client bundle (it was, previously — see
// src/utils/aiConfig.ts history); it is read here from the GEMINI_API_KEY
// secret via `firebase functions:secrets:set GEMINI_API_KEY`.
// ───────────────────────────────────────────────────────────
const buildMatchSummaryPrompt = (match) => {
  const i1 = match.innings1 ?? {};
  const i2 = match.innings2 ?? {};

  const topBatter = (inn, players) => {
    const entries = Object.values(inn.batsmanStats ?? {});
    const best = entries.filter(Boolean).sort((a, b) => (b?.runs ?? 0) - (a?.runs ?? 0))[0];
    if (!best || (best.runs ?? 0) === 0) return null;
    const name = players?.find((p) => p.id === best.playerId)?.name ?? 'A batter';
    return name + ' (' + best.runs + ' off ' + best.balls + ')';
  };
  const topBowler = (inn, players) => {
    const entries = Object.values(inn.bowlerStats ?? {});
    const best = entries.filter(Boolean).sort((a, b) => (b?.wickets ?? 0) - (a?.wickets ?? 0))[0];
    if (!best || (best.wickets ?? 0) === 0) return null;
    const name = players?.find((p) => p.id === best.playerId)?.name ?? 'A bowler';
    return name + ' (' + best.wickets + '/' + best.runs + ')';
  };

  const i1Top = topBatter(i1, match.team1Players);
  const i2Top = topBatter(i2, match.team2Players);
  const i1BestBowl = topBowler(i1, match.team2Players);
  const i2BestBowl = topBowler(i2, match.team1Players);

  return [
    'Write a short, exciting 3-4 sentence cricket match summary in the style of a sports journalist, based on this data. Do not invent any facts not given below.',
    'Team 1: ' + match.team1 + ' scored ' + (i1.runs ?? 0) + '/' + (i1.wickets ?? 0) + ' in ' + (i1.overs ?? 0) + '.' + (i1.balls ?? 0) + ' overs.',
    'Team 2: ' + match.team2 + ' scored ' + (i2.runs ?? 0) + '/' + (i2.wickets ?? 0) + ' in ' + (i2.overs ?? 0) + '.' + (i2.balls ?? 0) + ' overs.',
    'Result: ' + (match.winner ?? 'No result'),
    i1Top ? ('Top scorer for ' + match.team1 + ': ' + i1Top) : '',
    i2Top ? ('Top scorer for ' + match.team2 + ': ' + i2Top) : '',
    i1BestBowl ? ('Best bowler vs ' + match.team1 + ': ' + i1BestBowl) : '',
    i2BestBowl ? ('Best bowler vs ' + match.team2 + ': ' + i2BestBowl) : '',
  ].filter(Boolean).join('\n');
};

exports.generateMatchSummary = functions.runWith({ secrets: ["GEMINI_API_KEY"] }).https.onCall(async (data, context) => {
  const matchId = data?.matchId ?? data?.data?.matchId ?? '';
  const match = data?.match ?? data?.data?.match;
  if (!matchId || !match) {
    throw new functions.https.HttpsError('invalid-argument', 'matchId and match are required.');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new functions.https.HttpsError('failed-precondition', 'AI summary is not configured.');
  }

  const prompt = buildMatchSummaryPrompt(match);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const result = await model.generateContent(prompt);
  const summaryText = result.response.text();
  if (!summaryText) {
    throw new functions.https.HttpsError('internal', 'No summary text in Gemini response.');
  }

  await admin.database().ref('matches/' + matchId).update({ summaryText, summaryGeneratedAt: Date.now() });
  return { summaryText };
});