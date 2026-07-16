# Owner / motivation-research workflow

How we enrich existing-home leads with **motivation signals** so the most
likely-to-sell owners float to the top. This is the homes analog of the Hudson
Land tool's skip-trace pipeline (`hudsonland/docs/skiptrace-workflow.md`).

Two feeds converge into one merge:
1. **Open-web agent research** — subagents research each owner (deceased/estate,
   entity/trust principals, tenure, reachability, relocation/snowbird/landlord
   context).
2. **WCCA court exports** — the USER manually exports probate / divorce /
   foreclosure / guardianship case lists (WCCA prohibits scraping) and we
   name-match them to leads.

Both write findings into `data/research_inbox.json`; `pnpm merge-research` folds
them into the store, raising `motivationScore` (never lowering a hand-set score)
and tagging `source`. Everything under `data/` is gitignored (PII).

## A. Open-web agent research

1. **Pick the next batch.** `N` counts **owner GROUPS**, not parcels — one owner
   can hold many parcels (Sweetgrass Properties LLC holds 32 near-identical Town
   of Hudson twin-homes), and researching that owner once answers all of them, so
   each slot is an owner and the batch carries the group's other parcels for
   context. Auto-excludes any owner already in `research_inbox.json` **and any
   deprioritized owner** (active-rental portfolio / institutional — see below).
   ```
   pnpm research-next 12 --type=home-fit          # 12 owner groups, home-fit
   pnpm research-next 18 --minval=400000 --maxval=500000   # focus value band
   pnpm research-next 18 --strict                 # HARD-restrict to the band
   ```
   Ranks by targeting priority = absentee (+2) · out-of-state (+2) · entity/trust
   (+2) · **assessed value in the focus band [default $400–500k] (+3)** ·
   acreage-split (+1) · 0.4×current score · portfolio-size bonus (+1 if ≥3
   parcels, +2 if ≥10). The band floats in-band owners to the top by default;
   `--strict` filters the pool to the band. Writes `data/research_next.json` (each
   entry carries `groupParcels`, `parcelCount`, and a `relatedOwnersAtMailing`
   hint for LLCs sharing a mailing address).

2. **Spawn general-purpose subagents on model `sonnet`**, ~6 owners each, with the
   prompt template below. They return a strict JSON array — no files.

3. **Drop the useful hits** into `data/research_inbox.json` as a map keyed by
   parcelId (see shape below). Faithfully record what the agent found; keep
   confidence + sources.

4. **Merge:** `pnpm merge-research` → writes Redis (prod) + `data/leads.json`.
   A finding keyed to one parcel **fans out to every parcel that owner holds**
   (exact normalized-name match) — an estate flags all their homes, a builder's
   verdict covers all their inventory. Set `"applyToOwnerGroup": false` on an
   inbox entry to keep it parcel-only.

### Owner deprioritization (declutter)
`src/lib/priority.ts` classifies each owner as `institutional` (gov / church /
HOA / utility / healthcare — e.g. Burkwood Treatment Center), `rental-portfolio`
(a researched landlord/investor, a `…RENTALS` name, or an entity holding ≥3
parcels — e.g. the 32-parcel Sweetgrass twin-home operation), `developer` (a
builder/inventory holder — a *plausible* seller, NOT sunk), or none. Institutional
and rental-portfolio owners **sink to the bottom of the default sort**, render
faint on the map, carry a category badge, and are **excluded from research
selection**. Toggle "Hide rentals/institutional" in the app to drop them entirely.
Classification is computed at read time — nothing is persisted, so re-running
research or a county sync recomputes it automatically.

### Single-family only (twin-home / townhome exclusion)
The free parcel layer has **no building-type field** (single-family vs twin/
townhome/condo lives in the scrape-restricted assessor detail, same gap as
beds/sqft), so this is **best-effort**. `multiUnitParcels()` flags a parcel as
likely multi-unit when: the situs has a `UNIT`/`APT`/`#` designator, the owner
name says twin-home/townhome/condo/villa/duplex, or one owner holds ≥2 homes on
the same street (a twin-home development's signature — e.g. Stout's 14 on Wilfred
/ 10 on Fraser). Requiring ≥~0.75 ac already excludes typical condo/townhome
units (they own a unit, not acreage), so the home-fit pool is overwhelmingly
detached SFH already. App: "Single-family only" filter (param `sfh=1`);
selection: `pnpm research-next … --sfh`. For an individually-owned twin/townhome
with none of these signals, confirm per-finalist via the agent's `property_type`
(read off a Redfin/Zillow listing).

