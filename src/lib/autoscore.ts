import { clampScore } from "./scoring";

/**
 * Preliminary FIT score (§4) computed from the county fields we can auto-pull.
 * We have acreage + assessed value; we do NOT have beds/finished-sqft/year-built
 * (those live in scrape-restricted assessor detail), so those rubric points are
 * left for the user to add after verifying a finalist. This is a *starting*
 * score — it's only set on first insert; manual edits are never overwritten.
 *
 * §4 fit points we can compute:
 *   acreage: 1–3 ac (+3) · 0.75–1 or 3–5 (+2) · else (+0)
 *   assessed value implies ~$400–525k market (+2)  [we widen slightly to the pull band]
 *   in Hudson SD: hard gate — always true here (we filter on SCHOOLDIST)
 */
export function autoFit(input: {
  acreage?: number | null;
  assessedValue?: number | null;
}): number {
  let fit = 0;

  const ac = input.acreage ?? 0;
  if (ac >= 1 && ac <= 3) fit += 3;
  else if ((ac >= 0.75 && ac < 1) || (ac > 3 && ac <= 5)) fit += 2;
  // >5 ac (acreage/split plays) gets no acreage-fit point for a *home*, but still
  // scores on value; it's surfaced via parcelType instead.

  const v = input.assessedValue ?? 0;
  if (v >= 400_000 && v <= 525_000) fit += 2;
  else if (v >= 360_000 && v <= 560_000) fit += 1; // near-band

  return clampScore(fit);
}

export interface MotivationSignals {
  absentee?: boolean | null;
  lotteryCredit?: boolean | null;
  tenureYears?: number | null;
  source?: string | null;
}

/**
 * Preliminary MOTIVATION score (§4) from auto-pullable signals only. Probate /
 * obit / expired-listing / TOD require manual research, so this covers just the
 * three we can derive from the parcel roll. Set on insert; user owns it after.
 *   mailing ≠ situs (absentee) +2 · no lottery credit +1 · 25+ yr tenure +2
 */
export function autoMotivation(s: MotivationSignals): number {
  let m = 0;
  if (s.absentee) m += 2;
  if (s.lotteryCredit === false) m += 1;
  if ((s.tenureYears ?? 0) >= 25) m += 2;
  return clampScore(m);
}
