// Owner-category classification + deprioritization. Some owners are poor
// acquisition targets no matter how their parcel scores: an active rental
// portfolio (a landlord running many units as a business), or an institutional
// owner (government, church, HOA common area, a healthcare facility). These
// should sink in the default sort and carry a visible flag, instead of crowding
// out genuine owner-occupant leads — the homes analog of the land tool's
// hoa-common / institutional deprioritization.
//
// Classification is computed at READ time (queries.ts) and attached to the Lead
// objects handed to the UI; it is never written back to the store.
import { isEntity, ownerKey } from "./owner";
import type { Lead } from "./types";

export type OwnerCategory = "institutional" | "rental-portfolio" | "developer" | null;

// Government / church / HOA / utility / healthcare / financial institutions.
const INSTITUTIONAL_RE =
  /\b(CITY OF|COUNTY|STATE OF|USA|UNITED STATES|SCHOOL|DISTRICT|CHURCH|PARISH|LUTHERAN|CATHOLIC|BAPTIST|METHODIST|PRESBYTERIAN|ADVENTIST|SEVENTH.?DAY|EVANGELIC|MISSIONARY|MINISTR|DIOCESE|CONGREGATION|SYNOD|\bSOCIETY\b|DEPARTMENT OF|COMMISSION|AUTHORITY|UTILIT|SANITARY|WATERWORKS|ELECTRIC|COOPERATIVE|VILLAGE OF|TOWNSHIP|HOSPITAL|HEALTHCARE|MEDICAL CENTER|TREATMENT|CLINIC|UNIVERSITY|COLLEGE|ACADEMY|FOUNDATION|HABITAT|CEMETERY|CONSERVANCY|\bDNR\b|CREDIT UNION|\bBANK\b|MORTGAGE|FEDERAL|HOMEOWNERS|HOME OWNERS|CONDOMINIUM|\bCONDO\b|\bHOA\b|\bPOA\b|OWNERS ASSOC|PROPERTY OWNERS)\b/i;

const DEVELOPER_RE = /\b(DEVELOP(MENT|ERS|MENTS)?|BUILDERS?|CONSTRUCTION|HOMES\s+LLC)\b/i;
const RENTAL_RE = /\b(RENTALS?)\b/i;

