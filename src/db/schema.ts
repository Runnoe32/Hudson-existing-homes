import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * §7 Tracker schema — one row per parcel/lead.
 *
 * Field names mirror the spec's schema table. Date fields (letter1_date,
 * response_date, next_action_date, …) are stored as ISO `YYYY-MM-DD` text so
 * lexical comparison == chronological comparison (used by the "Today" queue).
 * Row bookkeeping timestamps (created_at/updated_at) are unix-epoch integers.
 */
export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Identity / location
  parcelId: text("parcel_id").notNull().unique(), // dedupe key on import
  address: text("address"),
  municipality: text("municipality"),
  inHudsonSd: integer("in_hudson_sd", { mode: "boolean" }).default(false),

  // Owner
  ownerName: text("owner_name"),
  mailingAddress: text("mailing_address"),

  // Assessor facts
  acreage: real("acreage"), // fractional acres allowed (e.g. 0.75)
  yearBuilt: integer("year_built"),
  sqft: integer("sqft"),
  beds: integer("beds"),
  assessedValue: integer("assessed_value"),
  estMarket: integer("est_market"),
  lotteryCredit: integer("lottery_credit", { mode: "boolean" }).default(false),
  tenureYears: integer("tenure_years"),

  // Source & probate
  source: text("source"), // probate | obit | absentee | drive-by | expired-listing
  probateCaseNo: text("probate_case_no"),
  prName: text("pr_name"),
  prAttorney: text("pr_attorney"),

  // Scoring (manual in Phase 1; total = fit + motivation)
  fitScore: integer("fit_score").default(0),
  motivationScore: integer("motivation_score").default(0),
  total: integer("total").default(0),

  // Pipeline
  status: text("status").notNull().default("watchlist"),
  letter1Date: text("letter1_date"),
  letter2Date: text("letter2_date"),
  responseDate: text("response_date"),

  // Working fields
  notes: text("notes"),
  nextAction: text("next_action"),
  nextActionDate: text("next_action_date"),

  // County-sync fields (auto-populated from the WI Statewide Parcel layer;
  // refreshed on every sync, but never clobber the user-owned fields above).
  landValue: integer("land_value"), // LNDVALUE
  impValue: integer("imp_value"), // IMPVALUE — the house/improvement value
  lat: real("lat"),
  lon: real("lon"),
  propClass: text("prop_class"), // PROPCLASS, e.g. "1,4,5"
  parcelType: text("parcel_type"), // home-fit | acreage-split
  absentee: integer("absentee", { mode: "boolean" }).default(false),
  landData: text("land_data"), // JSON blob of land enrichment (arsenic/septic/slope/tce…) when available
  syncedAt: integer("synced_at", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

/**
 * Timestamped, append-only activity log per lead (§8 Phase 1: "timestamped
 * notes log"). Distinct from the free-text `leads.notes` field in §7 — this is
 * the running history (status changes are auto-appended here too).
 */
export const notesLog = sqliteTable("notes_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  kind: text("kind").notNull().default("note"), // note | status | system
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
export type NoteEntry = typeof notesLog.$inferSelect;
