// ── Database security-rules test suite ───────────────────────
//
// Runs against the LOCAL Firebase emulator, never production. Started by
// `firebase emulators:exec` with a demo- project id, so there is no path to
// real data even by mistake.
//
// Why this exists: the rules were never tested. An audit found that any
// unauthenticated caller could overwrite a PIN hash, that a single request
// could delete every match, and that thirteen per-field ownership rules on
// tournaments were dead code. Separately, tightening a rule without the
// matching client change caused a real login outage. Both problems have the
// same cause — no way to check a rule change before shipping it.
//
// The suite asserts two different things depending on which ruleset is loaded:
//   MODE=current   what the deployed rules do today, holes included, so the
//                  holes are documented and can't silently reappear
//   MODE=hardened  that the attacks are blocked AND that the app's own flows
//                  still work — the second half is what catches an outage
//                  before it ships
//
// No dependencies beyond Node's built-in fetch.

const allowed = (status) => status >= 200 && status < 300;
const denied = (status) => status === 401 || status === 403;

const MODE = process.env.MODE === 'hardened' ? 'hardened' : 'current';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-crikruns';
const DB = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const NS = `${PROJECT}-default-rtdb`;

// Reporting deliberately states what HAPPENED, not what was hoped for.
//
// The first version of this file printed a test NAME like "unauthenticated read
// is blocked" and passed whenever the assertion for the current mode held — so
// in `current` mode, where the attack is expected to succeed, it printed
// "ok  unauthenticated read is blocked" for a read that had just succeeded.
// The report claimed the rules were safe when it had proven the opposite. Never
// let the label drift from the observed result.
let pass = 0, broken = 0;
const holes = [];
const brokenFlows = [];

/** An attempted attack. Succeeding is a HOLE; being denied is what we want. */
const attack = (name, status) => {
  if (denied(status)) { pass++; console.log(`  BLOCKED   ${name}`); }
  else { holes.push(`${name} (HTTP ${status})`); console.log(`  !! HOLE   ${name} — SUCCEEDED (HTTP ${status})`); }
};

/** Something the app itself does. Being denied means we just broke the app. */
const mustWork = (name, status) => {
  if (allowed(status)) { pass++; console.log(`  ok        ${name}`); }
  else { broken++; brokenFlows.push(`${name} (HTTP ${status})`); console.log(`  BROKEN    ${name} — DENIED (HTTP ${status})`); }
};

/** An app flow the hardened rules are known to break; must be fixed in code first. */
const knownBreakage = (name, status, fixNote) => {
  if (denied(status)) { brokenFlows.push(`${name} — ${fixNote}`); console.log(`  BREAKS    ${name} (HTTP ${status})\n              -> ${fixNote}`); }
  else { pass++; console.log(`  ok        ${name}`); }
};

// The Auth emulator does not verify custom-token signatures, so an unsigned
// JWT with the uid we want is enough to obtain a real ID token for that uid.
// This is how we test rules that key off a specific auth.uid (the app's uids
// are 'phone_' + the 10-digit number).
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
// The emulator skips signature verification but DOES validate the claims. `aud`
// must be the real Identity Toolkit audience, and iss/sub must look like a
// service account — a placeholder is rejected with INVALID_CUSTOM_TOKEN.
const CUSTOM_TOKEN_AUD = 'https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit';
const SERVICE_ACCOUNT = `firebase-adminsdk@${PROJECT}.iam.gserviceaccount.com`;
const unsignedCustomToken = (uid) => {
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    uid,
    iat: now,
    exp: now + 3600,
    aud: CUSTOM_TOKEN_AUD,
    iss: SERVICE_ACCOUNT,
    sub: SERVICE_ACCOUNT,
  };
  return `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claims)}.sig`;
};

