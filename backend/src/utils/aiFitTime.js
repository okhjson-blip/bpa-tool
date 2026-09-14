export function remainingMinutesAfterAutomation(asIsMinutes, aiPossibility) {
  const asIs = Math.max(0, Math.round(Number(asIsMinutes) || 0));
  const score = Math.max(1, Math.min(5, Math.round(Number(aiPossibility) || 1)));
  if (asIs <= 0 || score < 3) return asIs;
  if (score >= 5) return Math.min(2, Math.round(asIs * 0.1));
  if (score >= 4) return Math.min(3, Math.max(1, Math.round(asIs * 0.2)));
  return Math.max(1, Math.round(asIs * 0.45));
}

export function normalizeAiFitSavings(asIsMinutes, estimatedSavings, aiPossibility) {
  const asIs = Math.max(0, Math.round(Number(asIsMinutes) || 0));
  const llmSavings = Math.max(0, Math.min(asIs, Math.round(Number(estimatedSavings) || 0)));
  const score = Math.max(1, Math.min(5, Math.round(Number(aiPossibility) || 1)));
  if (score < 3) return llmSavings;
  const minSavings = Math.max(0, asIs - remainingMinutesAfterAutomation(asIs, score));
  return Math.max(llmSavings, minSavings);
}

export function toBeExecutionMinutes(asIsMinutes, estimatedSavings) {
  const asIs = Math.max(0, Math.round(Number(asIsMinutes) || 0));
  const savings = Math.max(0, Math.min(asIs, Math.round(Number(estimatedSavings) || 0)));
  return Math.max(0, asIs - savings);
}
