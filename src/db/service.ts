/**
 * Framework-free CRM mutations against the store. Every write is a
 * read-modify-write of a single lead keyed by parcelId. The server actions in
 * src/app/actions.ts are thin wrappers that call these and then revalidate.
 */
import { getOne, putOne, putMany, removeOne, getAll } from "./store";
import { blankLead, type Lead, type NoteEntry } from "@/lib/types";
import { coerceValue } from "@/lib/coerce";
import { clampScore, computeTotal } from "@/lib/scoring";
import {
  IMPORTABLE_KEYS,
  STATUSES,
  STATUS_DATE_FIELD,
  STATUS_LABELS,
  type ImportableKey,
  type Status,
} from "@/lib/constants";
import { todayISO } from "@/lib/util";

const nowISO = () => new Date().toISOString();

function pushLog(lead: Lead, body: string, kind: NoteEntry["kind"]) {
  lead.log = [...(lead.log ?? []), { body, kind, createdAt: nowISO() }];
}

export interface CreateInput {
  parcelId: string;
  address?: string | null;
  ownerName?: string | null;
  source?: string | null;
}

export async function createLeadRecord(
  input: CreateInput,
): Promise<{ ok: true; parcelId: string } | { ok: false; error: string }> {
  const parcelId = String(input.parcelId ?? "").trim();
  if (!parcelId) return { ok: false, error: "Parcel ID is required." };
  if (await getOne(parcelId)) return { ok: false, error: `Parcel ${parcelId} already exists.` };

  const lead = blankLead(parcelId);
  lead.address = input.address?.trim() || null;
  lead.ownerName = input.ownerName?.trim() || null;
  lead.source = input.source?.trim() || null;
  pushLog(lead, "Lead created.", "system");
  await putOne(lead);
  return { ok: true, parcelId };
}

export async function updateLeadField(
  parcelId: string,
  key: string,
  rawValue: string,
): Promise<{ ok: true; parcelId: string; value: unknown; total?: number } | { ok: false; error: string }> {
  const lead = await getOne(parcelId);
  if (!lead) return { ok: false, error: "Lead not found." };

  // Renaming the parcelId means moving the record to a new key.
  if (key === "parcelId") {
    const v = String(rawValue).trim();
    if (!v) return { ok: false, error: "Parcel ID cannot be empty." };
    if (v !== parcelId) {
      if (await getOne(v)) return { ok: false, error: "Parcel ID already in use." };
      const moved: Lead = { ...lead, parcelId: v, updatedAt: nowISO() };
      await putOne(moved);
      await removeOne(parcelId);
      return { ok: true, parcelId: v, value: v };
    }
    return { ok: true, parcelId, value: v };
  }

  const isScore = key === "fitScore" || key === "motivationScore";
  const value = isScore ? clampScore(coerceValue(key, rawValue)) : coerceValue(key, rawValue);
  (lead as unknown as Record<string, unknown>)[key] = value;
  lead.updatedAt = nowISO();

  let total: number | undefined;
  if (isScore) {
    total = computeTotal(lead.fitScore, lead.motivationScore);
    lead.total = total;
  }
  await putOne(lead);
  return { ok: true, parcelId, value, total };
}

export async function transitionStatus(
  parcelId: string,
  newStatus: string,
): Promise<{ ok: true; stamped: string | null } | { ok: false; error: string }> {
  if (!STATUSES.includes(newStatus as Status)) return { ok: false, error: "Unknown status." };
  const lead = await getOne(parcelId);
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === newStatus) return { ok: true, stamped: null };

  const from = STATUS_LABELS[lead.status as Status] ?? lead.status;
  const to = STATUS_LABELS[newStatus as Status] ?? newStatus;

  const dateField = STATUS_DATE_FIELD[newStatus as Status];
  let stamped: string | null = null;
  if (dateField && !lead[dateField]) {
    stamped = todayISO();
    lead[dateField] = stamped;
  }
  lead.status = newStatus;
  lead.updatedAt = nowISO();
  pushLog(lead, `Status: ${from} → ${to}${stamped ? ` — dated ${stamped}` : ""}`, "status");
  await putOne(lead);
  return { ok: true, stamped };
}

export async function appendNote(
  parcelId: string,
  body: string,
): Promise<{ ok: boolean; error?: string }> {
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "Note is empty." };
  const lead = await getOne(parcelId);
  if (!lead) return { ok: false, error: "Lead not found." };
  pushLog(lead, text, "note");
  lead.updatedAt = nowISO();
  await putOne(lead);
  return { ok: true };
}

export async function removeLead(parcelId: string): Promise<void> {
  await removeOne(parcelId);
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  skippedParcels: string[];
  errors: string[];
}

/** CSV import (fallback path). Dedupe on parcelId — existing leads are skipped. */
export async function importRows(
  rows: Partial<Record<ImportableKey, string>>[],
): Promise<ImportResult> {
  const result: ImportResult = { inserted: 0, skipped: 0, skippedParcels: [], errors: [] };
  const existing = new Set((await getAll()).map((l) => l.parcelId));
  const seen = new Set<string>();
  const toWrite: Lead[] = [];

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const parcelId = String(raw.parcelId ?? "").trim();
    if (!parcelId) {
      result.errors.push(`Row ${i + 1}: missing parcel_id — skipped.`);
      continue;
    }
    if (existing.has(parcelId) || seen.has(parcelId)) {
      result.skipped++;
      if (result.skippedParcels.length < 25) result.skippedParcels.push(parcelId);
      continue;
    }
    seen.add(parcelId);

    const lead = blankLead(parcelId);
    for (const key of IMPORTABLE_KEYS) {
      if (key === "parcelId") continue;
      if (raw[key] == null || raw[key] === "") continue;
      const coerced = coerceValue(key, raw[key]);
      (lead as unknown as Record<string, unknown>)[key] =
        key === "fitScore" || key === "motivationScore" ? clampScore(coerced) : coerced;
    }
    if (!STATUSES.includes(lead.status as Status)) lead.status = "watchlist";
    lead.total = computeTotal(lead.fitScore, lead.motivationScore);
    pushLog(lead, "Imported from CSV.", "system");
    toWrite.push(lead);
    result.inserted++;
  }
  await putMany(toWrite);
  return result;
}
