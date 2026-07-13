/**
 * Framework-free data-mutation layer. All DB writes for leads/notes live here as
 * plain functions so they can be unit/E2E tested without a Next request context.
 * The server actions in src/app/actions.ts are thin wrappers that call these and
 * then revalidate/redirect.
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import { leads, notesLog, type NewLead } from "./schema";
import { getLead } from "./queries";
import { coerceValue } from "../lib/coerce";
import { clampScore, computeTotal } from "../lib/scoring";
import {
  IMPORTABLE_KEYS,
  STATUSES,
  STATUS_DATE_FIELD,
  STATUS_LABELS,
  type ImportableKey,
  type Status,
} from "../lib/constants";
import { todayISO } from "../lib/util";

export type NoteKind = "note" | "status" | "system";

export function logNote(leadId: number, body: string, kind: NoteKind) {
  db.insert(notesLog).values({ leadId, body, kind }).run();
}

export interface CreateInput {
  parcelId: string;
  address?: string | null;
  ownerName?: string | null;
  source?: string | null;
}

export function createLeadRecord(
  input: CreateInput,
): { ok: true; id: number } | { ok: false; error: string } {
  const parcelId = String(input.parcelId ?? "").trim();
  if (!parcelId) return { ok: false, error: "Parcel ID is required." };

  const existing = db.select().from(leads).where(eq(leads.parcelId, parcelId)).get();
  if (existing) {
    return { ok: false, error: `Parcel ${parcelId} already exists (opens as lead #${existing.id}).` };
  }

  const values: NewLead = {
    parcelId,
    address: input.address?.trim() || null,
    ownerName: input.ownerName?.trim() || null,
    source: input.source?.trim() || null,
    status: "watchlist",
    fitScore: 0,
    motivationScore: 0,
    total: 0,
  };
  const row = db.insert(leads).values(values).returning({ id: leads.id }).get();
  logNote(row.id, "Lead created.", "system");
  return { ok: true, id: row.id };
}

export function updateLeadField(
  id: number,
  key: string,
  rawValue: string,
): { ok: true; value: unknown; total?: number } | { ok: false; error: string } {
  const lead = getLead(id);
  if (!lead) return { ok: false, error: "Lead not found." };

  if (key === "parcelId") {
    const v = String(rawValue).trim();
    if (!v) return { ok: false, error: "Parcel ID cannot be empty." };
    const clash = db.select().from(leads).where(eq(leads.parcelId, v)).get();
    if (clash && clash.id !== id) return { ok: false, error: "Parcel ID already in use." };
  }

  // Scores are clamped to 0–10 on the way in (§4); everything else coerces by type.
  const isScore = key === "fitScore" || key === "motivationScore";
  const value = isScore ? clampScore(coerceValue(key, rawValue)) : coerceValue(key, rawValue);
  const patch: Record<string, unknown> = { [key]: value, updatedAt: new Date() };
  let total: number | undefined;

  if (isScore) {
    const fit = key === "fitScore" ? value : lead.fitScore;
    const mot = key === "motivationScore" ? value : lead.motivationScore;
    total = computeTotal(fit, mot);
    patch.total = total;
  }

  db.update(leads).set(patch).where(eq(leads.id, id)).run();
  return { ok: true, value, total };
}

export function transitionStatus(
  id: number,
  newStatus: string,
): { ok: true; stamped: string | null } | { ok: false; error: string } {
  if (!STATUSES.includes(newStatus as Status)) return { ok: false, error: "Unknown status." };
  const lead = getLead(id);
  if (!lead) return { ok: false, error: "Lead not found." };
  if (lead.status === newStatus) return { ok: true, stamped: null };

  const patch: Record<string, unknown> = { status: newStatus, updatedAt: new Date() };
  const dateField = STATUS_DATE_FIELD[newStatus as Status];
  let stamped: string | null = null;
  if (dateField && !lead[dateField]) {
    stamped = todayISO();
    patch[dateField] = stamped;
  }
  db.update(leads).set(patch).where(eq(leads.id, id)).run();

  const from = STATUS_LABELS[lead.status as Status] ?? lead.status;
  const to = STATUS_LABELS[newStatus as Status] ?? newStatus;
  logNote(id, `Status: ${from} → ${to}${stamped ? ` — dated ${stamped}` : ""}`, "status");
  return { ok: true, stamped };
}

export function appendNote(id: number, body: string): { ok: boolean; error?: string } {
  const text = String(body ?? "").trim();
  if (!text) return { ok: false, error: "Note is empty." };
  if (!getLead(id)) return { ok: false, error: "Lead not found." };
  logNote(id, text, "note");
  db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, id)).run();
  return { ok: true };
}

export function removeLead(id: number) {
  db.delete(leads).where(eq(leads.id, id)).run(); // notes cascade
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  skippedParcels: string[];
  errors: string[];
}

/**
 * Bulk import mapped rows. Dedupe on parcel_id: existing parcels (and repeats
 * within the batch) are skipped, never overwritten.
 */
export function importRows(rows: Partial<Record<ImportableKey, string>>[]): ImportResult {
  const result: ImportResult = { inserted: 0, skipped: 0, skippedParcels: [], errors: [] };

  const existing = new Set(db.select({ p: leads.parcelId }).from(leads).all().map((r) => r.p));
  const seenInBatch = new Set<string>();

  db.transaction((tx) => {
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const parcelId = String(raw.parcelId ?? "").trim();
      if (!parcelId) {
        result.errors.push(`Row ${i + 1}: missing parcel_id — skipped.`);
        continue;
      }
      if (existing.has(parcelId) || seenInBatch.has(parcelId)) {
        result.skipped++;
        if (result.skippedParcels.length < 25) result.skippedParcels.push(parcelId);
        continue;
      }
      seenInBatch.add(parcelId);

      const values: Record<string, unknown> = { parcelId };
      for (const key of IMPORTABLE_KEYS) {
        if (key === "parcelId") continue;
        if (raw[key] == null || raw[key] === "") continue;
        const coerced = coerceValue(key, raw[key]);
        values[key] =
          key === "fitScore" || key === "motivationScore" ? clampScore(coerced) : coerced;
      }
      if (!values.status || !STATUSES.includes(values.status as Status)) {
        values.status = "watchlist";
      }
      values.total = computeTotal(values.fitScore, values.motivationScore);

      const row = tx.insert(leads).values(values as NewLead).returning({ id: leads.id }).get();
      tx.insert(notesLog)
        .values({ leadId: row.id, body: "Imported from CSV.", kind: "system" })
        .run();
      result.inserted++;
    }
  });

  return result;
}
