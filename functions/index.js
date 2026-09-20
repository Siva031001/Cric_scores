const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {GoogleGenerativeAI} = require("@google/generative-ai");
const PDFDocument = require("pdfkit");
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
// ───────────────────────────────────────────────────────────
// SCORECARD PDF
// ───────────────────────────────────────────────────────────
// Mirrors the layout of ScorecardScreen.tsx (batting table, extras, bowling
// table, per innings, result + Man of the Match) so a shared PDF reads as
// the same document, not a generic export. pdfkit draws directly onto the
// PDF canvas (no headless-browser dependency), which keeps this function
// small and fast to cold-start.

const PDF_STAT_KEY = (id) => 'p' + id;

const PDF_FORMAT_DISMISSAL = (bs, bowlingPlayers) => {
  if (!bs.isOut) return 'not out';
  const bowlerName = bowlingPlayers?.find((p) => p.id === bs.bowlerId)?.name;
  const fielder = bs.fielderName && bs.fielderName !== 'Skip' ? bs.fielderName : null;
  switch (bs.dismissalType) {
    case 'CAUGHT':
    case 'CAUGHT_AND_BOWLED': return (fielder ? 'c ' + fielder + ' ' : 'c & ') + 'b ' + (bowlerName ?? '?');
    case 'BOWLED': return 'b ' + (bowlerName ?? '?');
    case 'LBW': return 'lbw b ' + (bowlerName ?? '?');
    case 'HIT_WICKET': return 'hit wkt b ' + (bowlerName ?? '?');
    case 'RUN_OUT': return 'Run Out' + (fielder ? ' (' + fielder + ')' : '');
    case 'STUMPED': return 'st ' + (fielder ?? '?') + ' b ' + (bowlerName ?? '?');
    case 'RETIRED_OUT': return 'retired';
    default: return bs.dismissalType ?? 'out';
  }
};

const PDF_COLORS = {
  primary: '#16a34a',
  primaryDark: '#0f5c28',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  band: '#eefaf1',
};

