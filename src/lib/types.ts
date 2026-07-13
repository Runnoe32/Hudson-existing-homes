// Plain data types for a lead + its activity log. No ORM — leads are JSON objects
// stored in Redis (prod) or a local JSON file (dev), keyed by parcelId.

export interface NoteEntry {
  body: string;
  kind: "note" | "status" | "system";
  createdAt: string; // ISO timestamp
}

export interface Lead {
  parcelId: string; // unique key

  // Identity / location
  address: string | null;
  municipality: string | null;
  inHudsonSd: boolean;

  // Owner
  ownerName: string | null;
  mailingAddress: string | null;

  // Assessor facts
  acreage: number | null;
  yearBuilt: number | null;
  sqft: number | null;
  beds: number | null;
  assessedValue: number | null;
  estMarket: number | null;
  lotteryCredit: boolean | null;
  tenureYears: number | null;

  // Source & probate
  source: string | null;
  probateCaseNo: string | null;
  prName: string | null;
  prAttorney: string | null;

  // Scoring
  fitScore: number;
  motivationScore: number;
  total: number;

  // Pipeline
  status: string;
  letter1Date: string | null;
  letter2Date: string | null;
  responseDate: string | null;

  // Working fields
  notes: string | null;
  nextAction: string | null;
  nextActionDate: string | null;

  // County-sync fields
  landValue: number | null;
  impValue: number | null;
  lat: number | null;
  lon: number | null;
  propClass: string | null;
  parcelType: "home-fit" | "acreage-split" | null;
  absentee: boolean;
  landData: string | null; // JSON string of land enrichment

  // Bookkeeping
  syncedAt: string | null; // ISO
  createdAt: string; // ISO
  updatedAt: string; // ISO

  // Embedded, timestamped activity log (status changes + notes)
  log: NoteEntry[];
}

/** A brand-new lead with sane defaults; caller overrides what it knows. */
export function blankLead(parcelId: string, now = new Date().toISOString()): Lead {
  return {
    parcelId,
    address: null,
    municipality: null,
    inHudsonSd: false,
    ownerName: null,
    mailingAddress: null,
    acreage: null,
    yearBuilt: null,
    sqft: null,
    beds: null,
    assessedValue: null,
    estMarket: null,
    lotteryCredit: null,
    tenureYears: null,
    source: null,
    probateCaseNo: null,
    prName: null,
    prAttorney: null,
    fitScore: 0,
    motivationScore: 0,
    total: 0,
    status: "watchlist",
    letter1Date: null,
    letter2Date: null,
    responseDate: null,
    notes: null,
    nextAction: null,
    nextActionDate: null,
    landValue: null,
    impValue: null,
    lat: null,
    lon: null,
    propClass: null,
    parcelType: null,
    absentee: false,
    landData: null,
    syncedAt: null,
    createdAt: now,
    updatedAt: now,
    log: [],
  };
}
