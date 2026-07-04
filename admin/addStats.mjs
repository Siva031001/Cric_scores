import { initializeApp } from "firebase/app";
import { getDatabase, ref, update } from "firebase/database";

const app = initializeApp({
  apiKey: "AIzaSyCj3IUUqhOKKvfMX1OcPI_Pd7uZtXZaqLw",
  databaseURL: "https://crik-runs-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const db = getDatabase(app);

await update(ref(db, "matches/testMatch"), {
  batting: [
    { name: "Rohit", runs: 45, balls: 30 },
    { name: "Virat", runs: 60, balls: 40 }
  ],
  bowling: [
    { name: "Starc", wickets: 2, runs: 30 },
    { name: "Cummins", wickets: 1, runs: 25 }
  ]
});

console.log("? Stats added");