// Twin-home / townhome / condo signals. The free parcel layer has NO building-type
// field, so single-family-vs-twin can't be read directly — these are the only
// heuristics available: an explicit unit designator in the situs, a twin/townhome
// owner name, or one owner holding multiple homes on the same street (the
// signature of a twin-home development like the Stout "Willow River Twin Homes").
// An individually-owned twin/townhome with none of these looks identical to a SFH
// here and can only be confirmed per-finalist (assessor record / a Redfin/Zillow
// "property type"). NOTE: requiring ≥~0.75 ac already excludes typical condo/
// townhome units (which own a unit, not acreage), so this mainly catches rural
// twin-home developments.
const UNIT_ADDR_RE = /\b(UNIT|APT|BLDG|#)\b/i;
const MULTIUNIT_NAME_RE =
  /\b(TWIN\s?HOMES?|TOWN\s?HOMES?|TWINHOMES?|TOWNHOMES?|TWNHM|\bCONDO|CONDOMINIUM|VILLAS?|DUPLEX)\b/i;

/** Normalize a situs to just its street (drop house number, unit, directionals). */
function streetKey(addr?: string | null): string {
  return (addr ?? "")
    .replace(/^\s*\d+\s*/, "")
    .replace(/\bUNIT\b.*$/i, "")
    .replace(/[^A-Z0-9 ]/gi, " ")
    .replace(/\b[NSEW]\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Parcel IDs that look like a unit in a twin-home/townhome development rather than
 * a detached single-family home (best-effort — see UNIT_ADDR_RE note above).
 */
export function multiUnitParcels(leads: Lead[]): Set<string> {
  // Cluster: same owner holding ≥2 homes on the same street.
  const byOwnerStreet = new Map<string, string[]>();
  for (const l of leads) {
    const k = ownerKey(l.ownerName);
    if (!k) continue;
    const key = `${k}||${streetKey(l.address)}`;
    (byOwnerStreet.get(key) ?? byOwnerStreet.set(key, []).get(key)!).push(l.parcelId);
  }
  const clustered = new Set<string>();
  for (const ids of byOwnerStreet.values())
    if (ids.length >= 2) for (const id of ids) clustered.add(id);

  const out = new Set<string>();
  for (const l of leads) {
    if (
      UNIT_ADDR_RE.test(l.address ?? "") ||
      MULTIUNIT_NAME_RE.test(l.ownerName ?? "") ||
      clustered.has(l.parcelId)
    )
      out.add(l.parcelId);
  }
  return out;
}

interface ResearchBlob {
  owner_context?: string | null;
  likely_motivation?: string | null;
}

function readResearch(lead: Lead): ResearchBlob | null {
  if (!lead.research) return null;
  try {
    return JSON.parse(lead.research) as ResearchBlob;
  } catch {
    return null;
  }
}

/** Count parcels held per normalized owner key across the full lead set. */
export function portfolioSizes(leads: Lead[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const l of leads) {
    const k = ownerKey(l.ownerName);
    if (!k) continue;
    sizes.set(k, (sizes.get(k) ?? 0) + 1);
  }
  return sizes;
}

/**
 * Classify an owner. `portfolioSize` = how many parcels this owner holds in the
 * store (drives the "serial landlord" heuristic). Research findings, when
 * present, take precedence over name/portfolio heuristics.
 */
export function classifyOwner(lead: Lead, portfolioSize = 1): OwnerCategory {
  const name = lead.ownerName ?? "";
  const r = readResearch(lead);
  const ctx = (r?.owner_context ?? "").toLowerCase();
  const mot = r?.likely_motivation ?? "";

  // Institutional / not-a-home wins (e.g. Burkwood Treatment Center).
  if (INSTITUTIONAL_RE.test(name) || ctx.includes("institutional") || ctx.includes("not a home"))
    return "institutional";

  // Developer holding inventory is a PLAUSIBLE seller — categorized, not sunk.
  if (mot === "developer-inventory" || DEVELOPER_RE.test(name)) return "developer";

  // Active rental / investor portfolio: a researched landlord/investor verdict,
  // an explicit "…RENTALS" name, or an entity holding several parcels.
  if (mot === "landlord" || mot === "investor") return "rental-portfolio";
  if (RENTAL_RE.test(name)) return "rental-portfolio";
  if (isEntity(name) && portfolioSize >= 3) return "rental-portfolio";

  return null;
}

/** Categories that should sink in the default sort and be skipped for research. */
export function isDeprioritized(category: OwnerCategory): boolean {
  return category === "institutional" || category === "rental-portfolio";
}

/**
 * Annotate leads in place with `category` + `deprioritized` (computed, not
 * persisted) and return them. Call once per read before sorting/rendering.
 */
export function annotatePriority(leads: Lead[]): Lead[] {
  const sizes = portfolioSizes(leads);
  const multi = multiUnitParcels(leads);
  for (const l of leads) {
    const cat = classifyOwner(l, sizes.get(ownerKey(l.ownerName)) ?? 1);
    l.category = cat;
    l.deprioritized = isDeprioritized(cat);
    l.multiUnit = multi.has(l.parcelId);
  }
  return leads;
}

/**
 * Sort comparator: genuine leads first (by total desc), deprioritized owners
 * sink to the bottom (still visible, still ordered by total among themselves).
 * Assumes annotatePriority has run.
 */
export function byPriorityScore(a: Lead, b: Lead): number {
  const ad = a.deprioritized ? 1 : 0;
  const bd = b.deprioritized ? 1 : 0;
  if (ad !== bd) return ad - bd; // non-deprioritized (0) first
  if ((b.total ?? 0) !== (a.total ?? 0)) return (b.total ?? 0) - (a.total ?? 0);
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}