/** A simple ruled table: header row + data rows, columns given as {label, width, align}. */
function pdfTable(doc, x, y, columns, rows, opts = {}) {
  const rowHeight = opts.rowHeight ?? 16;
  let curY = y;
  doc.rect(x, curY, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill(PDF_COLORS.band);
  doc.fillColor(PDF_COLORS.muted).fontSize(8).font('Helvetica-Bold');
  let curX = x;
  columns.forEach((c) => {
    doc.text(c.label, curX + 4, curY + 4, { width: c.width - 8, align: c.align ?? 'left' });
    curX += c.width;
  });
  curY += rowHeight;
  doc.font('Helvetica').fontSize(9).fillColor(PDF_COLORS.text);
  rows.forEach((row) => {
    curX = x;
    const lineHeight = row.sub ? rowHeight + 8 : rowHeight;
    columns.forEach((c, i) => {
      doc.fontSize(9).fillColor(PDF_COLORS.text)
        .text(String(row.cells[i] ?? ''), curX + 4, curY + 4, { width: c.width - 8, align: c.align ?? 'left' });
      curX += c.width;
    });
    if (row.sub) {
      doc.fontSize(7.5).fillColor(PDF_COLORS.muted).text(row.sub, x + 4, curY + 16, { width: columns[0].width - 8 });
    }
    doc.moveTo(x, curY + lineHeight).lineTo(x + columns.reduce((s, c) => s + c.width, 0), curY + lineHeight)
      .strokeColor(PDF_COLORS.border).lineWidth(0.5).stroke();
    curY += lineHeight;
  });
  return curY;
}

function pdfInnings(doc, y, teamName, inn, battingPlayers, bowlingPlayers) {
  const pageWidth = doc.page.width - 80;
  let curY = y;

  doc.fontSize(13).fillColor(PDF_COLORS.primaryDark).font('Helvetica-Bold')
    .text(`${teamName} — ${inn?.runs ?? 0}/${inn?.wickets ?? 0} (${inn?.overs ?? 0}.${inn?.balls ?? 0} ov)`, 40, curY);
  curY += 22;

  const battedOrIn = [];
  const yetToBat = [];
  (battingPlayers ?? []).forEach((p) => {
    const bs = inn?.batsmanStats?.[PDF_STAT_KEY(p.id)];
    if (bs && (bs.balls > 0 || bs.isOut)) battedOrIn.push({ p, bs });
    else if (inn && (p.id === inn.strikerId || p.id === inn.nonStrikerId)) {
      battedOrIn.push({ p, bs: bs ?? { runs: 0, balls: 0, fours: 0, sixes: 0, isOut: false } });
    } else yetToBat.push(p);
  });

  const battingCols = [
    { label: 'BATTER', width: pageWidth * 0.36 },
    { label: 'R', width: pageWidth * 0.12, align: 'right' },
    { label: 'B', width: pageWidth * 0.12, align: 'right' },
    { label: '4s', width: pageWidth * 0.12, align: 'right' },
    { label: '6s', width: pageWidth * 0.12, align: 'right' },
    { label: 'SR', width: pageWidth * 0.16, align: 'right' },
  ];
  const battingRows = battedOrIn.map(({ p, bs }) => ({
    cells: [
      p.name + (p.isCaptain ? ' (C)' : '') + (p.isWicketKeeper ? ' (WK)' : ''),
      bs.runs, bs.balls, bs.fours ?? 0, bs.sixes ?? 0,
      bs.balls > 0 ? ((bs.runs / bs.balls) * 100).toFixed(0) : '0',
    ],
    sub: PDF_FORMAT_DISMISSAL(bs, bowlingPlayers),
  }));
  curY = pdfTable(doc, 40, curY, battingCols, battingRows, { rowHeight: 16 });

  if (yetToBat.length > 0) {
    curY += 4;
    doc.fontSize(8).fillColor(PDF_COLORS.muted).font('Helvetica-Oblique')
      .text('Yet to bat: ' + yetToBat.map((p) => p.name).join(', '), 40, curY, { width: pageWidth });
    curY += 14;
  }

  const ext = inn?.extras ?? {};
  const totalExtras = (ext.wides ?? 0) + (ext.noBalls ?? 0) + (ext.byes ?? 0) + (ext.legByes ?? 0) + (ext.penalty ?? 0);
  curY += 6;
  doc.fontSize(9).fillColor(PDF_COLORS.text).font('Helvetica-Bold')
    .text(`Extras: ${totalExtras}`, 40, curY, { continued: true }).font('Helvetica').fillColor(PDF_COLORS.muted)
    .text(`  (W:${ext.wides ?? 0} NB:${ext.noBalls ?? 0} B:${ext.byes ?? 0} LB:${ext.legByes ?? 0} PTY:${ext.penalty ?? 0})`);
  curY += 20;

  const bowlerRows = Object.values(inn?.bowlerStats ?? {}).filter(
    (bw) => bw && ((bw.overs ?? 0) > 0 || (bw.balls ?? 0) > 0 || (bw.wides ?? 0) > 0 || (bw.noBalls ?? 0) > 0)
  );
  const bowlingCols = [
    { label: 'BOWLER', width: pageWidth * 0.4 },
    { label: 'O', width: pageWidth * 0.15, align: 'right' },
    { label: 'R', width: pageWidth * 0.15, align: 'right' },
    { label: 'W', width: pageWidth * 0.15, align: 'right' },
    { label: 'ECO', width: pageWidth * 0.15, align: 'right' },
  ];
  const bowlingTableRows = bowlerRows.map((bw) => {
    const name = bowlingPlayers?.find((p) => p.id === bw.playerId)?.name ?? `Player ${(bw.playerId ?? 0) + 1}`;
    const total = (bw.overs ?? 0) + (bw.balls ?? 0) / 6;
    const eco = total > 0 ? (bw.runs / total).toFixed(1) : '0.0';
    return { cells: [name, `${bw.overs ?? 0}.${bw.balls ?? 0}`, bw.runs ?? 0, bw.wickets ?? 0, eco] };
  });
  curY = pdfTable(doc, 40, curY, bowlingCols, bowlingTableRows, { rowHeight: 16 });

  return curY + 16;
}

exports.generateScorecardPdf = functions.https.onCall(async (request) => {
  const data = request.data ?? {};
  const matchId = data.matchId ?? '';
  const match = data.match;
  if (!matchId || !match) {
    throw new functions.https.HttpsError('invalid-argument', 'matchId and match are required.');
  }

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve, reject) => {
    doc.on('end', resolve);
    doc.on('error', reject);
  });

  // ── Branded header band ──
  doc.rect(0, 0, doc.page.width, 60).fill(PDF_COLORS.primary);
  doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold').text('🏏 CricketScorer', 40, 20);
  doc.fontSize(9).font('Helvetica').text('Official Scorecard', 40, 42);

  let y = 80;
  doc.fillColor(PDF_COLORS.text).fontSize(16).font('Helvetica-Bold')
    .text(`${match.team1} vs ${match.team2}`, 40, y, { width: doc.page.width - 80, align: 'center' });
  y += 24;
  doc.fontSize(9).fillColor(PDF_COLORS.muted).font('Helvetica')
    .text([match.venue, match.matchDate, `Match ID: ${matchId}`].filter(Boolean).join('   •   '),
      40, y, { width: doc.page.width - 80, align: 'center' });
  y += 22;

  if (match.winner) {
    doc.rect(40, y, doc.page.width - 80, 26).fill(PDF_COLORS.band);
    doc.fillColor(PDF_COLORS.primaryDark).fontSize(11).font('Helvetica-Bold')
      .text(match.winner, 40, y + 7, { width: doc.page.width - 80, align: 'center' });
    y += 36;
  } else {
    y += 10;
  }

  if (match.innings1) {
    y = pdfInnings(doc, y, match.team1, match.innings1, match.team1Players, match.team2Players);
  }
  if (match.innings2) {
    if (y > doc.page.height - 200) { doc.addPage(); y = 40; }
    y = pdfInnings(doc, y, match.team2, match.innings2, match.team2Players, match.team1Players);
  }

  if (match.manOfMatch) {
    if (y > doc.page.height - 100) { doc.addPage(); y = 40; }
    doc.rect(40, y, doc.page.width - 80, 50).fill(PDF_COLORS.band);
    doc.fillColor(PDF_COLORS.primaryDark).fontSize(10).font('Helvetica-Bold')
      .text('MAN OF THE MATCH', 50, y + 8);
    doc.fontSize(11).fillColor(PDF_COLORS.text)
      .text(`${match.manOfMatch.name} (${match.manOfMatch.teamName})`, 50, y + 22);
    y += 60;
  }

  doc.fontSize(7).fillColor(PDF_COLORS.muted)
    .text(`Generated by CricketScorer on ${new Date().toLocaleString()}`, 40, doc.page.height - 40, {
      width: doc.page.width - 80, align: 'center',
    });

  doc.end();
  await done;
  const buffer = Buffer.concat(chunks);

  const bucket = admin.storage().bucket();
  const filePath = `scorecard_pdfs/${matchId}.pdf`;
  const file = bucket.file(filePath);
  // Not getSignedUrl(): that needs the IAM "Service Account Token Creator"
  // role to sign a blob, which Cloud Functions' default service account
  // does not have — every call failed with a permissions error, surfaced to
  // the app as "Could not generate PDF". A Firebase Storage download token
  // (the same mechanism the client SDK's getDownloadURL() uses) needs no
  // IAM role at all: it's just a UUID stashed in the file's own metadata.
  const downloadToken = require('crypto').randomUUID();
  await file.save(buffer, {
    contentType: 'application/pdf',
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filePath)}?alt=media&token=${downloadToken}`;

  return { url };
});
