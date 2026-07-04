export const calculatePoints = (matches: any[]) => {
  const table: any = {};

  matches.forEach((m: any) => {
    if (!table[m.team1]) table[m.team1] = 0;
    if (!table[m.team2]) table[m.team2] = 0;

    if (m.status === "Completed") {
      table[m.winner] += 2;
    }
  });

  return Object.entries(table)
    .map(([team, pts]) => ({ team, pts }))
    .sort((a: any, b: any) => b.pts - a.pts);
};
