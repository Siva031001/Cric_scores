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

const MODE = process.env.MODE === 'hardened' ? 'hardened' : 'current';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-crikruns';
const DB = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const AUTH = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const NS = `${PROJECT}-default-rtdb`;

let pass = 0, fail = 0;
const failures = [];

const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(name + (detail ? ` — ${detail}` : '')); console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`); }
};

// The Auth emulator does not verify custom-token signatures, so an unsigned
// JWT with the uid we want is enough to obtain a real ID token for that uid.
// This is how we test rules that key off a specific auth.uid (the app's uids
// are 'phone_' + the 10-digit number).
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unsignedCustomToken = (uid) => {
  const now = Math.floor(Date.now() / 1000);
  const claims = { uid, iat: now, exp: now + 3600, aud: 'x', iss: 'x', sub: 'x' };
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

const allowed = (status) => status >= 200 && status < 300;
const denied = (status) => status === 401 || status === 403;

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
    const s = await read(`pinAuth/${VICTIM}`, null);
    ok('unauthenticated read of a PIN record is blocked',
      hardened ? denied(s) : allowed(s), `status ${s}${!hardened ? ' (expected: currently ALLOWED — salt+pinHash are public)' : ''}`);

    const s2 = await patch(`pinAuth/${VICTIM}`, null, { pinHash: 'attackerhash', salt: 'attackersalt' });
    ok('unauthenticated PIN overwrite (account takeover) is blocked',
      hardened ? denied(s2) : allowed(s2), `status ${s2}${!hardened ? ' (expected: currently ALLOWED)' : ''}`);

    const s3 = await patch(`pinAuth/${VICTIM}`, null, { pinFailedAttempts: 0, pinLockedUntil: null });
    ok('resetting the brute-force lockout counter is blocked',
      hardened ? denied(s3) : allowed(s3), `status ${s3}${!hardened ? ' (expected: currently ALLOWED — the lockout is bypassable)' : ''}`);

    const s4 = await patch(`pinAuth/${VICTIM}`, attacker, { activeSessionId: 'hijacked' });
    ok('another user cannot force-logout the victim',
      hardened ? denied(s4) : allowed(s4), `status ${s4}`);

    const s5 = await del(`pinAuth/${VICTIM}`, null);
    ok('unauthenticated deletion of an account record is blocked',
      hardened ? denied(s5) : allowed(s5), `status ${s5}`);
    if (allowed(s5)) await seed(); // restore for later assertions
  }

  console.log('\npinAuth — the owner must still be able to work');
  {
    const s = await read(`pinAuth/${VICTIM}`, victim);
    ok('the owner can read their own PIN record', allowed(s), `status ${s}`);
    const s2 = await patch(`pinAuth/${VICTIM}`, victim, { activeSessionId: 'new-session', lastLoginAt: 2 });
    ok('the owner can rotate their own session id (login does this)', allowed(s2), `status ${s2}`);
    if (hardened) {
      const s3 = await patch(`pinAuth/${VICTIM}`, victim, { pinFailedAttempts: 0 });
      ok('even the owner cannot edit their own lockout counter', denied(s3), `status ${s3}`);
    }
  }

  console.log('\nmatches');
  {
    const s = await del('matches', attacker);
    ok('a signed-in user cannot delete the whole matches collection',
      hardened ? denied(s) : allowed(s), `status ${s}${!hardened ? ' (expected: currently ALLOWED — one request wipes every match)' : ''}`);
    if (allowed(s)) await seed();

    const s2 = await patch('matches/m_victim', attacker, { team1: 'TAMPERED' });
    ok("a signed-in user cannot tamper with someone else's live match",
      hardened ? denied(s2) : allowed(s2), `status ${s2}`);

    const s3 = await read('matches/m_victim', victim);
    ok('the scorer can read their own match', allowed(s3), `status ${s3}`);
    const s4 = await patch('matches/m_victim', victim, { team1: 'A2' });
    ok('the scorer can update their own match', allowed(s4), `status ${s4}`);
  }

  console.log('\nplayers');
  {
    const s = await del('players', attacker);
    ok('a signed-in user cannot delete the whole players collection',
      hardened ? denied(s) : allowed(s), `status ${s}`);
    if (allowed(s)) await seed();

    const s2 = await patch('players/p_victim', attacker, { accountId: ATTACKER_UID });
    ok("a signed-in user cannot re-point someone else's player record at themselves",
      hardened ? denied(s2) : allowed(s2), `status ${s2}`);

    const s3 = await read('players/p_victim', attacker);
    ok('any signed-in user can read a player record (needed for squads and stats)', allowed(s3), `status ${s3}`);
  }

  console.log('\ntournaments — the per-field createdBy rules');
  {
    // RTDB rules cascade downward: a `true` .write at $tournamentId grants the
    // whole subtree, and the deeper per-field rules are never evaluated. This
    // is why those thirteen rules are dead code today.
    const s = await patch('tournaments/t_victim', attacker, { name: 'HACKED' });
    ok("a signed-in user cannot rename someone else's tournament",
      hardened ? denied(s) : allowed(s), `status ${s}${!hardened ? ' (expected: currently ALLOWED — the per-field createdBy rules never run)' : ''}`);

    const s2 = await del('tournaments/t_victim', attacker);
    ok("a signed-in user cannot delete someone else's tournament",
      hardened ? denied(s2) : allowed(s2), `status ${s2}`);
    if (allowed(s2)) await seed();

    const s3 = await patch('tournaments/t_victim', victim, { name: 'Victim Cup 2' });
    ok('the organiser can edit their own tournament', allowed(s3), `status ${s3}`);
    const s4 = await read('tournaments/t_victim', attacker);
    ok('any signed-in user can read a tournament (viewers need this)', allowed(s4), `status ${s4}`);
    const s5 = await read('tournaments', null);
    ok('unauthenticated tournament read is blocked', denied(s5), `status ${s5}`);
  }

  console.log('\nusers — the one rule that was already correct');
  {
    const s = await read(`users/${VICTIM_UID}/profile`, attacker);
    ok("another user cannot read someone else's profile", denied(s), `status ${s}`);
    const s2 = await read(`users/${VICTIM_UID}/profile`, victim);
    ok('the owner can read their own profile', allowed(s2), `status ${s2}`);
  }

  console.log('\notpLimits — SMS abuse guard');
  {
    const s = await del(`otpLimits/${VICTIM}`, null);
    ok('the OTP rate-limit record cannot be wiped to get unlimited SMS',
      hardened ? denied(s) : allowed(s), `status ${s}${!hardened ? ' (expected: currently ALLOWED)' : ''}`);
    if (allowed(s)) await seed();
  }

  console.log('\napp flows that MUST keep working (these catch an outage before it ships)');
  {
    // The startup gate in App.tsx reads this while signed OUT.
    const s = await read(`pinAuth/${VICTIM}/activeSessionId`, null);
    if (hardened) {
      ok('KNOWN BREAKAGE: App.tsx startup gate reads pinAuth while signed out', denied(s),
        `status ${s} — must switch to checking auth().currentUser first`);
    } else {
      ok('App.tsx startup gate can read the session id unauthenticated', allowed(s), `status ${s}`);
    }

    // checkPhoneExists / loginWithPin read pinAuth before any sign-in.
    const s2 = await read(`pinAuth/${VICTIM}`, null);
    if (hardened) {
      ok('KNOWN BREAKAGE: checkPhoneExists / loginWithPin read pinAuth pre-auth', denied(s2),
        `status ${s2} — must move onto checkPhoneExistsSafe + a server-side PIN check`);
    } else {
      ok('checkPhoneExists can read pinAuth unauthenticated', allowed(s2), `status ${s2}`);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) {
    console.log('\nFailures:');
    failures.forEach((f) => console.log('  - ' + f));
    process.exit(1);
  }
  console.log(MODE === 'current'
    ? '\nThis documents what the DEPLOYED rules allow today. The ones marked\n"currently ALLOWED" are live security holes — run MODE=hardened to see them closed.'
    : '\nAttacks blocked. Note the KNOWN BREAKAGE entries: those client flows must\nbe changed BEFORE publishing these rules, or login breaks.');
};

run().catch((e) => { console.error('\nSuite error:', e.message); process.exit(1); });
