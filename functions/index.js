const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {GoogleGenerativeAI} = require("@google/generative-ai");
admin.initializeApp();

// For cost control, caps concurrent container scaling per function.
setGlobalOptions({ maxInstances: 10 });

// Mints an auth token bound to a STABLE uid derived from the phone number,
// not a random anonymous uid. Same phone -> same uid -> same custom token
// subject, on every device.
//
// ⚠ SECURITY DEBT — DELIBERATE, TEMPORARY REVERT TO THE PRE-v3 BEHAVIOUR.
//
// This function performs NO proof-of-identity check: it will mint a token for
// ANY 10-digit number a caller asks for. The PIN is verified client-side in
// loginWithPin (src/utils/pinAuthService.ts) and that verdict is trusted here.
// A crafted client can therefore impersonate any user.
//
// It briefly did the right thing — verified the PIN hash here with the admin
// SDK, required a phone-verified request.auth session for the OTP paths, and
// enforced a 5-attempt / 15-minute lockout via a transaction. That was
// reverted because it broke login in production and, critically, it was
// buying nothing: the database rules grant `pinAuth/$phone` a public
// `.write`, so an attacker can simply overwrite `pinHash` with their own and
// then log in through the front door. The server-side check only raises the
// bar once those rules are locked down.
//
// TO RESTORE (do these together, in this order, or login breaks again):
//   1. Tighten the pinAuth rules so only the owning uid can read/write the
//      record, and make pinFailedAttempts / pinLockedUntil client-unwritable
//      (otherwise the lockout counter is reset with one request).
//   2. Re-add the PIN check + request.auth check + lockout transaction here.
//   3. Switch loginWithPin back to sending { phone, pin } and stop verifying
//      the PIN on the device.
// Reverting only part of this is what caused the outage.
exports.mintPhoneSessionToken = functions.https.onCall(async (request) => {
  const rawPhone = request.data?.phone ?? '';
  const phone = String(rawPhone).replace(/\D/g, '');

  if (!/^\d{10}$/.test(phone)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number');
  }

  const stableUid = 'phone_' + phone;
  const customToken = await admin.auth().createCustomToken(stableUid);
  return { token: customToken, uid: stableUid };
});

// Verifies a phone number is not already claimed by a DIFFERENT account
// before allowing a phone-number CHANGE. Called from the (future) "change
// phone number" flow — rejects if pinAuth/{newPhone} already exists for
// someone else, satisfying "cannot switch to another user's number."
exports.verifyPhoneNotClaimed = functions.https.onCall(async (request) => {
  const rawNewPhone = request.data?.newPhone ?? '';
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

// Same "does this phone have an account" check the login screen needs
// pre-auth, but returning only a boolean instead of the full pinAuth/{phone}
// record. checkPhoneExists in pinAuthService.ts used to read salt+pinHash
// directly (an unauthenticated client can still read that record today for
// other reasons, but callers that only need existence should not have to
// fetch the hash at all) — this gives them a path that never does.
exports.checkPhoneExistsSafe = functions.https.onCall(async (request) => {
  const rawPhone = request.data?.phone ?? '';
  const phone = String(rawPhone).replace(/\D/g, '');
  if (!/^\d{10}$/.test(phone)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid phone number');
  }
  const snap = await admin.database().ref('pinAuth/' + phone).once('value');
  return { exists: snap.exists() };
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

// v2 declares secrets as an options object on onCall itself. The v1
// .runWith({secrets}) form would deploy this as a 1st-gen function, which
// cannot run the Node version this codebase targets.
exports.generateMatchSummary = functions.https.onCall({ secrets: ["GEMINI_API_KEY"] }, async (request) => {
  const data = request.data ?? {};
  const matchId = data.matchId ?? '';
  const match = data.match;
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