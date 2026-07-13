// Phase 1: scores are entered manually. Total is always derived (fit + motivation).
// Phase 2 will auto-compute fit/motivation from the §4 rubric; this stays the sink.

export function clampScore(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  if (v < 0) return 0;
  if (v > 10) return 10; // §4: each of fit/motivation is 0–10
  return v;
}

export function computeTotal(fit: unknown, motivation: unknown): number {
  return clampScore(fit) + clampScore(motivation);
}

/** §4 thresholds → a coarse tier used for badges/hints. */
export function scoreTier(total: number): "letter" | "watchlist" | "low" {
  if (total >= 12) return "letter"; // "Anything ≥12 gets a letter"
  if (total >= 9) return "watchlist"; // "9–11 goes to watchlist"
  return "low";
}
