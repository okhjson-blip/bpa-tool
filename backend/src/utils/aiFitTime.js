function asNonNegativeMinutes(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export function remainingMinutesAfterAutomation(asIsMinutes, aiPossibility) {
  const asIs = asNonNegativeMinutes(asIsMinutes);
  const score = Math.max(1, Math.min(5, Math.round(Number(aiPossibility) || 1)));
  if (asIs <= 0 || score < 3) return asIs;
  if (score >= 5) return Math.min(20, Math.round(asIs * 0.1));
  if (score >= 4) return Math.min(60, Math.max(1, Math.round(asIs * 0.2)));
  return Math.max(1, Math.round(asIs * 0.45));
}

export function savingsFromRemaining(asIsMinutes, remainingMinutes) {
  const asIs = asNonNegativeMinutes(asIsMinutes);
  const remaining = Math.max(0, Math.min(asIs, asNonNegativeMinutes(remainingMinutes)));
  return asIs - remaining;
}

export function normalizeAiFitSavings(asIsMinutes, estimatedSavings, aiPossibility) {
  const asIs = asNonNegativeMinutes(asIsMinutes);
  const llmSavings = Math.max(0, Math.min(asIs, asNonNegativeMinutes(estimatedSavings)));
  const score = Math.max(1, Math.min(5, Math.round(Number(aiPossibility) || 1)));
  if (score < 3) return llmSavings;
  const minSavings = Math.max(0, asIs - remainingMinutesAfterAutomation(asIs, score));
  return Math.max(llmSavings, minSavings);
}

export function resolveAiFitSavings(asIsMinutes, estimatedSavings, remainingMinutes, aiPossibility) {
  const asIs = asNonNegativeMinutes(asIsMinutes);
  const score = Math.max(1, Math.min(5, Math.round(Number(aiPossibility) || 1)));
  const fromSavings = Math.max(0, Math.min(asIs, asNonNegativeMinutes(estimatedSavings)));
  if (score < 3) return fromSavings;
  const remainingProvided = remainingMinutes != null && remainingMinutes !== '';
  const fromRemaining = remainingProvided ? savingsFromRemaining(asIs, remainingMinutes) : fromSavings;
  return normalizeAiFitSavings(asIs, Math.max(fromRemaining, fromSavings), score);
}

export function toBeExecutionMinutes(asIsMinutes, estimatedSavings) {
  const asIs = asNonNegativeMinutes(asIsMinutes);
  const savings = Math.max(0, Math.min(asIs, asNonNegativeMinutes(estimatedSavings)));
  return Math.max(0, asIs - savings);
}
