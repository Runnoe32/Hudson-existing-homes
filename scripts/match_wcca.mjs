/**
 * Match a Wisconsin Circuit Court Access (WCCA) case export against our owner
 * names, so probate / divorce / foreclosure / guardianship cases float the right
 * leads up. WCCA prohibits SCRAPING — this consumes an export the USER produced
 * by hand (manual review is allowed). Nothing here touches WCCA.
 *
 * Input CSV (headers auto-detected, order-independent). It looks for:
 *   - a party-name column   (header matching /name|party|defendant|respondent|decedent|petitioner/i)
 *   - case no / filing date / case type / status (best-effort)
 * If it can't find a name column it uses the first column.
 *
 * Run:  node scripts/match_wcca.mjs <export.csv> --type=probate|divorce|foreclosure|guardianship
 *   e.g. node scripts/match_wcca.mjs data/wcca_probate.csv --type=probate
 *
 * Output: data/wcca_matches.json — reviewable {parcelId: {...}} keyed entries in
 * the same shape merge_research.ts consumes (likely_motivation = estate/divorce/
 * foreclosure/guardianship, plus wcca_case). REVIEW before merging: fold the good
 * ones into data/research_inbox.json, then `pnpm merge-research`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import Papa from "papaparse";

const csvPath = process.argv[2] || "data/wcca_export.csv";
const typeArg = (process.argv.find((a) => a.startsWith("--type=")) || "").split("=")[1] || "probate";
const MOTIVATION = {
  probate: "estate",
  divorce: "divorce",
  foreclosure: "foreclosure",
  guardianship: "guardianship",
}[typeArg] || "estate";

const LEADS = "./data/leads.json";
const OUT = "./data/wcca_matches.json";

const STOP = /\b(REV|REVOCABLE|LIVING|FAMILY|JOINT|TRUST|TRUSTEE|AGREEMENT|LLC|LLP|LP|INC|CORP|EST|ESTATE|OF|THE|ET|AL|JR|SR|II|III)\b/g;

// Normalize a person name to {surname, first} guesses, handling "LAST, FIRST" and
// "FIRST MIDDLE LAST". Returns [] for pure entity names (no person to match).
function nameKeys(raw) {
  if (!raw) return [];
  let s = String(raw).toUpperCase().replace(/[^A-Z,\s/]/g, " ");
  const out = [];
  for (const part of s.split("/")) {
    let p = part.replace(STOP, " ").replace(/\s+/g, " ").trim();
    if (!p) continue;
    if (p.includes(",")) {
      const [last, rest] = p.split(",").map((x) => x.trim());
      const first = (rest || "").split(" ")[0];
      if (last) out.push({ surname: last.split(" ")[0], first });
    } else {
      const toks = p.split(" ").filter(Boolean);
      if (toks.length >= 2) out.push({ surname: toks[toks.length - 1], first: toks[0] });
    }
  }
  return out.filter((k) => k.surname && k.surname.length >= 3);
}

// Build a surname → [{parcelId, first, owner}] index from the leads.
const leads = Object.values(JSON.parse(readFileSync(LEADS, "utf8")));
const bySurname = new Map();
for (const l of leads) {
  for (const k of nameKeys(l.ownerName)) {
    if (!bySurname.has(k.surname)) bySurname.set(k.surname, []);
    bySurname.get(k.surname).push({ parcelId: l.parcelId, first: k.first, owner: l.ownerName, municipality: l.municipality });
  }
}

// Parse the export.
const csv = Papa.parse(readFileSync(csvPath, "utf8"), { header: true, skipEmptyLines: true });
const headers = csv.meta.fields || [];
const pick = (re) => headers.find((h) => re.test(h));
const nameCol = pick(/name|party|defendant|respondent|decedent|petitioner/i) || headers[0];
const caseCol = pick(/case\s*(no|number|#)/i);
const dateCol = pick(/fil|date/i);
const statusCol = pick(/status/i);

const matches = {};
let rows = 0;
let hit = 0;
for (const row of csv.data) {
  rows++;
  const partyName = row[nameCol];
  const caseNo = caseCol ? row[caseCol] : null;
  const filed = dateCol ? row[dateCol] : null;
  const status = statusCol ? row[statusCol] : null;
  for (const k of nameKeys(partyName)) {
    const cands = bySurname.get(k.surname) || [];
    for (const c of cands) {
      const firstMatch = k.first && c.first && k.first[0] === c.first[0];
      const fullFirst = k.first && c.first && k.first === c.first;
      const confidence = fullFirst ? "high" : firstMatch ? "med" : "low";
      if (confidence === "low") continue; // surname-only is too noisy in WI
      // Keep the strongest match per parcel.
      const prev = matches[c.parcelId];
      if (prev && prev._conf === "high" && confidence !== "high") continue;
      matches[c.parcelId] = {
        parcelId: c.parcelId,
        likely_motivation: MOTIVATION,
        wcca_case: [typeArg.toUpperCase(), caseNo, filed, status].filter(Boolean).join(" · "),
        notes: `WCCA ${typeArg} match: "${partyName}" → owner "${c.owner}" (${confidence})`,
        deceased: typeArg === "probate" ? true : undefined,
        sources: ["WCCA export (manual, user-provided)"],
        _conf: confidence,
      };
      hit++;
    }
  }
}

writeFileSync(OUT, JSON.stringify(matches, null, 2));
const n = Object.keys(matches).length;
console.log(`✔ ${csvPath}: ${rows} case rows → ${n} parcel matches (${hit} raw hits) → ${OUT}`);
console.log(`  type=${typeArg} → likely_motivation="${MOTIVATION}"; name col="${nameCol}", case col="${caseCol ?? "—"}"`);
console.log(`  REVIEW ${OUT}, drop good ones into data/research_inbox.json, then: pnpm merge-research`);
for (const m of Object.values(matches)) console.log(`  [${m._conf}] ${m.notes}`);
