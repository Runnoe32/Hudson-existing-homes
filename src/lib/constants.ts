// Shared vocab for statuses, sources, and the import field map.

/** Pipeline stages, in order (spec §7 status field). Drives the board columns. */
export const STATUSES = [
  "watchlist",
  "queued",
  "letter1_sent",
  "letter2_sent",
  "responded",
  "negotiating",
  "closed",
  "dead",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  watchlist: "Watchlist",
  queued: "Queued",
  letter1_sent: "Letter 1 sent",
  letter2_sent: "Letter 2 sent",
  responded: "Responded",
  negotiating: "Negotiating",
  closed: "Closed",
  dead: "Dead",
};

/** Lead sources (spec §7 source field). */
export const SOURCES = [
  "probate",
  "obit",
  "absentee",
  "drive-by",
  "expired-listing",
] as const;
export type Source = (typeof SOURCES)[number];

/**
 * When a lead lands in one of these statuses, stamp the matching date column
 * (only if empty) — see spec acceptance: "move ... with dates logging correctly".
 */
export const STATUS_DATE_FIELD: Partial<
  Record<Status, "letter1Date" | "letter2Date" | "responseDate">
> = {
  letter1_sent: "letter1Date",
  letter2_sent: "letter2Date",
  responded: "responseDate",
};

/**
 * Editable lead fields, grouped for the detail form, with input type + label.
 * `key` matches the Drizzle column property name.
 */
export type FieldType = "text" | "textarea" | "number" | "date" | "bool" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: readonly string[];
  group: string;
  colSpan?: 1 | 2;
}

export const LEAD_FIELDS: FieldDef[] = [
  // Identity / location
  { key: "parcelId", label: "Parcel ID", type: "text", group: "Property", colSpan: 1 },
  { key: "address", label: "Situs address", type: "text", group: "Property", colSpan: 2 },
  { key: "municipality", label: "Municipality", type: "text", group: "Property" },
  { key: "inHudsonSd", label: "In Hudson SD", type: "bool", group: "Property" },

  // Owner
  { key: "ownerName", label: "Owner name", type: "text", group: "Owner", colSpan: 2 },
  { key: "mailingAddress", label: "Mailing address", type: "text", group: "Owner", colSpan: 2 },

  // Assessor facts
  { key: "acreage", label: "Acreage", type: "number", group: "Facts" },
  { key: "yearBuilt", label: "Year built", type: "number", group: "Facts" },
  { key: "sqft", label: "Finished sqft", type: "number", group: "Facts" },
  { key: "beds", label: "Bedrooms", type: "number", group: "Facts" },
  { key: "assessedValue", label: "Assessed value", type: "number", group: "Facts" },
  { key: "estMarket", label: "Est. market", type: "number", group: "Facts" },
  { key: "lotteryCredit", label: "Lottery credit", type: "bool", group: "Facts" },
  { key: "tenureYears", label: "Tenure (yrs)", type: "number", group: "Facts" },

  // Source & probate
  { key: "source", label: "Source", type: "select", options: SOURCES, group: "Source" },
  { key: "probateCaseNo", label: "Probate case #", type: "text", group: "Source" },
  { key: "prName", label: "Personal rep (PR)", type: "text", group: "Source" },
  { key: "prAttorney", label: "PR attorney", type: "text", group: "Source", colSpan: 2 },

  // Scoring
  { key: "fitScore", label: "Fit (0–10)", type: "number", group: "Scoring" },
  { key: "motivationScore", label: "Motivation (0–10)", type: "number", group: "Scoring" },

  // Working fields
  { key: "nextAction", label: "Next action", type: "text", group: "Pipeline", colSpan: 2 },
  { key: "nextActionDate", label: "Next action date", type: "date", group: "Pipeline" },
  { key: "notes", label: "Notes (summary)", type: "textarea", group: "Pipeline", colSpan: 2 },
];

/** Numeric fields (parsed as numbers on save/import). */
export const NUMBER_KEYS = new Set([
  "acreage",
  "yearBuilt",
  "sqft",
  "beds",
  "assessedValue",
  "estMarket",
  "tenureYears",
  "fitScore",
  "motivationScore",
]);

/** Boolean fields. */
export const BOOL_KEYS = new Set(["inHudsonSd", "lotteryCredit"]);

/** Every column an import can target (used by the column-mapping UI). */
export const IMPORTABLE_KEYS = [
  "parcelId",
  "address",
  "municipality",
  "inHudsonSd",
  "ownerName",
  "mailingAddress",
  "acreage",
  "yearBuilt",
  "sqft",
  "beds",
  "assessedValue",
  "estMarket",
  "lotteryCredit",
  "tenureYears",
  "source",
  "probateCaseNo",
  "prName",
  "prAttorney",
  "fitScore",
  "motivationScore",
  "status",
  "nextAction",
  "nextActionDate",
  "notes",
] as const;
export type ImportableKey = (typeof IMPORTABLE_KEYS)[number];

export const IMPORT_FIELD_LABELS: Record<ImportableKey, string> = {
  parcelId: "Parcel ID *",
  address: "Situs address",
  municipality: "Municipality",
  inHudsonSd: "In Hudson SD",
  ownerName: "Owner name",
  mailingAddress: "Mailing address",
  acreage: "Acreage",
  yearBuilt: "Year built",
  sqft: "Finished sqft",
  beds: "Bedrooms",
  assessedValue: "Assessed value",
  estMarket: "Est. market",
  lotteryCredit: "Lottery credit",
  tenureYears: "Tenure (yrs)",
  source: "Source",
  probateCaseNo: "Probate case #",
  prName: "Personal rep (PR)",
  prAttorney: "PR attorney",
  fitScore: "Fit score",
  motivationScore: "Motivation score",
  status: "Status",
  nextAction: "Next action",
  nextActionDate: "Next action date",
  notes: "Notes",
};
