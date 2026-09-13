# Testing the database security rules

The Realtime Database rules were never tested. Two things went wrong as a
result:

1. An audit found real holes — any unauthenticated caller could overwrite a
   PIN hash and take over an account, a single request could delete every
   match, and thirteen per-field ownership rules on tournaments were dead
   code that never ran.
2. Tightening a rule without the matching client change caused a live login
   outage.

Both have the same cause: no way to check a rule change before shipping it.
This suite is that check. It runs against a local emulator with a `demo-`
project id, so it cannot reach real data.

## One-time setup

```bash
npm install -g firebase-tools
```

Installed **globally on purpose.** Adding it to the project would rewrite
`package-lock.json`, and a lockfile regenerated inside this environment picks
up an internal registry mirror — that is what broke the Android build
previously.

## Running it

```bash
npm run test:rules            # what the DEPLOYED rules allow today
npm run test:rules:hardened   # what the PROPOSED rules would do
```

## Reading the output

**`test:rules`** documents current behaviour, holes included. Lines marked
`(expected: currently ALLOWED)` are live security holes. They pass because
they assert what the deployed rules genuinely do — the point is that the holes
are written down and cannot silently reappear or silently change.

**`test:rules:hardened`** loads `database.rules.hardened.json` and asserts two
separate things:

- the attacks are now blocked, and
- the app's own legitimate flows still work.

That second half is the part that matters. Entries labelled `KNOWN BREAKAGE`
are flows that the hardened rules would break. They are assertions, not
warnings — the suite tells you exactly what must change in the client first.

## Adopting the hardened rules

Order matters. Doing step 3 first is what caused the outage.

1. Move `checkPhoneExists` and `loginWithPin`'s `pinAuth` read onto a Cloud
   Function, and move the PIN check back to the server.
   `checkPhoneExistsSafe` already exists but currently returns HTTP 403
   because it has no public invoker binding — fix and verify that first.
2. Change the startup gate in `App.tsx`. It reads
   `pinAuth/{phone}/activeSessionId` while signed **out**, which the hardened
   rules forbid. It should check `auth().currentUser` first.
3. Only then publish `database.rules.hardened.json`.

Re-run `npm run test:rules:hardened` after each step. When no `KNOWN BREAKAGE`
entry is left, it is safe to publish.

## What it covers

| Area | Checks |
|---|---|
| `pinAuth` | unauthenticated read, PIN overwrite (takeover), lockout-counter reset, forced logout, deletion — plus that the owner can still read and rotate their own session |
| `matches` | collection-root deletion, tampering with someone else's match, and that a scorer can still read and update their own |
| `players` | collection-root deletion, re-pointing another player's `accountId`, and that squads and stats can still be read |
| `tournaments` | renaming and deleting someone else's tournament (the dead per-field rules), and that an organiser can still edit their own |
| `users` | cross-user profile reads — the one rule that was already correct |
| `otpLimits` | wiping the rate-limit record to obtain unlimited SMS |

## A caveat worth knowing

Rules cascade **downward** in the Realtime Database. A `.write` that evaluates
true at a shallower path grants the entire subtree beneath it, and deeper rules
are not evaluated at all — a child rule can widen access but can never take it
away. This is the opposite of Firestore, and it is why the thirteen per-field
`createdBy` rules under `tournaments/$tournamentId` do nothing: the
`".write": "auth != null"` above them has already granted everything.

The OTP rate limit has a second problem the rules cannot fix: it is enforced in
the client (`checkOtpRateLimit` / `recordOtpSent`), so anyone calling the
Firebase Auth API directly bypasses it regardless. Closing that properly means
moving the cap into a Cloud Function that owns both the check and the send.
