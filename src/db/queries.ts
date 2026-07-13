// Reads. Load leads from the store (Redis/JSON) and filter/sort in JS — fine at
// a few thousand records, and keeps one code path across both backends.
import { getAll, getOne } from "./store";
import type { Lead, NoteEntry } from "@/lib/types";
import { todayISO } from "@/lib/util";
import { STATUSES } from "@/lib/constants";

function byScore(a: Lead, b: Lead): number {
  if ((b.total ?? 0) !== (a.total ?? 0)) return (b.total ?? 0) - (a.total ?? 0);
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}

export async function getLeads(): Promise<Lead[]> {
  return (await getAll()).sort(byScore);
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
  minTotal?: number;
  enrichedOnly?: boolean;
  limit?: number;
}

export async function getLeadsFiltered(f: LeadFilter): Promise<{ rows: Lead[]; total: number }> {
  let rows = await getAll();
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    rows = rows.filter((l) =>
      [l.ownerName, l.address, l.parcelId].some((v) => v && v.toLowerCase().includes(q)),
    );
  }
  if (f.parcelType) rows = rows.filter((l) => l.parcelType === f.parcelType);
  if (f.absentee) rows = rows.filter((l) => l.absentee);
  if (f.status) rows = rows.filter((l) => l.status === f.status);
  if (typeof f.minTotal === "number") rows = rows.filter((l) => (l.total ?? 0) >= f.minTotal!);
  if (f.enrichedOnly) rows = rows.filter((l) => l.landData != null);

  rows.sort(byScore);
  const total = rows.length;
  return { rows: rows.slice(0, f.limit ?? 250), total };
}

/** Leads grouped by status, in pipeline order — powers the board. */
export async function getBoard(): Promise<Record<string, Lead[]>> {
  const rows = (await getAll()).sort(byScore);
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
