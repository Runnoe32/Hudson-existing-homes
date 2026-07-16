/**
 * Select the next N OWNERS to research for MOTIVATION signals via open-web
 * research (the homes analog of the land tool's next_targets.mjs skip-trace
 * selector).
 *
 * N counts OWNER GROUPS, not parcels. One owner can hold many parcels (Sweetgrass
 * Properties LLC holds ~20 near-identical Town of Hudson homes), and researching
 * that owner once answers all of them — so each batch slot is an owner, and the
 * batch carries the group's other parcels along for context.
 *
 * Ranks by targeting priority (absentee / out-of-state / entity-or-trust / current
 * score / portfolio size), EXCLUDES any owner already researched (i.e. ANY of
 * their parcels is present in data/research_inbox.json), and writes a compact
 * batch → data/research_next.json.
 *
 * Run:  pnpm research-next [N=12] [--type=home-fit|acreage-split|all]
 *
 * Feed each batch of ~6 owners to a general-purpose subagent on model `sonnet`
 * using the prompt in docs/research-workflow.md; drop useful hits into
 * data/research_inbox.json keyed by the group's representative parcelId; then
 * `pnpm merge-research` (which fans the finding out across the owner's parcels).
 */
import fs from "node:fs";
import { loadEnvLocal } from "./loadenv";
import { getAllMap } from "../src/db/store";
import { groupByOwner, isEntity, isOutOfState, mailingKey, ownerKey } from "../src/lib/owner";
import { classifyOwner, isDeprioritized, portfolioSizes } from "../src/lib/priority";
import type { Lead } from "../src/lib/types";

loadEnvLocal();

const N = parseInt(process.argv[2] || "12", 10);
const argVal = (name: string) =>
  (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1] || "";
const typeArg = argVal("type") || "all";
// Focus value band (user priority): default to the $450–600k tier, overridable
// via --minval / --maxval (0 disables a bound). In-band owners get a boost; pass
// --strict to hard-filter to the band instead of just floating it up.
const MINVAL = argVal("minval") !== "" ? Number(argVal("minval")) : 450_000;
const MAXVAL = argVal("maxval") !== "" ? Number(argVal("maxval")) : 600_000;
const MINAC = argVal("minac") !== "" ? Number(argVal("minac")) : 0; // min acreage (0 = off)
const STRICT = process.argv.includes("--strict");

const INBOX = "./data/research_inbox.json";
const OUT = "./data/research_next.json";

const inBand = (v: number | null | undefined) =>
  (MINVAL <= 0 || (v ?? 0) >= MINVAL) && (MAXVAL <= 0 || (v ?? Infinity) <= MAXVAL);

/** Per-parcel targeting priority. */
function targetScore(l: Lead): number {
  let s = 0;
  if (l.absentee) s += 2;
  if (isOutOfState(l.mailingAddress)) s += 2; // stacks with absentee → out-of-state = 4
  if (isEntity(l.ownerName)) s += 2;
  if (inBand(l.assessedValue)) s += 3; // focus tier ($400–500k) floats to the top
  if (l.parcelType === "acreage-split") s += 1;
  s += (Number(l.total) || 0) * 0.4; // tie-break toward higher current fit/motivation
  return s;
}

/**
 * Owner-group priority = best parcel in the group, plus a portfolio bonus: one
 * conversation with a multi-parcel owner can unlock many properties, so they're
 * worth researching before a single-parcel owner of equal score.
 */
function groupScore(members: Lead[]): number {
  const best = Math.max(...members.map(targetScore));
  const n = members.length;
  const portfolio = n >= 10 ? 2 : n >= 3 ? 1 : 0;
  return best + portfolio;
}

