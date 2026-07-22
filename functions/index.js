const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// For cost control, caps concurrent container scaling per function.
setGlobalOptions({ maxInstances: 10 });

// Mints an auth token bound to a STABLE uid derived from the phone number,
// not a random anonymous uid. Same phone -> same uid -> same custom token
// subject, on every device. Call only after the PIN has already been
// verified against pinAuth/{phone} — loginWithPin/createPinAccount already
// do that check before calling this.
exports.mintPhoneSessionToken = functions.https.onCall(async (data, context) => {
  const phone = (data.phone || '').replace(/\D/g, '');
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
exports.verifyPhoneNotClaimed = functions.https.onCall(async (data, context) => {
  const newPhone = (data.newPhone || '').replace(/\D/g, '');
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