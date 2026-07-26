// Detects newly-crossed milestones after each ball, comparing before/after
// stats — called from ScoringScreen right after a run is scored.
export const detectMilestone = (prevRuns: number, newRuns: number): string | null => {
  if (prevRuns < 50 && newRuns >= 50 && newRuns < 100) return '50! Half-century!';
  if (prevRuns < 100 && newRuns >= 100) return '💯 Century!';
  if (prevRuns < 150 && newRuns >= 150) return '150! Magnificent innings!';
  if (prevRuns < 200 && newRuns >= 200) return '200! Double century!';
  return null;
};

export const detectBowlingMilestone = (prevWickets: number, newWickets: number): string | null => {
  if (prevWickets < 5 && newWickets >= 5) return '5-wicket haul!';
  return null;
};