const tokenFor = async (uid) => {
  const r = await fetch(`http://${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: unsignedCustomToken(uid), returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error(`could not mint an emulator token for ${uid}: ${JSON.stringify(j)}`);
  return j.idToken;
};

const url = (path, token) => {
  const q = new URLSearchParams({ ns: NS });
  if (token === 'admin') q.set('auth', 'owner');       // emulator superuser, bypasses rules
  else if (token) q.set('auth', token);
  return `http://${DB}/${path}.json?${q}`;
};

const read = async (path, token) => (await fetch(url(path, token))).status;
const write = async (path, token, body) =>
  (await fetch(url(path, token), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status;
const patch = async (path, token, body) =>
  (await fetch(url(path, token), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status;
const del = async (path, token) => (await fetch(url(path, token), { method: 'DELETE' })).status;

const VICTIM = '9990001111';
const VICTIM_UID = 'phone_' + VICTIM;
const ATTACKER = '9990002222';
const ATTACKER_UID = 'phone_' + ATTACKER;

const seed = async () => {
  // Written as the emulator superuser so seeding is never itself under test.
  await write(`pinAuth/${VICTIM}`, 'admin', {
    phoneNumber: VICTIM, salt: 'seedsalt', pinHash: 'seedhash',
    activeSessionId: 'session-victim', uid: VICTIM_UID,
    createdAt: 1, lastLoginAt: 1, pinFailedAttempts: 4,
  });
  await write('matches/m_victim', 'admin', { id: 'm_victim', scorerId: VICTIM_UID, team1: 'A', team2: 'B' });
  await write('matches/m_other', 'admin', { id: 'm_other', scorerId: VICTIM_UID, team1: 'C', team2: 'D' });
  await write('players/p_victim', 'admin', { playerId: 'p_victim', name: 'Victim', createdBy: VICTIM_UID, accountId: VICTIM_UID, phoneNumber: VICTIM });
  await write('tournaments/t_victim', 'admin', { id: 't_victim', name: 'Victim Cup', createdBy: VICTIM_UID, startDate: '01/01/2026', endDate: '02/01/2026' });
  await write(`users/${VICTIM_UID}/profile`, 'admin', { uid: VICTIM_UID, name: 'Victim', photo: 'http://x/p.jpg' });
  await write(`otpLimits/${VICTIM}`, 'admin', { count: 3, windowStart: 1, lastSentAt: 1 });
};

const run = async () => {
  console.log(`\nRules suite — MODE=${MODE}, project=${PROJECT}\n`);
  await seed();
  const attacker = await tokenFor(ATTACKER_UID);
  const victim = await tokenFor(VICTIM_UID);
  const hardened = MODE === 'hardened';

  console.log('pinAuth — the PIN credential record');
  {
    attack('read a PIN record (salt + pinHash) with no auth', await read(`pinAuth/${VICTIM}`, null));
    const s2 = await patch(`pinAuth/${VICTIM}`, null, { pinHash: 'attackerhash', salt: 'attackersalt' });
    attack('overwrite a PIN hash with no auth (account takeover)', s2);
    if (allowed(s2)) await seed();
    const s3 = await patch(`pinAuth/${VICTIM}`, null, { pinFailedAttempts: 0, pinLockedUntil: null });
    attack('reset the brute-force lockout counter with no auth', s3);
    attack('force-logout another user by rewriting activeSessionId', await patch(`pinAuth/${VICTIM}`, attacker, { activeSessionId: 'hijacked' }));
    const s5 = await del(`pinAuth/${VICTIM}`, null);
    attack('delete an account record with no auth', s5);
    await seed();
  }

  console.log('\npinAuth — the owner must still be able to work');
  {
    mustWork('owner reads their own PIN record', await read(`pinAuth/${VICTIM}`, victim));
    mustWork('owner rotates their own session id (login does this)', await patch(`pinAuth/${VICTIM}`, victim, { activeSessionId: 'new-session', lastLoginAt: 2 }));
    if (hardened) {
      attack('owner edits their own lockout counter', await patch(`pinAuth/${VICTIM}`, victim, { pinFailedAttempts: 0 }));
    }
    await seed();
  }

  console.log('\nmatches');
  {
    const s = await del('matches', attacker);
    attack('delete the ENTIRE matches collection in one request', s);
    if (allowed(s)) await seed();
    const s2 = await patch('matches/m_victim', attacker, { team1: 'TAMPERED' });
    attack("tamper with another scorer's live match", s2);
    if (allowed(s2)) await seed();
    mustWork('scorer reads their own match', await read('matches/m_victim', victim));
    mustWork('scorer updates their own match', await patch('matches/m_victim', victim, { team1: 'A2' }));
  }

  console.log('\nplayers');
  {
    const s = await del('players', attacker);
    attack('delete the ENTIRE players collection in one request', s);
    if (allowed(s)) await seed();
    const s2 = await patch('players/p_victim', attacker, { accountId: ATTACKER_UID });
    attack("re-point another player's record at yourself (steals their stats)", s2);
    if (allowed(s2)) await seed();
    mustWork('any signed-in user reads a player record (squads and stats need this)', await read('players/p_victim', attacker));
  }

  console.log('\ntournaments — RTDB rules cascade DOWN, so per-field createdBy rules never run');
  {
    const s = await patch('tournaments/t_victim', attacker, { name: 'HACKED' });
    attack("rename another organiser's tournament", s);
    if (allowed(s)) await seed();
    const s2 = await del('tournaments/t_victim', attacker);
    attack("delete another organiser's tournament", s2);
    if (allowed(s2)) await seed();
    mustWork('organiser edits their own tournament', await patch('tournaments/t_victim', victim, { name: 'Victim Cup 2' }));
    mustWork('any signed-in user reads a tournament (viewers need this)', await read('tournaments/t_victim', attacker));
    attack('read all tournaments with no auth', await read('tournaments', null));
  }

  console.log('\nusers — the one rule that was already correct');
  {
    attack("read another user's profile", await read(`users/${VICTIM_UID}/profile`, attacker));
    mustWork('owner reads their own profile', await read(`users/${VICTIM_UID}/profile`, victim));
  }

  console.log('\notpLimits — SMS abuse guard');
  {
    const s = await del(`otpLimits/${VICTIM}`, null);
    attack('wipe the OTP rate-limit record (unlimited SMS at your cost)', s);
    if (allowed(s)) await seed();
  }

  console.log('\napp flows the hardened rules would break — fix these in code FIRST');
  {
    knownBreakage("App.tsx startup gate reads pinAuth while signed OUT",
      await read(`pinAuth/${VICTIM}/activeSessionId`, null),
      'check auth().currentUser first, then read under the signed-in uid');
    knownBreakage('checkPhoneExists / loginWithPin read pinAuth pre-auth',
      await read(`pinAuth/${VICTIM}`, null),
      'move onto the checkPhoneExistsSafe callable and a server-side PIN check');
  }

  // ── Summary ────────────────────────────────────────────────
  console.log(`\n${'='.repeat(64)}`);
  console.log(`${pass} checks behaved as intended.`);
  if (holes.length) {
    console.log(`\n${holes.length} SECURITY HOLE(S) — these attacks SUCCEEDED against the ${MODE} rules:`);
    holes.forEach((h) => console.log('  !! ' + h));
  } else {
    console.log('\nNo security holes: every attack was denied.');
  }
  if (brokenFlows.length) {
    console.log(`\n${brokenFlows.length} APP FLOW(S) BLOCKED by the ${MODE} rules:`);
    brokenFlows.forEach((b) => console.log('  -> ' + b));
  }
  console.log('='.repeat(64));

  if (MODE === 'current') {
    // Documenting reality, not gating on it — the holes are the finding.
    console.log(holes.length
      ? '\nThese are LIVE in production right now. Run `npm run test:rules:hardened`\nto see them closed, and which app flows must change first.'
      : '\nThe deployed rules block every attack tested.');
    process.exit(0);
  }
  // Hardened mode gates: no holes allowed, and any broken flow must be fixed
  // in the client before these rules can be published.
  if (holes.length || broken) { console.log('\nHardened rules are NOT ready.'); process.exit(1); }
  if (brokenFlows.length) { console.log('\nAttacks all blocked, but the flows above must be fixed in code before publishing.'); process.exit(1); }
  console.log('\nSafe to publish.');
};

run().catch((e) => { console.error('\nSuite error:', e.message); process.exit(1); });
