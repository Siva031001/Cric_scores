const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔥 IMPORTANT: add your Firebase service key file here
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

app.post("/send", async (req, res) => {
  const { token, title, body } = req.body;

  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
    });

    res.send("Notification sent");
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.listen(3000, () => console.log("FCM Server running on port 3000"));
