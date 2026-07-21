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

const crypto = require('crypto');
// Razorpay key ID/secret should be set via: firebase functions:config:set razorpay.key_id="..." razorpay.key_secret="..."
// then read here as functions.config().razorpay.key_id / key_secret — NEVER hardcode secrets in this file.

const Razorpay = require('razorpay'); // npm install razorpay (in functions/ folder)

const STREAM_PACKAGES = {
  pkg_1: { matches: 1, amountPaise: 9900 },   // ₹99
  pkg_2: { matches: 2, amountPaise: 19900 },  // ₹199
  pkg_5: { matches: 5, amountPaise: 44900 },  // ₹449
  pkg_10: { matches: 10, amountPaise: 79900 }, // ₹799
};

// Creates a Razorpay order server-side, with the amount fixed by package ID
// — the client can never influence the actual charged amount.
exports.createStreamOrder = functions.https.onCall(async (data, context) => {
  const pkg = STREAM_PACKAGES[data.packageId];
  if (!pkg) throw new functions.https.HttpsError('invalid-argument', 'Invalid package');

  const config = functions.config();
  const razorpay = new Razorpay({ key_id: config.razorpay.key_id, key_secret: config.razorpay.key_secret });

  const order = await razorpay.orders.create({
    amount: pkg.amountPaise,
    currency: 'INR',
    receipt: 'stream_' + Date.now(),
  });

  return { orderId: order.id, amount: pkg.amountPaise, keyId: config.razorpay.key_id };
});

// Verifies the payment signature server-side (mandatory — never trust a
// client-reported "payment succeeded") before crediting stream matches.
exports.verifyStreamPayment = functions.https.onCall(async (data, context) => {
  const { orderId, paymentId, signature, packageId, uid } = data;
  const pkg = STREAM_PACKAGES[packageId];
  if (!pkg) throw new functions.https.HttpsError('invalid-argument', 'Invalid package');

  const config = functions.config();
  const expectedSignature = crypto
    .createHmac('sha256', config.razorpay.key_secret)
    .update(orderId + '|' + paymentId)
    .digest('hex');

  if (expectedSignature !== signature) {
    throw new functions.https.HttpsError('permission-denied', 'Payment verification failed');
  }

  // Credit the matches only after signature is confirmed valid.
  const creditRef = admin.database().ref('users/' + uid + '/streamCredits');
  await creditRef.transaction((current) => (current ?? 0) + pkg.matches);

  return { success: true, creditsAdded: pkg.matches };
});