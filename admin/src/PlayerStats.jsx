import React from "react";

export default function PlayerStats({ player }) {
  return (
    <div style={{padding:20}}>
      <h2>?? {player.name}</h2>
      <p>Runs: {player.runs}</p>
      <p>Balls: {player.balls}</p>
      <p>Strike Rate: {(player.runs/player.balls*100).toFixed(2)}</p>
    </div>
  );
}