(async () => {
  const map = await getAllMap();
  const leads = Object.values(map);

  // An owner is "done" if ANY of their parcels has been researched.
  const researchedIds = fs.existsSync(INBOX)
    ? new Set(Object.keys(JSON.parse(fs.readFileSync(INBOX, "utf8"))))
    : new Set<string>();

  // Owner-category needs each owner's full portfolio size.
  const sizes = portfolioSizes(leads);
  const isDeprioritizedOwner = (rep: Lead) =>
    isDeprioritized(classifyOwner(rep, sizes.get(ownerKey(rep.ownerName)) ?? 1));

  let pool = leads;
  if (typeArg !== "all") pool = pool.filter((l) => l.parcelType === typeArg);
  if (MINAC > 0) pool = pool.filter((l) => (l.acreage ?? 0) >= MINAC);
  // --strict: hard-restrict the pool to the focus value band.
  if (STRICT) pool = pool.filter((l) => inBand(l.assessedValue));

  // Group across the FULL lead set (not the type-filtered pool) so an owner's
  // parcel count and portfolio value reflect everything they actually hold.
  const allGroups = groupByOwner(leads);
  const poolKeys = new Set(Array.from(groupByOwner(pool).keys()));

  // Mailing-address clusters: different LLC names at one address are usually the
  // same principal. Surfaced as a research hint, not merged automatically.
  const byMailing = new Map<string, Set<string>>();
  for (const l of leads) {
    const mk = mailingKey(l.mailingAddress);
    if (!mk) continue;
    if (!byMailing.has(mk)) byMailing.set(mk, new Set());
    byMailing.get(mk)!.add(l.ownerName ?? "");
  }

  let skippedDeprioritized = 0;
  const candidates = Array.from(allGroups.entries())
    .filter(([key]) => poolKeys.has(key))
    .filter(([, members]) => !members.some((m) => researchedIds.has(m.parcelId)))
    // Skip active-rental portfolios & institutional owners — low sell-probability,
    // not worth an agent's research budget (they're deprioritized in-app too).
    .filter(([, members]) => {
      const rep = [...members].sort((a, b) => targetScore(b) - targetScore(a))[0];
      if (isDeprioritizedOwner(rep)) {
        skippedDeprioritized++;
        return false;
      }
      return true;
    })
    .map(([key, members]) => {
      const ranked = [...members].sort((a, b) => targetScore(b) - targetScore(a));
      const rep = ranked[0]; // representative = highest-scoring parcel
      const related = Array.from(byMailing.get(mailingKey(rep.mailingAddress)) ?? [])
        .filter((n) => n && n !== rep.ownerName);
      return {
        key,
        parcelId: rep.parcelId,
        ownerName: rep.ownerName,
        situsAddress: rep.address,
        municipality: rep.municipality,
        mailingAddress: rep.mailingAddress,
        acreage: rep.acreage,
        assessedValue: rep.assessedValue,
        parcelType: rep.parcelType,
        absentee: rep.absentee,
        outOfState: isOutOfState(rep.mailingAddress),
        entity: isEntity(rep.ownerName),
        parcelCount: members.length,
        groupAssessedTotal: members.reduce((s, m) => s + (Number(m.assessedValue) || 0), 0),
        groupParcels: ranked.slice(0, 25).map((m) => ({
          parcelId: m.parcelId,
          address: m.address,
          municipality: m.municipality,
          acreage: m.acreage,
          assessedValue: m.assessedValue,
        })),
        relatedOwnersAtMailing: related,
        _target: Math.round(groupScore(members) * 10) / 10,
      };
    })
    .sort((a, b) => b._target - a._target);

  const batch = candidates.slice(0, N);
  fs.writeFileSync(OUT, JSON.stringify(batch, null, 2));

  const parcelsCovered = batch.reduce((s, b) => s + b.parcelCount, 0);
  const bandLabel =
    MINVAL <= 0 && MAXVAL <= 0
      ? "off"
      : `$${(MINVAL / 1000).toFixed(0)}k–${MAXVAL > 0 ? "$" + (MAXVAL / 1000).toFixed(0) + "k" : "∞"}`;
  const inBandCount = batch.filter((b) => inBand(b.assessedValue)).length;
  console.log(`✔ wrote ${batch.length} owner groups (${parcelsCovered} parcels) → ${OUT}`);
  console.log(
    `  pool: ${candidates.length} un-researched targetable owners of ${allGroups.size} total (${researchedIds.size} parcels researched, ${skippedDeprioritized} rental/institutional owners skipped)`,
  );
  console.log(
    `  value band: ${bandLabel}${STRICT ? " (strict)" : " (boost)"} · ${inBandCount}/${batch.length} of this batch in-band · min acres: ${MINAC || "off"} · type: ${typeArg}`,
  );
  for (const b of batch) {
    const tags = [
      b.outOfState ? "out-of-state" : b.absentee ? "absentee" : "",
      b.entity ? "entity/trust" : "",
      inBand(b.assessedValue) ? "in-band $" : "",
      b.parcelType,
      b.parcelCount > 1 ? `${b.parcelCount} parcels` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    console.log(`  [${b._target}] ${b.ownerName}  —  ${b.situsAddress}  (${tags})`);
    if (b.relatedOwnersAtMailing.length)
      console.log(`         ↳ same mailing as: ${b.relatedOwnersAtMailing.join(", ")}`);
  }
})().catch((e) => {
  console.error("✗ selection failed:", e.message);
  process.exit(1);
});
