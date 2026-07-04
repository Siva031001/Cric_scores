export const generateCommentary = (event) => {
  if (event === "FOUR") return "?? What a shot! 4 runs!";
  if (event === "SIX") return "?? Massive SIX!";
  if (event === "WICKET") return "? Wicket falls!";
  return "Ball played";
};
