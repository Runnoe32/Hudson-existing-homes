/**
 * Verify the county-sync upsert preserves user research while refreshing county
 * data. No network — feeds synthetic ParcelRecords straight into upsertParcels.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db/index";
import { leads, notesLog } from "../src/db/schema";
import { upsertParcels } from "../src/db/sync";
import { getLead } from "../src/db/queries";
import type { ParcelRecord } from "../src/lib/parcels";

let fails = 0;
const check = (n: string, c: boolean, d = "") => {
  console.log(`${c ? "  ✔" : "  ✗ FAIL:"} ${n}${d ? ` — ${d}` : ""}`);
  if (!c) fails++;
};

const P = "999TEST00001";
// clean slate for the test parcel
db.delete(leads).where(eq(leads.parcelId, P)).run();

const v1: ParcelRecord = {
  parcelId: P, ownerName: "OLD OWNER", mailingAddress: "1 OLD ST STILLWATER MN 55082",
  address: "500 TEST RD", municipality: "TOWN OF HUDSON", acreage: 2.0,
  landValue: 120000, impValue: 250000, assessedValue: 400000, estMarket: 440000,
  propClass: "1", lat: 44.9, lon: -92.7, absentee: true, parcelType: "home-fit",
};

console.log("[A] first sync inserts with auto-scores");
upsertParcels([v1]);
const a = getLead(db.select().from(leads).where(eq(leads.parcelId, P)).get()!.id)!;
check("inserted", !!a);
check("auto fit = 5 (1-3ac +3, ~$400k +2)", a.fitScore === 5, `${a.fitScore}`);
check("auto motivation = 2 (absentee)", a.motivationScore === 2, `${a.motivationScore}`);
check("total = 7", a.total === 7, `${a.total}`);
check("absentee flagged", a.absentee === true);
check("source seeded 'absentee'", a.source === "absentee");

console.log("[B] user does research (edit scores, status, notes, beds/sqft)");
db.update(leads).set({
  fitScore: 9, motivationScore: 8, total: 17, status: "queued",
  notes: "Called; warm.", nextAction: "Mail letter", nextActionDate: "2026-08-01",
  beds: 4, sqft: 2600, yearBuilt: 1994, probateCaseNo: "2026PR9",
}).where(eq(leads.parcelId, P)).run();
const noteCountBefore = db.select().from(notesLog).where(eq(notesLog.leadId, a.id)).all().length;

console.log("[C] re-sync with CHANGED county data must refresh county, preserve research");
const v2: ParcelRecord = { ...v1, ownerName: "NEW OWNER LLC", assessedValue: 430000, impValue: 275000, acreage: 2.1 };
const r = upsertParcels([v2]);
const c = getLead(a.id)!;
check("routed as update (not insert)", r.updated === 1 && r.inserted === 0, `upd=${r.updated} ins=${r.inserted}`);
// county fields refreshed:
check("owner refreshed", c.ownerName === "NEW OWNER LLC", c.ownerName ?? "");
check("assessed refreshed", c.assessedValue === 430000, `${c.assessedValue}`);
check("imp value refreshed", c.impValue === 275000, `${c.impValue}`);
// user research preserved:
check("fit preserved (9)", c.fitScore === 9, `${c.fitScore}`);
check("motivation preserved (8)", c.motivationScore === 8, `${c.motivationScore}`);
check("total preserved (17)", c.total === 17, `${c.total}`);
check("status preserved (queued)", c.status === "queued", c.status);
check("notes preserved", c.notes === "Called; warm.", c.notes ?? "");
check("nextAction preserved", c.nextAction === "Mail letter");
check("beds preserved (4)", c.beds === 4, `${c.beds}`);
check("sqft preserved (2600)", c.sqft === 2600, `${c.sqft}`);
check("yearBuilt preserved", c.yearBuilt === 1994, `${c.yearBuilt}`);
check("probate preserved", c.probateCaseNo === "2026PR9");
const noteCountAfter = db.select().from(notesLog).where(eq(notesLog.leadId, a.id)).all().length;
check("re-sync does NOT spam the log", noteCountAfter === noteCountBefore, `${noteCountBefore}->${noteCountAfter}`);

// cleanup
db.delete(leads).where(eq(leads.parcelId, P)).run();
console.log(fails === 0 ? "\n✅ SYNC UPSERT PRESERVES USER WORK\n" : `\n❌ ${fails} FAILED\n`);
process.exit(fails === 0 ? 0 : 1);
