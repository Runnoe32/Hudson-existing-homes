/**
 * Merge the land-enrichment fields from the Hudson Land pipeline output into each
 * lead's `landData` (JSON), writing to Redis (when creds set) and the local file.
 * Run after the 4 enrich_*.mjs scripts have produced homes_enriched.geojson:
 *   pnpm exec tsx scripts/apply_enrichment.ts
 */
import fs from "node:fs";
import { loadEnvLocal } from "./loadenv";
import { getAllMap, putMany } from "../src/db/store";

loadEnvLocal();

const ENR_FILE =
  process.env.HOMES_ENRICHED_PATH ?? "C:/Users/ajrun/hudsonland/data/homes_enriched.geojson";

const ENRICH_KEYS = [
  "water_src", "no3_avg", "no3_max", "no3_exc", "as_avg", "as_max", "bact_pos",
  "tce_zone", "tce_name", "in_wetland", "wet_dist_m", "water_dist_m", "on_water",
  "slope_pct", "elev_m", "septic_class", "soil_drain", "soil_wtdep_cm", "soil_bedrock_cm",
] as const;

const g = JSON.parse(fs.readFileSync(ENR_FILE, "utf8")) as {
  features: { properties: Record<string, unknown> }[];
};
const byId = new Map<string, Record<string, unknown>>();
for (const f of g.features) {
  const p = f.properties;
  const id = String(p.PARCELID ?? "").trim();
  if (!id) continue;
  const sub: Record<string, unknown> = {};
  for (const k of ENRICH_KEYS) if (p[k] != null) sub[k] = p[k];
  if (Object.keys(sub).length) byId.set(id, sub);
}
console.log(`loaded enrichment for ${byId.size} parcels`);

(async () => {
  const map = await getAllMap();
  const leads = Object.values(map);
  let updated = 0;
  for (const l of leads) {
    const sub = byId.get(l.parcelId);
    if (sub) {
      l.landData = JSON.stringify(sub);
      updated++;
    }
  }
  await putMany(leads);
  fs.writeFileSync("./data/leads.json", JSON.stringify(map, null, 2));
  console.log(`✔ set landData on ${updated} of ${leads.length} leads → Redis + data/leads.json`);
})().catch((e) => {
  console.error("✗ apply failed:", e.message);
  process.exit(1);
});
