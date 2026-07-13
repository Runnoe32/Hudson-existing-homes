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
import { syncHomes } from "@/db/sync";
import type { ImportableKey } from "@/lib/constants";

export type { ImportResult };

function revalidateAll() {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/today");
}

const detail = (parcelId: string) => `/leads/${encodeURIComponent(parcelId)}`;

export interface CreateState {
  error?: string;
}

export async function createLead(
  _prev: CreateState | null,
  formData: FormData,
): Promise<CreateState> {
  const res = await createLeadRecord({
    parcelId: String(formData.get("parcelId") ?? ""),
    ownerName: String(formData.get("ownerName") ?? ""),
    address: String(formData.get("address") ?? ""),
    source: String(formData.get("source") ?? ""),
  });
  if (!res.ok) return { error: res.error };
  revalidateAll();
  redirect(detail(res.parcelId));
}

export async function updateField(parcelId: string, key: string, rawValue: string) {
  const res = await updateLeadField(parcelId, key, rawValue);
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidateAll();
  revalidatePath(detail(res.parcelId));
  return { ok: true as const, value: res.value, total: res.total, parcelId: res.parcelId };
}

export async function changeStatus(parcelId: string, newStatus: string) {
  const res = await transitionStatus(parcelId, newStatus);
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidateAll();
  revalidatePath(detail(parcelId));
  return { ok: true as const, stamped: res.stamped };
}

export async function addNote(parcelId: string, body: string) {
  const res = await appendNote(parcelId, body);
  if (!res.ok) return { ok: false as const, error: res.error };
  revalidatePath(detail(parcelId));
  return { ok: true as const };
}

export async function deleteLead(parcelId: string) {
  await removeLead(parcelId);
  revalidateAll();
  redirect("/");
}

export async function importLeads(
  rows: Partial<Record<ImportableKey, string>>[],
): Promise<ImportResult> {
  const result = await importRows(rows);
  revalidateAll();
  return result;
}

export async function syncFromCounty() {
  try {
    const r = await syncHomes();
    revalidateAll();
    return { ok: true as const, ...r };
  } catch (e) {
    return { ok: false as const, error: e instanceof Error ? e.message : "Sync failed." };
  }
}