### Subagent prompt template (open web only)
> You are researching property owners for a PRIVATE, fair-value, non-pressure
> off-market home-purchase effort in the Hudson, WI area (St. Croix County). Use
> OPEN WEB / PUBLIC RECORDS only. Return a strict JSON array; write no files.
> [list 6 owners: parcelId, owner name, WI situs address+town, mailing address]
> Find per owner (null when not found): deceased(+source, ONLY from a published
> obituary — if found, STOP; don't profile/skip-trace/contact heirs);
> entity_principal (WI DFI wdfi.org for LLC/LP; trustees for a trust);
> est_purchase_year; phone/email (matched to THIS person, with source);
> reachability_confidence high|med|low; owner_context (snowbird/landlord/
> relocated/local-business/farmer/developer); likely_motivation
> estate|landlord|relocated|snowbird|long-tenure|investor|developer-inventory|none-found;
> **property_type** (single-family | twin-home | townhome | condo | duplex |
> multi-family — read it off a Redfin/Zillow/realtor listing, which labels it;
> we only want single-family); sources[]; notes.
> HARD RULES: public sources only, never fabricate; confirm identity by NAME +
> location (WI town/St. Croix OR the owner's known out-of-state city); a same-name
> person elsewhere is NOT a match (→ confidence low). **Do NOT research, infer, or
> report anyone's AGE, HEALTH, or family/medical status** — deceased-from-obituary
> is the only exception (it routes to the probate channel). Output ONLY the JSON.

### `research_inbox.json` entry shape
```json
"<parcelId>": {
  "parcelId": "...", "deceased": true|false|null, "deceased_source": "...|null",
  "entity_principal": "...|null", "est_purchase_year": 2012|null,
  "phone": "...|null", "email": "...|null",
  "reachability_confidence": "high|med|low",
  "owner_context": "...", "likely_motivation": "estate|landlord|relocated|snowbird|long-tenure|investor|divorce|foreclosure|guardianship|none-found",
  "wcca_case": "...|omit", "sources": ["..."], "notes": "..."
}
```

## B. WCCA court exports (user-run; the manual-review channel)

WCCA (wcca.wicourts.gov → Advanced Search) forbids automated scraping, so the
**user** runs the searches by hand and exports result lists. Filter **County =
St. Croix** (all Hudson-SD parcels are in St. Croix). Pull, by case class:

| Class | Signal | Window |
|---|---|---|
| Probate / Estate (informal & formal admin, transfer-by-affidavit) | deceased owner → heirs sell; gives PR + attorney | filed last 3 yr |
| Family / Divorce (FA) | divorce forces/motivates a sale | last 3 yr |
| Foreclosure (CV mortgage foreclosure) | financial distress | last 2 yr |
| Guardianship/Conservatorship (GN) *(optional)* | precedes an estate/sale | last 2 yr |

Capture per case: **case number, case type, filing date, all party names, party
address if shown, PR/attorney, status.**

Match it: `pnpm match-wcca data/wcca_probate.csv --type=probate` (also
`--type=divorce|foreclosure|guardianship`). It name-matches parties → leads and
writes reviewable `data/wcca_matches.json`. **Review**, drop good matches into
`data/research_inbox.json`, then `pnpm merge-research`.

## Scoring (how signals float a lead)
`total = fitScore + motivationScore`, each clamped 0–10. `merge-research` sets
`motivationScore = max(prior, autoMotivation + researchBoost)`:
- deceased/estate **+5** · divorce/foreclosure **+4** · guardianship **+3**
- long-tenure (or acquired ≥20 yr ago) **+2** · snowbird/relocated/landlord/investor **+1**

§4 tiers: **≥12 → letter**, 9–11 → watchlist. Estates route to the estate/probate
**mail** channel (`docs/`), never a cold call to heirs.

## Ethics (spec §2 — non-negotiable)
Fair-value framing; **never reference age/health/widowhood/grief**; 60-day buffer
on estates; one letter + one follow-up then stop; phone/text only if THEY give a
number (TCPA); WCCA = manual review only; outreach mechanics get attorney review
before shipping.
