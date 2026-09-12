const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();

// This server has no other access control (no user auth, nothing checks
// who's calling), so an API key is the only thing standing between "any
// caller can push an arbitrary notification to any device token" and a
// gate. Required — the server refuses to start without one, rather than
// silently running open the way it used to.
const API_KEY = process.env.FCM_SERVER_API_KEY;
if (!API_KEY) {
  console.error(
    "FCM_SERVER_API_KEY is not set. Refusing to start — this server would " +
    "otherwise accept unauthenticated push-notification requests from " +
    "anyone who can reach it. Set FCM_SERVER_API_KEY and restart."
  );
  process.exit(1);
}

// Locked down to same-origin/no browser callers by default — this is a
// server-to-server notification relay, not something a website's frontend
// JS should ever call directly. Set FCM_SERVER_ALLOWED_ORIGIN if a specific
// browser origin genuinely needs it.
app.use(cors({ origin: process.env.FCM_SERVER_ALLOWED_ORIGIN || false }));
app.use(bodyParser.json());

// 🔥 IMPORTANT: add your Firebase service key file here
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const requireApiKey = (req, res, next) => {
  const provided = req.get("x-api-key");
  if (!provided || provided !== API_KEY) {
    res.status(401).send("Unauthorized");
    return;
  }
  next();
};

// Simple in-memory rate limit — this process only ever runs one instance
// (no horizontal scaling here), so a per-process counter is enough to stop
// one caller hammering /send in a loop.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
let windowStart = Date.now();
let windowCount = 0;
const rateLimit = (req, res, next) => {
  const now = Date.now();
  if (now - windowStart > RATE_LIMIT_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  if (windowCount > RATE_LIMIT_MAX) {
    res.status(429).send("Too many requests");
    return;
  }
  next();
};

app.post("/send", requireApiKey, rateLimit, async (req, res) => {
  const { token, title, body } = req.body ?? {};

  if (typeof token !== "string" || !token.trim()) {
    res.status(400).send("token is required");
    return;
  }
  if (typeof title !== "string" || typeof body !== "string" || title.length > 200 || body.length > 1000) {
    res.status(400).send("title and body must be strings within length limits");
    return;
  }

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
    });

    res.send("Notification sent");
  } catch (e) {
    // Do not forward e.message to the caller — it can include internal
    // Firebase/FCM detail unrelated to anything the caller needs to know.
    console.error("FCM send failed:", e);
    res.status(500).send("Could not send notification");
  }
});

app.listen(3000, () => console.log("FCM Server running on port 3000"));
