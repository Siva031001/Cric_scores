export const generateCommentary = (event) => {
  if (event.type === "run") {
    if (event.runs === 4) return "?? FOUR! Beautiful shot!";
    if (event.runs === 6) return "?? SIX! Massive hit!";
    return `?? ${event.runs} run(s) taken`;
  }
  if (event.type === "wicket") {
    return "? WICKET! Big breakthrough!";
  }
  return "Ball played";
};
export const generateCommentary = (event) => {
  if (event.type === "run") {
    if (event.runs === 4) return "?? FOUR! Beautiful shot!";
    if (event.runs === 6) return "?? SIX! Massive hit!";
    return `?? ${event.runs} run(s) taken`;
  }
  if (event.type === "wicket") {
    return "? WICKET! Big breakthrough!";
  }
  return "Ball played";
};
