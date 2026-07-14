// Build a GeoJSON workfile of all leads (parcelId + coords) for the Hudson Land
// enrichment scripts. Writes into the LAND repo's data/ dir so those scripts'
// relative paths (tce_swcda.geojson etc.) resolve when run from there.
//
// Run: node scripts/export_for_enrich.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LEADS = "./data/leads.json";
const OUT = "C:/Users/ajrun/hudsonland/data/homes_for_enrich.geojson";

const all = JSON.parse(readFileSync(LEADS, "utf8"));
const features = [];
for (const l of Object.values(all)) {
  if (l.lat == null || l.lon == null) continue;
  features.push({
    type: "Feature",
    geometry: { type: "Point", coordinates: [l.lon, l.lat] },
    properties: { PARCELID: l.parcelId, LONGITUDE: l.lon, LATITUDE: l.lat },
  });
}
writeFileSync(OUT, JSON.stringify({ type: "FeatureCollection", features }));
console.log(`✔ wrote ${features.length} features → ${OUT}`);
