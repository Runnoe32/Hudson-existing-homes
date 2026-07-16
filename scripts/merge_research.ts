/**
 * Merge owner/motivation research into the lead store (Redis in prod, local file
 * in dev — via src/db/store, so it reads/writes whatever the app uses and never
 * goes stale against cloud edits). The homes analog of the land tool's merge_crm.
 *
 * Input: data/research_inbox.json — either a map { "<parcelId>": {..findings} }
 * or an array of {parcelId, ..findings}. Findings shape (all optional):
 *   deceased, deceased_source, entity_principal, est_purchase_year, phone, email,
 *   reachability_confidence, owner_context, likely_motivation, sources, notes
 *
 * For each matched lead it:
 *  - stores the full findings blob in lead.research (JSON string) + researchedAt,
 *  - RAISES motivationScore by a research boost (never lowers a hand-set score),
 *  - recomputes total, tags source, and appends a timestamped log entry,
 *  - flags a deceased owner for the WCCA probate channel (does NOT chase heirs).
 * Manual notes are preserved; notes is only set when empty.
 *
 * OWNER-GROUP FAN-OUT: research is about an OWNER, not a parcel. A finding keyed
 * to one parcel is applied to every parcel that owner holds (exact normalized
 * name match) — an estate makes all their homes estate leads, and a builder's
 * verdict covers all their inventory. Set "applyToOwnerGroup": false on an entry
 * to keep it parcel-only.
 *
 * Run: pnpm merge-research
 */
import fs from "node:fs";
import { loadEnvLocal } from "./loadenv";
import { getAllMap, putMany } from "../src/db/store";
import { autoMotivation } from "../src/lib/autoscore";
import { clampScore, computeTotal } from "../src/lib/scoring";
import { groupByOwner, ownerKey } from "../src/lib/owner";
import type { Lead } from "../src/lib/types";

loadEnvLocal();

const INBOX = "./data/research_inbox.json";
const CUR_YEAR = new Date().getFullYear();

interface Findings {
  deceased?: boolean | null;
  deceased_source?: string | null;
  entity_principal?: string | null;
  est_purchase_year?: number | null;
  phone?: string | null;
  email?: string | null;
  reachability_confidence?: string | null;
  owner_context?: string | null;
  likely_motivation?: string | null;
  wcca_case?: string | null; // set by match_wcca.mjs (probate/divorce/foreclosure)
  sources?: unknown;
  notes?: string | null;
  applyToOwnerGroup?: boolean; // default true — set false to keep a finding parcel-only
}

/** Motivation points contributed by research findings (added on top of the auto
 *  signals). Deliberately conservative; deceased/estate dominates. */
function researchBoost(r: Findings): number {
  let b = 0;
  if (r.deceased === true) b += 5; // estate — strongest motivation
  switch (r.likely_motivation) {
    case "long-tenure":
      b += 2;
      break;
    case "snowbird":
    case "relocated":
    case "landlord":
    case "investor":
    case "developer-inventory": // a developer land-banking inventory is a plausible seller
      b += 1;
      break;
  }
  const yr = Number(r.est_purchase_year);
  if (Number.isFinite(yr) && yr > 1900 && CUR_YEAR - yr >= 20) b += 2; // long tenure
  return b;
}

function loadInbox(): Record<string, Findings> {
  const raw = JSON.parse(fs.readFileSync(INBOX, "utf8"));
  if (Array.isArray(raw)) {
    const out: Record<string, Findings> = {};
    for (const r of raw) if (r && r.parcelId) out[String(r.parcelId)] = r;
    return out;
  }
  return raw as Record<string, Findings>;
}

function summarize(r: Findings): string {
  const bits: string[] = [];
  if (r.deceased === true) bits.push("owner appears DECEASED (obituary) — verify in WCCA probate");
  if (r.likely_motivation && r.likely_motivation !== "none-found")
    bits.push(`motivation: ${r.likely_motivation}`);
  if (r.est_purchase_year) bits.push(`acquired ~${r.est_purchase_year}`);
  if (r.entity_principal) bits.push(`principal: ${r.entity_principal}`);
  if (r.phone) bits.push(`phone: ${r.phone} (${r.reachability_confidence ?? "?"})`);
  if (r.email) bits.push(`email: ${r.email}`);
  if (r.owner_context) bits.push(r.owner_context);
  return bits.join(" · ") || "researched — no strong signal found";
}

(async () => {
  const inbox = loadInbox();
  const ids = Object.keys(inbox);
  console.log(`loaded research for ${ids.length} parcels from ${INBOX}`);

  const map = await getAllMap();
  const now = new Date().toISOString();
  const groups = groupByOwner(Object.values(map));
  const toWrite: Lead[] = [];
  let matched = 0;
  let estates = 0;
  let fanned = 0; // extra owner-group parcels touched beyond the keyed one
  const missing: string[] = [];
  const processedGroups = new Set<string>();

  /** Apply one findings blob to one lead. Returns true if it flagged an estate. */
  function applyFindings(lead: Lead, r: Findings): boolean {
    lead.research = JSON.stringify({ ...r, researchedAt: now });

    // Raise motivation: auto baseline + research boost, never below a prior score.
    const base = autoMotivation({
      absentee: lead.absentee,
      lotteryCredit: lead.lotteryCredit,
      tenureYears: lead.tenureYears,
      source: lead.source,
    });
    const computed = clampScore(base + researchBoost(r));
    lead.motivationScore = Math.max(clampScore(lead.motivationScore), computed);
    lead.total = computeTotal(lead.fitScore, lead.motivationScore);

    let isEstate = false;
    if (r.deceased === true) {
      lead.source = "estate";
      isEstate = true;
    } else if (!lead.source || lead.source === "absentee") {
      lead.source =
        r.likely_motivation && r.likely_motivation !== "none-found"
          ? r.likely_motivation
          : lead.source;
    }

    if (!lead.notes) lead.notes = summarize(r);
    lead.log = lead.log ?? [];
    lead.log.push({ body: `Research: ${summarize(r)}`, kind: "system", createdAt: now });
    lead.updatedAt = now;
    return isEstate;
  }

  for (const id of ids) {
    const lead = map[id];
    if (!lead) {
      missing.push(id);
      continue;
    }
    const r = inbox[id];

    // Research is about an OWNER, so a finding fans out to every parcel that owner
    // holds — unless the finding opts out. A missing/blank owner name never groups.
    const key = ownerKey(lead.ownerName);
    const fanOut = r.applyToOwnerGroup !== false && key !== "";
    if (fanOut && processedGroups.has(key)) {
      // Another inbox entry already covered this owner group this run.
      continue;
    }
    const targets = fanOut ? groups.get(key) ?? [lead] : [lead];
    if (fanOut) processedGroups.add(key);

    for (const t of targets) {
      if (applyFindings(t, r)) estates++;
      toWrite.push(t);
      matched++;
    }
    fanned += targets.length - 1;
  }

  await putMany(toWrite);
  fs.writeFileSync("./data/leads.json", JSON.stringify(map, null, 2));

  console.log(
    `✔ merged ${matched} leads (${estates} flagged estate; ${fanned} via owner-group fan-out) → store + data/leads.json`,
  );
  if (missing.length) console.log(`  ⚠ ${missing.length} parcelIds not found: ${missing.join(", ")}`);
})().catch((e) => {
  console.error("✗ merge failed:", e.message);
  process.exit(1);
});
