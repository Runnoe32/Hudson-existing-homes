"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  appendNote,
  createLeadRecord,
  importRows,
  removeLead,
  transitionStatus,
  updateLeadField,
  type ImportResult,
} from "@/db/service";
import type { ImportableKey } from "@/lib/constants";

export type { ImportResult };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/today");
}

export interface CreateState {
  error?: string;
}

/** Create a new lead (useActionState-compatible). Redirects to it on success. */
export async function createLead(
  _prev: CreateState | null,
  formData: FormData,
): Promise<CreateState> {
  const res = createLeadRecord({
    parcelId: String(formData.get("parcelId") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    address: String(formData.get("address") ?? ""),
    source: String(formData.get("source") ?? ""),
  });
  if (!res.ok) return { error: res.error };
  revalidateAll();
  redirect(`/leads/${res.id}`);
}

/** Inline single-field edit. Recomputes `total` when a score changes. */
export async function updateField(id: number, key: string, rawValue: string) {
  const res = updateLeadField(id, key, rawValue);
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidateAll();
  revalidatePath(`/leads/${id}`);
  return { ok: true as const, value: res.value, total: res.total };
}

/** Status transition — stamps the matching date column + logs the change. */
export async function changeStatus(id: number, newStatus: string) {
  const res = transitionStatus(id, newStatus);
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidateAll();
  revalidatePath(`/leads/${id}`);
  return { ok: true as const, stamped: res.stamped };
}

/** Append a free-text note to a lead's timestamped log. */
export async function addNote(id: number, body: string) {
  const res = appendNote(id, body);
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath(`/leads/${id}`);
  return { ok: true as const };
}

export async function deleteLead(id: number) {
  removeLead(id);
  revalidateAll();
  redirect("/");
}

/** Bulk import mapped rows. Dedupe on parcel_id (existing parcels skipped). */
export async function importLeads(
  rows: Partial<Record<ImportableKey, string>>[],
): Promise<ImportResult> {
  const result = importRows(rows);
  revalidateAll();
  return result;
}
