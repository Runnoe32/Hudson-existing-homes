// Summarize the land-enrichment JSON (attached from the Hudson Land tool) into a
// coarse risk read + flag chips. Mirrors the land tool's scoring thresholds.

export interface LandData {
  water_src?: string;
  no3_avg?: number; no3_max?: number; no3_exc?: number;
  as_avg?: number; as_max?: number;
  bact_pos?: number;
  tce_zone?: number | string | null; tce_name?: string;
  in_wetland?: number | boolean; wet_dist_m?: number;
  water_dist_m?: number; on_water?: number | boolean;
  slope_pct?: number; elev_m?: number;
  septic_class?: string; soil_drain?: string;
  soil_wtdep_cm?: number; soil_bedrock_cm?: number;
}

export interface LandSummary {
  risk: "high" | "moderate" | "low";
  flags: { text: string; cls: "warn" | "bad" | "good" | "" }[];
}

export function parseLandData(json: string | null | undefined): LandData | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as LandData;
  } catch {
    return null;
  }
}

export function summarizeLand(d: LandData | null): LandSummary | null {
  if (!d) return null;
  const flags: LandSummary["flags"] = [];
  let score = 0; // higher = worse

  // TCE / VOC plume — the big one
  if (d.tce_zone) {
    flags.push({ text: "TCE zone", cls: "bad" });
    score += 3;
  }
  // Arsenic (regionally elevated near Hudson)
  if ((d.as_max ?? 0) >= 10 || (d.as_avg ?? 0) >= 5) {
    flags.push({ text: `arsenic hi (${d.as_max ?? d.as_avg})`, cls: "bad" });
    score += 2;
  } else if ((d.as_avg ?? 0) > 0) {
    flags.push({ text: "arsenic mod", cls: "warn" });
    score += 1;
  }
  // Nitrate
  if ((d.no3_exc ?? 0) >= 15 || (d.no3_avg ?? 0) >= 7) {
    flags.push({ text: "nitrate", cls: "warn" });
    score += 1;
  }
  // Bacteria
  if ((d.bact_pos ?? 0) >= 30) {
    flags.push({ text: "bacteria", cls: "warn" });
    score += 1;
  }
  // Septic suitability
  if (d.septic_class === "Very limited") {
    flags.push({ text: "septic: very limited", cls: "bad" });
    score += 2;
  } else if (d.septic_class === "Not limited") {
    flags.push({ text: "septic ok", cls: "good" });
  }
  // Slope
  if ((d.slope_pct ?? 0) >= 20) {
    flags.push({ text: `steep ${Math.round(d.slope_pct!)}%`, cls: "warn" });
    score += 1;
  }
  // Wetland
  if (d.in_wetland) {
    flags.push({ text: "in wetland", cls: "bad" });
    score += 2;
  }
  // Water frontage (a plus)
  if (d.on_water || (d.water_dist_m ?? 9999) <= 150) {
    flags.push({ text: "near water", cls: "good" });
  }

  const risk = score >= 3 ? "high" : score >= 1 ? "moderate" : "low";
  return { risk, flags };
}
