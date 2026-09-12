import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue } from "firebase/database";

const app = initializeApp({
  apiKey: "AIzaSyCj3IUUqhOKKvfMX1OcPI_Pd7uZtXZaqLw",
  databaseURL: "https://crik-runs-default-rtdb.asia-southeast1.firebasedatabase.app",
});

const shareMatch = (m) => {
  const link = `https://cric-scores.vercel.app/?match=${encodeURIComponent(m.team1)}`;
  const inn = m.currentInnings === 2 ? m.innings2 : m.innings1;

  const text = `${m.team1} vs ${m.team2}
Score: ${inn?.runs}/${inn?.wickets}
Status: ${m.status}
Overs: ${inn?.overs || "10.0"}
Run Rate: ${((inn?.runs || 0)/((inn?.overs || 0) + (inn?.balls || 0)/6 || 10)).toFixed(2)}

Open match:
${link}`;

  window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
};

function App() {
  const params = new URLSearchParams(window.location.search);
  const matchFromUrl = params.get("match");

  const [matches, setMatches] = useState([]);
  const [filter, setFilter] = useState("live");
  const [selectedMatch, setSelectedMatch] = useState(null);

  useEffect(() => {
    const db = getDatabase(app);

    onValue(ref(db, "matches"), snap => {
      const data = snap.val() || {};
      console.log("Firebase Data:", data);
      setMatches(Object.values(data));
    });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h2>?? Live Matches</h2>

      {matches.length === 0 ? (
        <p>No matches found</p>
      ) : (
        (matchFromUrl
          ? matches.filter(m => m.team1 === matchFromUrl)
          : matches.filter(m => m.status === filter)
        ).map((m, i) => {
          const inn = m.currentInnings === 2 ? m.innings2 : m.innings1;
          return (
          <div
            key={i}
            onClick={() => setSelectedMatch(m)}
            style={{
              cursor: "pointer",
              background: "#fff",
              borderRadius: 10,
              boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
              padding: 10,
              marginBottom: 10
            }}
          >
            <b>{m.team1} vs {m.team2}</b><br/>
            Score: {inn?.runs}/{inn?.wickets}<br/>
            Status: {m.status}<br/>
            Overs: {inn?.overs || "10.0"}<br/>
            Run Rate: {((inn?.runs || 0)/((inn?.overs || 0) + (inn?.balls || 0)/6 || 10)).toFixed(2)}<br/>

            <button onClick={(e) => { e.stopPropagation(); shareMatch(m); }}>
              ?? Share
            </button>
          </div>
          );
        })
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
