/**
 * County sync: pull improved parcels from the WI Statewide Parcel layer and
 * upsert them into the leads table. New parcels get preliminary auto-scores;
 * existing parcels have their county fields refreshed but every user-owned field
 * (scores, status, notes, probate, beds/sqft/year — the stuff you research) is
 * preserved. Callable from a script or a server action.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { db } from "./index";
import { leads, notesLog, type NewLead } from "./schema";
import { fetchHomes, HOMES_WHERE, type ParcelRecord } from "../lib/parcels";
import { autoFit, autoMotivation } from "../lib/autoscore";
import { computeTotal } from "../lib/scoring";

/** Where the land tool's enriched improved-parcel file lives (arsenic/septic/slope/TCE…). */
const LAND_ENRICHED_PATH =
  process.env.LAND_ENRICHED_PATH ??
  "C:\\Users\\ajrun\\hudsonland\\data\\hudson_improved_enriched.geojson";

const ENRICH_KEYS = [
  "water_src", "no3_avg", "no3_max", "no3_exc", "as_avg", "as_max", "bact_pos",
  "tce_zone", "tce_name", "in_wetland", "wet_dist_m", "water_dist_m", "on_water",
  "slope_pct", "elev_m", "septic_class", "soil_drain", "soil_wtdep_cm", "soil_bedrock_cm",
] as const;

/** parcelId → compact enrichment subset (JSON-serializable), if the file exists. */
function loadEnrichment(): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  try {
    if (!fs.existsSync(LAND_ENRICHED_PATH)) return map;
    const g = JSON.parse(fs.readFileSync(LAND_ENRICHED_PATH, "utf8")) as {
      features: { properties: Record<string, unknown> }[];
    };
    for (const f of g.features) {
      const p = f.properties;
      const id = String(p.PARCELID ?? "").trim();
      if (!id) continue;
      const sub: Record<string, unknown> = {};
      for (const k of ENRICH_KEYS) if (p[k] != null) sub[k] = p[k];
      if (Object.keys(sub).length) map.set(id, sub);
    }
  } catch {
    // enrichment is best-effort — never block a sync on it
  }
  return map;
}

export interface SyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  enrichedAttached: number;
  where: string;
  finishedAt: string;
}

/** County fields that a re-sync is allowed to refresh (everything else is user-owned). */
function countyPatch(p: ParcelRecord, landData: string | null, now: Date) {
  return {
    ownerName: p.ownerName,
    mailingAddress: p.mailingAddress,
    address: p.address,
    municipality: p.municipality,
    inHudsonSd: true,
    acreage: p.acreage,
    landValue: p.landValue,
    impValue: p.impValue,
    assessedValue: p.assessedValue,
    estMarket: p.estMarket,
    propClass: p.propClass,
    parcelType: p.parcelType,
    absentee: p.absentee,
    lat: p.lat,
    lon: p.lon,
    ...(landData ? { landData } : {}),
    syncedAt: now,
    updatedAt: now,
  };
}

/**
 * Upsert already-fetched parcels into the leads table. Pure DB (no network) so
 * it's unit-testable. New parcels get auto-scores + a log entry; existing
 * parcels have only their county fields refreshed (user research is preserved).
 */
export function upsertParcels(
  parcels: ParcelRecord[],
  where: string = HOMES_WHERE,
): SyncResult {
  const enrichment = loadEnrichment();
  const now = new Date();

  const existing = new Map(
    db.select({ id: leads.id, parcelId: leads.parcelId }).from(leads).all().map((r) => [r.parcelId, r.id]),
  );

  const result: SyncResult = {
    fetched: parcels.length,
    inserted: 0,
    updated: 0,
    enrichedAttached: 0,
    where,
    finishedAt: now.toISOString(),
  };

  db.transaction((tx) => {
    for (const p of parcels) {
      const enr = enrichment.get(p.parcelId);
      const landData = enr ? JSON.stringify(enr) : null;
      if (landData) result.enrichedAttached++;

      const existingId = existing.get(p.parcelId);
      if (existingId == null) {
        const fit = autoFit(p);
        const mot = autoMotivation(p);
        const values: NewLead = {
          parcelId: p.parcelId,
          ...countyPatch(p, landData, now),
          fitScore: fit,
          motivationScore: mot,
          total: computeTotal(fit, mot),
          status: "watchlist",
          source: p.absentee ? "absentee" : null,
        };
        const row = tx.insert(leads).values(values).returning({ id: leads.id }).get();
        tx.insert(notesLog)
          .values({ leadId: row.id, body: "Synced from county parcel data (new).", kind: "system" })
          .run();
        result.inserted++;
      } else {
        // Refresh county fields only; preserve all user-owned research + scores.
        tx.update(leads).set(countyPatch(p, landData, now)).where(eq(leads.id, existingId)).run();
        result.updated++;
      }
    }
  });

  return result;
}

export async function syncHomes(where: string = HOMES_WHERE): Promise<SyncResult> {
  const parcels = await fetchHomes(where);
  return upsertParcels(parcels, where);
}
