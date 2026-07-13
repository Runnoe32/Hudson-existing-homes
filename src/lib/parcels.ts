/**
 * Live pull from the Wisconsin Statewide Parcel Map (DOA/WLIP) — the same
 * ArcGIS feature layer the Hudson Land tool uses, pointed at parcels WITH a
 * building (IMPVALUE > 0) instead of vacant land. Standard schema, built-in
 * SCHOOLDIST field, no scraping. Framework-free (uses global fetch).
 */

const BASE =
  "https://services3.arcgis.com/n6uYoouQZW75n5WI/arcgis/rest/services/Wisconsin_Statewide_Parcels/FeatureServer/0";

const FIELDS = [
  "PARCELID",
  "OWNERNME1",
  "OWNERNME2",
  "PSTLADRESS",
  "SITEADRESS",
  "PLACENAME",
  "ZIPCODE",
  "GISACRES",
  "DEEDACRES",
  "PROPCLASS",
  "AUXCLASS",
  "LNDVALUE",
  "IMPVALUE",
  "ESTFMKVALUE",
  "CNTASSDVALUE",
  "LATITUDE",
  "LONGITUDE",
  "SCHOOLDIST",
];

export const HUDSON_SD = "HUDSON SCHOOL DISTRICT";

/**
 * Scope chosen with the user: residential homes in the fit band (0.75–5 ac,
 * assessed $380–560k) PLUS every improved parcel ≥10 ac (the split-parcel /
 * buy-the-farm plays — matches the 243 we already enriched in the land tool).
 */
export const HOMES_WHERE =
  `SCHOOLDIST='${HUDSON_SD}' AND IMPVALUE>0 AND (` +
  `(PROPCLASS LIKE '%1%' AND GISACRES>=0.75 AND GISACRES<=5 AND CNTASSDVALUE>=380000 AND CNTASSDVALUE<=560000)` +
  ` OR GISACRES>=10)`;

export interface ParcelRecord {
  parcelId: string;
  ownerName: string | null;
  mailingAddress: string | null;
  address: string | null;
  municipality: string | null;
  acreage: number | null;
  landValue: number | null;
  impValue: number | null;
  assessedValue: number | null;
  estMarket: number | null;
  propClass: string | null;
  lat: number | null;
  lon: number | null;
  absentee: boolean;
  parcelType: "home-fit" | "acreage-split";
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

/**
 * Absentee heuristic. The roll stores the situs as street-only (SITEADRESS,
 * e.g. "1050 SCOTT ROAD") and the mailing as a full line (PSTLADRESS, e.g.
 * "1050 SCOTT RD HUDSON WI 54016"), so a naive string compare is useless.
 * Compare leading street numbers, and require the situs ZIP to appear in the
 * mailing line. Different number, or missing situs ZIP in the mailing → absentee.
 */
export function computeAbsentee(
  situs: string | null,
  mailing: string | null,
  situsZip: string | null,
): boolean {
  if (!situs || !mailing) return false; // unknown → don't flag
  const sNum = situs.trim().match(/^\d+/)?.[0];
  const mNum = mailing.trim().match(/^\d+/)?.[0];
  if (sNum && mNum && sNum !== mNum) return true;
  const zip = situsZip?.trim().slice(0, 5);
  if (zip && /^\d{5}$/.test(zip) && !mailing.includes(zip)) return true;
  return false;
}

function mapFeature(a: Record<string, unknown>): ParcelRecord {
  const owner1 = clean(a.OWNERNME1);
  const owner2 = clean(a.OWNERNME2);
  const ownerName = [owner1, owner2].filter(Boolean).join(" / ") || null;
  const acreage = num(a.GISACRES);
  const assessed = num(a.CNTASSDVALUE) ?? add(num(a.LNDVALUE), num(a.IMPVALUE));
  const situs = clean(a.SITEADRESS);
  const mailing = clean(a.PSTLADRESS);
  return {
    parcelId: String(a.PARCELID ?? "").trim(),
    ownerName,
    mailingAddress: mailing,
    address: situs,
    municipality: clean(a.PLACENAME),
    acreage: acreage != null ? Math.round(acreage * 100) / 100 : null,
    landValue: num(a.LNDVALUE),
    impValue: num(a.IMPVALUE),
    assessedValue: assessed,
    estMarket: num(a.ESTFMKVALUE),
    propClass: clean(a.PROPCLASS),
    lat: num(a.LATITUDE),
    lon: num(a.LONGITUDE),
    absentee: computeAbsentee(situs, mailing, clean(a.ZIPCODE)),
    parcelType: (acreage ?? 0) >= 10 ? "acreage-split" : "home-fit",
  };
}

function add(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Fetch all matching parcels, paginating through the layer's transfer limit.
 * `where` defaults to HOMES_WHERE. Returns mapped ParcelRecords.
 */
export async function fetchHomes(where: string = HOMES_WHERE): Promise<ParcelRecord[]> {
  const pageSize = 1000;
  let offset = 0;
  const out: ParcelRecord[] = [];

  for (;;) {
    const params = new URLSearchParams({
      where,
      outFields: FIELDS.join(","),
      orderByFields: "PARCELID",
      returnGeometry: "false",
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });
    const res = await fetch(`${BASE}/query?${params.toString()}`);
    if (!res.ok) throw new Error(`ArcGIS query failed: ${res.status} ${res.statusText}`);
    const json = (await res.json()) as {
      features?: { attributes: Record<string, unknown> }[];
      exceededTransferLimit?: boolean;
      error?: { message?: string };
    };
    if (json.error) throw new Error(`ArcGIS error: ${json.error.message ?? "unknown"}`);
    const feats = json.features ?? [];
    for (const f of feats) {
      const rec = mapFeature(f.attributes);
      if (rec.parcelId) out.push(rec);
    }
    if (feats.length < pageSize && !json.exceededTransferLimit) break;
    if (feats.length === 0) break;
    offset += feats.length;
    if (offset > 50_000) break; // safety valve
  }
  return out;
}
