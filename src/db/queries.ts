import { and, asc, desc, eq, isNotNull, lte, notInArray } from "drizzle-orm";
import { db } from "./index";
import { leads, notesLog, type Lead, type NoteEntry } from "./schema";
import { todayISO } from "../lib/util";
import { STATUSES } from "../lib/constants";

/** All leads, best prospects first (total desc, then most recently touched). */
export function getLeads(): Lead[] {
  return db.select().from(leads).orderBy(desc(leads.total), desc(leads.updatedAt)).all();
}

export function getLead(id: number): Lead | undefined {
  return db.select().from(leads).where(eq(leads.id, id)).get();
}

export function getLeadNotes(leadId: number): NoteEntry[] {
  return db
    .select()
    .from(notesLog)
    .where(eq(notesLog.leadId, leadId))
    .orderBy(desc(notesLog.createdAt))
    .all();
}

/** Leads grouped by status, in pipeline order — powers the board. */
export function getBoard(): Record<string, Lead[]> {
  const rows = getLeads();
  const grouped: Record<string, Lead[]> = {};
  for (const s of STATUSES) grouped[s] = [];
  for (const row of rows) {
    (grouped[row.status] ??= []).push(row);
  }
  return grouped;
}

/**
 * "Today" queue: leads with a next_action_date on or before today, excluding
 * finished pipelines (closed/dead). Soonest / most-overdue first.
 */
export function getTodayLeads(): Lead[] {
  return db
    .select()
    .from(leads)
    .where(
      and(
        isNotNull(leads.nextActionDate),
        lte(leads.nextActionDate, todayISO()),
        notInArray(leads.status, ["closed", "dead"]),
      ),
    )
    .orderBy(asc(leads.nextActionDate), desc(leads.total))
    .all();
}

export function countLeads(): number {
  return db.select().from(leads).all().length;
}
