// Reads. Load leads from the store (Redis/JSON) and filter/sort in JS — fine at
// a few thousand records, and keeps one code path across both backends.
import { getAll, getOne } from "./store";
import type { Lead, NoteEntry } from "@/lib/types";
import { todayISO } from "@/lib/util";
import { STATUSES } from "@/lib/constants";
import { annotatePriority, byPriorityScore } from "@/lib/priority";

/** Load every lead with owner-category annotation attached (for sort + badges). */
async function getAllAnnotated(): Promise<Lead[]> {
  return annotatePriority(await getAll());
}

export async function getLeads(): Promise<Lead[]> {
  return (await getAllAnnotated()).sort(byPriorityScore);
}

export async function getLead(parcelId: string): Promise<Lead | null> {
  return getOne(parcelId);
}

/** Activity log, newest first. */
export async function getLeadNotes(parcelId: string): Promise<NoteEntry[]> {
  const lead = await getOne(parcelId);
  if (!lead) return [];
  return [...(lead.log ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface LeadFilter {
  q?: string;
  parcelType?: string;
  absentee?: boolean;
  status?: string;
  municipality?: string;
  minTotal?: number;
  maxAssessed?: number;
  minAssessed?: number;
  minImp?: number;
  maxImp?: number;
  minAcres?: number;
  maxAcres?: number;
  enrichedOnly?: boolean;
  hideDeprioritized?: boolean;
  singleFamilyOnly?: boolean;
  sortBy?: SortKey;
  sortDir?: "asc" | "desc";
  limit?: number;
}

/** Columns the table can be sorted by. Omitted / "priority" = default lead sort. */
export type SortKey =
  | "priority"
  | "total"
  | "assessedValue"
  | "impValue"
  | "acreage"
  | "municipality"
  | "owner";

/** Numbers sort by direction; null/missing always sinks to the bottom. */
function numCmp(a: number | null | undefined, b: number | null | undefined, d: number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * d;
}
/** Strings sort by direction; empty/missing always sinks to the bottom. */
function strCmp(a: string | null | undefined, b: string | null | undefined, d: number): number {
  const av = a ?? "";
  const bv = b ?? "";
  if (!av && !bv) return 0;
  if (!av) return 1;
  if (!bv) return -1;
  return av.localeCompare(bv) * d;
}

/**
 * Sort in place by the chosen column. `byPriorityScore` is the default and the
 * tiebreak for every column, so rows with equal values keep a stable, sensible
 * order (and deprioritized owners still sink within ties).
 */
function sortLeads(rows: Lead[], sortBy: SortKey | undefined, dir: "asc" | "desc" | undefined): void {
  if (!sortBy || sortBy === "priority") {
    rows.sort(byPriorityScore);
    return;
  }
  const d = dir === "asc" ? 1 : -1;
  const primary: Record<Exclude<SortKey, "priority">, (a: Lead, b: Lead) => number> = {
    total: (a, b) => numCmp(a.total, b.total, d),
    assessedValue: (a, b) => numCmp(a.assessedValue, b.assessedValue, d),
    impValue: (a, b) => numCmp(a.impValue, b.impValue, d),
    acreage: (a, b) => numCmp(a.acreage, b.acreage, d),
    municipality: (a, b) => strCmp(a.municipality, b.municipality, d),
    owner: (a, b) => strCmp(a.ownerName, b.ownerName, d),
  };
  const cmp = primary[sortBy];
  rows.sort((a, b) => cmp(a, b) || byPriorityScore(a, b));
}

/** Distinct values for filter dropdowns, computed across the full lead set. */
export interface LeadFacets {
  municipalities: string[];
}

/** Slim per-lead shape for map pins (keeps the client payload small). */
export interface LeadPin {
  parcelId: string;
  lat: number;
  lon: number;
  total: number;
  parcelType: "home-fit" | "acreage-split" | null;
  ownerName: string | null;
  status: string;
  estate: boolean;
  deprioritized: boolean;
}

export async function getLeadsFiltered(
  f: LeadFilter,
): Promise<{ rows: Lead[]; total: number; pins: LeadPin[]; facets: LeadFacets }> {
  let rows = await getAllAnnotated();

  // Facet lists (for filter dropdowns) come from the FULL set so the options stay
  // stable regardless of what's currently filtered.
  const municipalities = [...new Set(rows.map((l) => l.municipality).filter(Boolean) as string[])].sort(
    (a, b) => a.localeCompare(b),
  );

  if (f.q) {
    const q = f.q.trim().toLowerCase();
    rows = rows.filter((l) =>
      [l.ownerName, l.address, l.parcelId].some((v) => v && v.toLowerCase().includes(q)),
    );
  }
  if (f.parcelType) rows = rows.filter((l) => l.parcelType === f.parcelType);
  if (f.absentee) rows = rows.filter((l) => l.absentee);
  if (f.status) rows = rows.filter((l) => l.status === f.status);
  if (f.municipality) rows = rows.filter((l) => l.municipality === f.municipality);
  if (typeof f.minTotal === "number") rows = rows.filter((l) => (l.total ?? 0) >= f.minTotal!);
  if (typeof f.minAssessed === "number")
    rows = rows.filter((l) => (l.assessedValue ?? 0) >= f.minAssessed!);
  if (typeof f.maxAssessed === "number")
    rows = rows.filter((l) => (l.assessedValue ?? Infinity) <= f.maxAssessed!);
  if (typeof f.minImp === "number") rows = rows.filter((l) => (l.impValue ?? 0) >= f.minImp!);
  if (typeof f.maxImp === "number") rows = rows.filter((l) => (l.impValue ?? Infinity) <= f.maxImp!);
  if (typeof f.minAcres === "number") rows = rows.filter((l) => (l.acreage ?? 0) >= f.minAcres!);
  if (typeof f.maxAcres === "number") rows = rows.filter((l) => (l.acreage ?? Infinity) <= f.maxAcres!);
  if (f.enrichedOnly) rows = rows.filter((l) => l.landData != null);
  if (f.hideDeprioritized) rows = rows.filter((l) => !l.deprioritized);
  if (f.singleFamilyOnly) rows = rows.filter((l) => !l.multiUnit);

  sortLeads(rows, f.sortBy, f.sortDir);
  const total = rows.length;

  // All matching leads that have coordinates become map pins (not just the top N).
  const pins: LeadPin[] = rows
    .filter((l) => l.lat != null && l.lon != null)
    .map((l) => ({
      parcelId: l.parcelId,
      lat: l.lat!,
      lon: l.lon!,
      total: l.total ?? 0,
      parcelType: l.parcelType,
      ownerName: l.ownerName,
      status: l.status,
      estate: l.source === "estate",
      deprioritized: !!l.deprioritized,
    }));

  return { rows: rows.slice(0, f.limit ?? 250), total, pins, facets: { municipalities } };
}

/** Leads grouped by status, in pipeline order — powers the board. */
export async function getBoard(): Promise<Record<string, Lead[]>> {
  const rows = (await getAllAnnotated()).sort(byPriorityScore);
  const grouped: Record<string, Lead[]> = {};
  for (const s of STATUSES) grouped[s] = [];
  for (const row of rows) (grouped[row.status] ??= []).push(row);
  return grouped;
}

/** "Today" queue: next_action_date <= today, excluding closed/dead. */
export async function getTodayLeads(): Promise<Lead[]> {
  const today = todayISO();
  return (await getAll())
    .filter(
      (l) =>
        l.nextActionDate != null &&
        l.nextActionDate <= today &&
        l.status !== "closed" &&
        l.status !== "dead",
    )
    .sort((a, b) => {
      const d = (a.nextActionDate ?? "").localeCompare(b.nextActionDate ?? "");
      return d !== 0 ? d : (b.total ?? 0) - (a.total ?? 0);
    });
}

export async function countLeads(): Promise<number> {
  return (await getAll()).length;
}
