/**
 * End-to-end acceptance check (exercises the REAL service code the UI calls):
 *   1. Import a 50-row CSV (column-mapped) → dedupe on parcel_id.
 *   2. Edit scores → total recomputes.
 *   3. Move a lead watchlist → letter1_sent → date stamped + logged.
 *
 * Run against a fresh DB:  pnpm db:reset && pnpm db:migrate && pnpm seed && pnpm sample-csv && tsx scripts/verify_acceptance.ts
 */
import Papa from "papaparse";
import fs from "node:fs";
import path from "node:path";
import { db } from "../src/db/index";
import { leads, notesLog } from "../src/db/schema";
import { eq, desc } from "drizzle-orm";
import { getLead, getLeadNotes } from "../src/db/queries";
import { importRows, updateLeadField, transitionStatus } from "../src/db/service";
import { guessMapping } from "../src/lib/csv";
import { todayISO } from "../src/lib/util";
import type { ImportableKey } from "../src/lib/constants";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`${cond ? "  ✔" : "  ✗ FAIL:"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ---- 1. IMPORT ----
console.log("\n[1] CSV import (50 rows, mapped columns, dedupe on parcel_id)");
const csvText = fs.readFileSync(
  path.join(process.cwd(), "data", "sample_county_export_50.csv"),
  "utf8",
);
const parsed = Papa.parse<Record<string, string>>(csvText, {
  header: true,
  skipEmptyLines: "greedy",
});
const headers = parsed.meta.fields ?? [];
const mapping = guessMapping(headers);
console.log("  auto-mapping:", JSON.stringify(mapping));

const mapped: Partial<Record<ImportableKey, string>>[] = (parsed.data as Record<string, string>[]).map(
  (r) => {
    const o: Partial<Record<ImportableKey, string>> = {};
    for (const [h, k] of Object.entries(mapping)) {
      if (!k) continue;
      const v = r[h];
      if (v != null && String(v).trim() !== "") o[k] = String(v).trim();
    }
    return o;
  },
);

const before = db.select().from(leads).all().length;
const r1 = importRows(mapped);
const afterFirst = db.select().from(leads).all().length;
check("parcelId auto-mapped", Object.values(mapping).includes("parcelId"));
check("50 rows parsed", mapped.length === 50, `${mapped.length}`);
check("50 inserted on first import", r1.inserted === 50, `inserted=${r1.inserted}, skipped=${r1.skipped}`);
check("row count grew by 50", afterFirst - before === 50, `${before}→${afterFirst}`);

// re-import same file → all skipped (dedupe)
const r2 = importRows(mapped);
const afterSecond = db.select().from(leads).all().length;
check("re-import skips all 50 (dedupe)", r2.inserted === 0 && r2.skipped === 50, `inserted=${r2.inserted}, skipped=${r2.skipped}`);
check("row count unchanged on re-import", afterSecond === afterFirst, `${afterFirst}→${afterSecond}`);

// spot-check a coerced import: money string "$465,000" → integer, absentee mail differs
const sample = db.select().from(leads).where(eq(leads.status, "watchlist")).all()
  .find((l) => l.assessedValue && l.assessedValue > 0);
check("assessed value coerced from \"$...\" to number", !!sample && Number.isInteger(sample!.assessedValue!), `${sample?.assessedValue}`);

// ---- 2. EDIT SCORES ----
console.log("\n[2] Edit scores → total = fit + motivation");
const target = db.select().from(leads).orderBy(desc(leads.id)).all()[0]; // a freshly imported lead
updateLeadField(target.id, "fitScore", "9");
updateLeadField(target.id, "motivationScore", "7");
const scored = getLead(target.id)!;
check("fit stored", scored.fitScore === 9, `${scored.fitScore}`);
check("motivation stored", scored.motivationScore === 7, `${scored.motivationScore}`);
check("total recomputed = 16", scored.total === 16, `${scored.total}`);
// clamp check: >10 clamps to 10
updateLeadField(target.id, "fitScore", "50");
const clamped = getLead(target.id)!;
check("fit clamps to 10", clamped.fitScore === 10, `${clamped.fitScore}`);
check("total after clamp = 17", clamped.total === 17, `${clamped.total}`);

// ---- 3. STATUS TRANSITION ----
console.log("\n[3] Move watchlist → letter1_sent (date stamped + logged)");
const wl = db.select().from(leads).where(eq(leads.parcelId, "018-1042-30-000")).get();
check("seed watchlist lead present", !!wl, wl?.ownerName ?? "MISSING");
if (wl) {
  check("starts as watchlist", wl.status === "watchlist");
  check("no letter1 date yet", wl.letter1Date == null);
  const notesBefore = getLeadNotes(wl.id).length;

  const res = transitionStatus(wl.id, "letter1_sent");
  const moved = getLead(wl.id)!;
  const today = todayISO();
  check("status is now letter1_sent", moved.status === "letter1_sent");
  check("letter1_date stamped to today", moved.letter1Date === today, `${moved.letter1Date} vs ${today}`);
  check("action reported the stamp", (res as { stamped?: string }).stamped === today);

  const notes = getLeadNotes(wl.id);
  check("a log entry was appended", notes.length === notesBefore + 1, `${notesBefore}→${notes.length}`);
  const top = notes[0];
  check(
    "log records the transition + date",
    top.kind === "status" && /Watchlist → Letter 1 sent — dated \d{4}-\d{2}-\d{2}/.test(top.body),
    top.body,
  );

  // idempotent: moving to the same status again does not re-stamp or duplicate
  const res2 = transitionStatus(wl.id, "letter1_sent");
  const notes2 = getLeadNotes(wl.id).length;
  check("re-setting same status is a no-op", (res2 as { stamped: string | null }).stamped === null && notes2 === notes.length);
}

console.log(
  failures === 0
    ? "\n✅ ALL ACCEPTANCE CHECKS PASSED\n"
    : `\n❌ ${failures} CHECK(S) FAILED\n`,
);
process.exit(failures === 0 ? 0 : 1);
