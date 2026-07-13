/**
 * Seed 8 realistic sample leads spread across every pipeline status.
 * Idempotent: removes any existing rows with these parcel ids first.
 *
 * Run: pnpm seed   (after pnpm db:migrate)
 */
import { inArray } from "drizzle-orm";
import { db } from "../src/db/index";
import { leads, notesLog, type NewLead } from "../src/db/schema";
import { computeTotal } from "../src/lib/scoring";

interface SeedLead extends Partial<NewLead> {
  parcelId: string;
  fitScore: number;
  motivationScore: number;
  log: { body: string; kind: "note" | "status" | "system"; daysAgo: number }[];
}

const d = (iso: string) => iso; // dates are ISO YYYY-MM-DD text
const ts = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);

const SEED: SeedLead[] = [
  {
    parcelId: "018-1042-30-000",
    address: "1187 Cty Rd A, Hudson, WI 54016",
    municipality: "Town of Hudson",
    inHudsonSd: true,
    ownerName: "Gerald & Marlene Voss",
    mailingAddress: "1187 Cty Rd A, Hudson, WI 54016",
    acreage: 2.4,
    yearBuilt: 1978,
    sqft: 2180,
    beds: 4,
    assessedValue: 418000,
    estMarket: 470000,
    lotteryCredit: true,
    tenureYears: 31,
    source: "obit",
    fitScore: 5,
    motivationScore: 5,
    status: "watchlist",
    notes: "Obit for a relative appeared; no probate filed yet. Hold on 60-day buffer.",
    nextAction: "Re-check WCCA for probate filing",
    nextActionDate: null,
    log: [
      { body: "Lead created from obituary cross-reference.", kind: "system", daysAgo: 9 },
      { body: "Within 60-day buffer — watchlist only, no contact.", kind: "note", daysAgo: 9 },
    ],
  },
  {
    parcelId: "020-1330-12-100",
    address: "742 190th St, Hudson, WI 54016",
    municipality: "Town of St. Joseph",
    inHudsonSd: true,
    ownerName: "Estate of Ruth A. Henning",
    mailingAddress: "c/o D. Henning, 305 Vine St, Stillwater, MN 55082",
    acreage: 3.1,
    yearBuilt: 1985,
    sqft: 2620,
    beds: 4,
    assessedValue: 452000,
    estMarket: 505000,
    lotteryCredit: false,
    tenureYears: 28,
    source: "probate",
    probateCaseNo: "2026PR000112",
    prName: "David Henning",
    prAttorney: "Rodli, Beskar & Neuhaus (River Falls)",
    fitScore: 7,
    motivationScore: 8,
    status: "queued",
    notes: "Strong fit. PR is son, lives in Stillwater. Estate letter (Letter A) drafted.",
    nextAction: "Print & mail Letter A to PR",
    nextActionDate: d(new Date().toISOString().slice(0, 10)), // due today
    log: [
      { body: "Matched probate filing 2026PR000112 to parcel via decedent name.", kind: "system", daysAgo: 6 },
      { body: "Status: Watchlist → Queued", kind: "status", daysAgo: 5 },
      { body: "Confirmed PR address from filing. Ready to mail.", kind: "note", daysAgo: 2 },
    ],
  },
  {
    parcelId: "246-2071-05-030",
    address: "515 Laurel Ave, Hudson, WI 54016",
    municipality: "City of Hudson",
    inHudsonSd: true,
    ownerName: "Thomas Beck",
    mailingAddress: "8804 Xylon Ct N, Brooklyn Park, MN 55445",
    acreage: 0.9,
    yearBuilt: 1969,
    sqft: 2050,
    beds: 3,
    assessedValue: 405000,
    estMarket: 455000,
    lotteryCredit: false,
    tenureYears: 22,
    source: "absentee",
    fitScore: 6,
    motivationScore: 7,
    status: "letter1_sent",
    letter1Date: d(ts(22).toISOString().slice(0, 10)),
    notes: "Absentee (MN mailing, no lottery credit). Likely a rental. Sent Letter C.",
    nextAction: "Send follow-up Letter 2 if no reply",
    nextActionDate: d(ts(-6).toISOString().slice(0, 10)), // 6 days from now
    log: [
      { body: "Imported from CSV.", kind: "system", daysAgo: 30 },
      { body: "Status: Watchlist → Letter 1 sent — dated " + ts(22).toISOString().slice(0, 10), kind: "status", daysAgo: 22 },
      { body: "Mailed Letter C (absentee). Hand-addressed, real stamp.", kind: "note", daysAgo: 22 },
    ],
  },
  {
    parcelId: "020-1188-44-007",
    address: "1290 Cty Rd F, Hudson, WI 54016",
    municipality: "Town of Troy",
    inHudsonSd: true,
    ownerName: "Karen Doyle",
    mailingAddress: "1290 Cty Rd F, Hudson, WI 54016",
    acreage: 4.7,
    yearBuilt: 1974,
    sqft: 2340,
    beds: 4,
    assessedValue: 438000,
    estMarket: 490000,
    lotteryCredit: true,
    tenureYears: 26,
    source: "expired-listing",
    fitScore: 6,
    motivationScore: 6,
    status: "letter2_sent",
    letter1Date: d(ts(53).toISOString().slice(0, 10)),
    letter2Date: d(ts(17).toISOString().slice(0, 10)),
    notes: "Expired MLS listing 8 months ago (was $549k). Sent both letters, no reply yet.",
    nextAction: "Close out if no response by August",
    nextActionDate: d(ts(-24).toISOString().slice(0, 10)),
    log: [
      { body: "Lead created from expired-listing scan.", kind: "system", daysAgo: 60 },
      { body: "Status: Queued → Letter 1 sent — dated " + ts(53).toISOString().slice(0, 10), kind: "status", daysAgo: 53 },
      { body: "Status: Letter 1 sent → Letter 2 sent — dated " + ts(17).toISOString().slice(0, 10), kind: "status", daysAgo: 17 },
    ],
  },
  {
    parcelId: "121-1005-88-012",
    address: "421 3rd St, North Hudson, WI 54016",
    municipality: "Village of North Hudson",
    inHudsonSd: true,
    ownerName: "Robert & Susan Lindquist",
    mailingAddress: "421 3rd St, North Hudson, WI 54016",
    acreage: 1.3,
    yearBuilt: 1990,
    sqft: 2760,
    beds: 5,
    assessedValue: 468000,
    estMarket: 515000,
    lotteryCredit: true,
    tenureYears: 24,
    source: "obit",
    fitScore: 7,
    motivationScore: 7,
    status: "responded",
    letter1Date: d(ts(41).toISOString().slice(0, 10)),
    responseDate: d(ts(12).toISOString().slice(0, 10)),
    notes: "Owner called back — curious, not committed. Wants to see our comps. Warm.",
    nextAction: "Email comps + offer to schedule a listening call",
    nextActionDate: d(ts(1).toISOString().slice(0, 10)), // yesterday → overdue
    log: [
      { body: "Imported from CSV.", kind: "system", daysAgo: 50 },
      { body: "Status: Watchlist → Letter 1 sent — dated " + ts(41).toISOString().slice(0, 10), kind: "status", daysAgo: 41 },
      { body: "Status: Letter 1 sent → Responded — dated " + ts(12).toISOString().slice(0, 10), kind: "status", daysAgo: 12 },
      { body: "Susan called. Not in a hurry but open. Asked for comps. Sounded warm, no pressure applied.", kind: "note", daysAgo: 12 },
    ],
  },
  {
    parcelId: "020-1450-19-055",
    address: "980 Cty Rd UU, Roberts, WI 54023",
    municipality: "Town of Warren",
    inHudsonSd: true,
    ownerName: "Estate of Walter Prahl",
    mailingAddress: "c/o M. Prahl-Reed, 12 Oakhill Dr, Woodbury, MN 55125",
    acreage: 9.8,
    yearBuilt: 1981,
    sqft: 2900,
    beds: 4,
    assessedValue: 472000,
    estMarket: 520000,
    lotteryCredit: false,
    tenureYears: 34,
    source: "probate",
    probateCaseNo: "2026PR000087",
    prName: "Margaret Prahl-Reed",
    prAttorney: "Bakke Norman, S.C. (New Richmond)",
    fitScore: 8,
    motivationScore: 8,
    status: "negotiating",
    letter1Date: d(ts(46).toISOString().slice(0, 10)),
    responseDate: d(ts(20).toISOString().slice(0, 10)),
    notes: "PR responsive. Discussed as-is purchase aligned to probate timeline. Verbal range agreed; awaiting letters of administration.",
    nextAction: "Review PR counteroffer with attorney",
    nextActionDate: d(new Date().toISOString().slice(0, 10)), // due today
    log: [
      { body: "Matched probate 2026PR000087 to parcel.", kind: "system", daysAgo: 55 },
      { body: "Status: Queued → Letter 1 sent — dated " + ts(46).toISOString().slice(0, 10), kind: "status", daysAgo: 46 },
      { body: "Status: Letter 1 sent → Responded — dated " + ts(20).toISOString().slice(0, 10), kind: "status", daysAgo: 20 },
      { body: "Status: Responded → Negotiating", kind: "status", daysAgo: 8 },
      { body: "PR open to as-is sale; closing to wait on letters of administration — our flexibility is the selling point. Shared comps ($/sqft basis).", kind: "note", daysAgo: 8 },
    ],
  },
  {
    parcelId: "022-1600-02-001",
    address: "633 Rustic Rd, Hudson, WI 54016",
    municipality: "Town of Kinnickinnic",
    inHudsonSd: true,
    ownerName: "The Anders Family Trust",
    mailingAddress: "633 Rustic Rd, Hudson, WI 54016",
    acreage: 5.5,
    yearBuilt: 1995,
    sqft: 3100,
    beds: 4,
    assessedValue: 461000,
    estMarket: 500000,
    lotteryCredit: true,
    tenureYears: 20,
    source: "drive-by",
    fitScore: 8,
    motivationScore: 7,
    status: "closed",
    letter1Date: d(ts(120).toISOString().slice(0, 10)),
    responseDate: d(ts(95).toISOString().slice(0, 10)),
    notes: "CLOSED — purchased at $498k, as-is, 75-day close. Great fit, walkout LL to finish later.",
    nextAction: null,
    nextActionDate: null,
    log: [
      { body: "Drive-by: dated but solid on 5.5ac. Added to tracker.", kind: "system", daysAgo: 140 },
      { body: "Status: Watchlist → Letter 1 sent — dated " + ts(120).toISOString().slice(0, 10), kind: "status", daysAgo: 120 },
      { body: "Status: Letter 1 sent → Responded — dated " + ts(95).toISOString().slice(0, 10), kind: "status", daysAgo: 95 },
      { body: "Status: Negotiating → Closed", kind: "status", daysAgo: 15 },
      { body: "Closed at $498k. Purchase agreement via our RE attorney; title co. handled escrow.", kind: "note", daysAgo: 15 },
    ],
  },
  {
    parcelId: "018-1077-51-300",
    address: "215 Birch Ln, Hudson, WI 54016",
    municipality: "Town of Hudson",
    inHudsonSd: true,
    ownerName: "James Whitcomb",
    mailingAddress: "215 Birch Ln, Hudson, WI 54016",
    acreage: 1.1,
    yearBuilt: 2001,
    sqft: 1980,
    beds: 3,
    assessedValue: 392000,
    estMarket: 430000,
    lotteryCredit: true,
    tenureYears: 12,
    source: "absentee",
    fitScore: 4,
    motivationScore: 5,
    status: "dead",
    letter1Date: d(ts(70).toISOString().slice(0, 10)),
    notes: "Owner replied: not selling, please remove. Marked dead — no further mailings.",
    nextAction: null,
    nextActionDate: null,
    log: [
      { body: "Imported from CSV.", kind: "system", daysAgo: 80 },
      { body: "Status: Watchlist → Letter 1 sent — dated " + ts(70).toISOString().slice(0, 10), kind: "status", daysAgo: 70 },
      { body: "Owner called, politely declined and asked to be removed. Honored — status Dead.", kind: "note", daysAgo: 64 },
      { body: "Status: Letter 1 sent → Dead", kind: "status", daysAgo: 64 },
    ],
  },
];

function run() {
  const ids = SEED.map((s) => s.parcelId);
  db.delete(leads).where(inArray(leads.parcelId, ids)).run(); // notes cascade

  for (const s of SEED) {
    const { log, fitScore, motivationScore, ...rest } = s;
    const values: NewLead = {
      ...(rest as NewLead),
      fitScore,
      motivationScore,
      total: computeTotal(fitScore, motivationScore),
    };
    const row = db.insert(leads).values(values).returning({ id: leads.id }).get();
    for (const entry of log) {
      db.insert(notesLog)
        .values({
          leadId: row.id,
          body: entry.body,
          kind: entry.kind,
          createdAt: ts(entry.daysAgo),
        })
        .run();
    }
  }
  const n = db.select().from(leads).all().length;
  console.log(`✔ seeded ${SEED.length} leads (db now has ${n} total)`);
}

run();
