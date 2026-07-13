/**
 * County sync onto the store. Pull improved parcels from the WI Statewide Parcel
 * layer and upsert them: new parcels get preliminary auto-scores; existing
 * parcels have county fields refreshed while every user-owned field (scores,
 * status, notes/log, probate, beds/sqft) is preserved.
 */
import fs from "node:fs";
import { getAllMap, putMany } from "./store";
import { blankLead, type Lead } from "../lib/types";
import { fetchHomes, HOMES_WHERE, type ParcelRecord } from "../lib/parcels";
import { autoFit, autoMotivation } from "../lib/autoscore";
import { computeTotal } from "../lib/scoring";

const LAND_ENRICHED_PATH =
  process.env.LAND_ENRICHED_PATH ??
  "C:\\Users\\ajrun\\hudsonland\\data\\hudson_improved_enriched.geojson";

const ENRICH_KEYS = [
  "water_src", "no3_avg", "no3_max", "no3_exc", "as_avg", "as_max", "bact_pos",
  "tce_zone", "tce_name", "in_wetland", "wet_dist_m", "water_dist_m", "on_water",
  "slope_pct", "elev_m", "septic_class", "soil_drain", "soil_wtdep_cm", "soil_bedrock_cm",
] as const;

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
    /* best-effort */
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

/** Assign the county-owned fields (safe to refresh every sync) onto a lead. */
function applyCounty(lead: Lead, p: ParcelRecord, landData: string | null, now: string) {
  lead.ownerName = p.ownerName;
  lead.mailingAddress = p.mailingAddress;
  lead.address = p.address;
  lead.municipality = p.municipality;
  lead.inHudsonSd = true;
  lead.acreage = p.acreage;
  lead.landValue = p.landValue;
  lead.impValue = p.impValue;
  lead.assessedValue = p.assessedValue;
  lead.estMarket = p.estMarket;
  lead.propClass = p.propClass;
  lead.parcelType = p.parcelType;
  lead.absentee = p.absentee;
  lead.lat = p.lat;
  lead.lon = p.lon;
  if (landData) lead.landData = landData;
  lead.syncedAt = now;
  lead.updatedAt = now;
}

export async function upsertParcels(
  parcels: ParcelRecord[],
  where: string = HOMES_WHERE,
): Promise<SyncResult> {
  const enrichment = loadEnrichment();
  const now = new Date().toISOString();
  const existing = await getAllMap();

  const result: SyncResult = {
    fetched: parcels.length,
    inserted: 0,
    updated: 0,
    enrichedAttached: 0,
    where,
    finishedAt: now,
  };

  const toWrite: Lead[] = [];
  for (const p of parcels) {
    const enr = enrichment.get(p.parcelId);
    const landData = enr ? JSON.stringify(enr) : null;
    if (landData) result.enrichedAttached++;

    const prior = existing[p.parcelId];
    if (prior) {
      applyCounty(prior, p, landData, now);
      toWrite.push(prior);
      result.updated++;
    } else {
      const lead = blankLead(p.parcelId, now);
      applyCounty(lead, p, landData, now);
      lead.fitScore = autoFit(p);
      lead.motivationScore = autoMotivation(p);
      lead.total = computeTotal(lead.fitScore, lead.motivationScore);
      lead.source = p.absentee ? "absentee" : null;
      lead.log = [{ body: "Synced from county parcel data (new).", kind: "system", createdAt: now }];
      toWrite.push(lead);
      result.inserted++;
    }
  }
  await putMany(toWrite);
  return result;
}

export async function syncHomes(where: string = HOMES_WHERE): Promise<SyncResult> {
  const parcels = await fetchHomes(where);
  return upsertParcels(parcels, where);
}
