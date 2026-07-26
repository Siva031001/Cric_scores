// Generates a short commentary line from a ball result, without calling
// Gemini per-ball (would be slow + costly at 100+ calls/match) — instead
// uses templated variety keyed by result type, with Gemini reserved for
// milestone/wicket moments only (see generateMilestoneCommentary below).
export const getBallCommentary = (result: string, batterName: string, bowlerName: string): string => {
  const templates: Record<string, string[]> = {
    '0': [`${bowlerName} keeps it tight.`, `Solid defence from ${batterName}.`, `Dot ball.`],
    '1': [`Quick single taken.`, `${batterName} works it for one.`],
    '2': [`Good running between the wickets.`, `Two runs added.`],
    '4': [`FOUR! Excellent shot from ${batterName}!`, `Cracking boundary!`, `${batterName} finds the gap perfectly.`],
    '6': [`SIX! That's out of the park!`, `Huge hit from ${batterName}!`, `Maximum! What a shot!`],
    'W': [`WICKET! ${bowlerName} strikes!`, `Huge breakthrough for the bowling side!`, `Gone! Big wicket.`],
  };
  const key = result === 'W' || result.startsWith('W(') ? 'W' : templates[result] ? result : '0';
  const options = templates[key] ?? templates['0'];
  return options[Math.floor(Math.random() * options.length)];
};

// For genuinely special moments (50s/100s/5-wicket hauls/hat-tricks), use
// Gemini for a richer line — these are rare enough per match that the AI
// cost stays negligible (a handful of calls per match, not per ball).
export const shouldUseAIForMoment = (type: 'fifty'|'century'|'fiveWickets'|'hatTrick'|'wicket'|'boundary') =>
  ['fifty', 'century', 'fiveWickets', 'hatTrick'].includes(type);