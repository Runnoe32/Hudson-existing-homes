# CLAUDE.md — Hudson Existing Homes

Project context and working rules for Claude / agents. Read this first.

## What this is

A **private, local-only** lead tracker for **off-market acquisition of an existing family home in the Hudson School District** — direct-mail outreach to owners who are statistically likely to sell but haven't listed (probate, obituary, absentee, expired-listing, long-tenure signals). Companion to the **Hudson Land** project (`c:\Users\ajrun\hudsonland`, buildable land) and the **Hudson Home Build** app (`c:\Users\ajrun\hudson-home-build`). Same discipline (parcel-level research, county records, scoring), different target: existing homes.

**Full spec:** `hudson-existing-homes-project.md` — currently lives in the user's **Downloads** folder (not committed to this repo). It defines the objective (§1), ethics ground-rules (§2), lead sources (§3), the fit/motivation scoring rubric (§4), outreach cadence (§5), letter templates (§6), the DB schema (§7), the 5 build phases (§8), and WI legal notes (§9). If you need the spec and it's not in the repo, ask the user to point you at it.

## ✅ CURRENT STATE & HOW TO RESUME (updated 2026-07-13) — read this first

**Phase 1 CRM + a live DYNAMIC county pull are BUILT, verified, committed.** Data ingest is now **automatic from the WI Statewide Parcel layer** (same source as Hudson Land, pointed at improved parcels) — CSV import is kept only as a fallback. The DB holds **2,436 REAL leads** (2,193 home-fit + 243 acreage/split). **No fake/demo/sample data** — the user asked (2026-07-13) that only accurate county data live in the tracker; the seed + sample-CSV tooling was DELETED. Phases 3–5 not started; Phase 2's district-gate + auto-scoring is partially done (SD gate via SCHOOLDIST filter + preliminary auto Fit/Motivation).

### Dynamic county sync (the primary ingest)
- **Source:** WI Statewide Parcel Map ArcGIS layer (`services3.arcgis.com/n6uYoouQZW75n5WI/.../Wisconsin_Statewide_Parcels/FeatureServer/0`) — open, no scraping. `src/lib/parcels.ts` builds the query + paginates; `src/db/sync.ts` upserts.
- **Scope (HOMES_WHERE):** `SCHOOLDIST='HUDSON SCHOOL DISTRICT' AND IMPVALUE>0 AND ((PROPCLASS LIKE '%1%' AND GISACRES 0.75–5 AND CNTASSDVALUE 380k–560k) OR GISACRES>=10)`. Home-fit band + all improved ≥10 ac (split-parcel plays).
- **Run:** `pnpm sync` (CLI, ~70s) or the **⟳ Sync from county** button on the Leads page (server action `syncFromCounty`). **Upsert on parcel_id: refreshes county fields, NEVER clobbers user research** (scores, status, notes, probate, beds/sqft — verified by `scripts/verify_sync.ts`). New rows get preliminary auto Fit (acreage + assessed-value band) + auto Motivation (absentee/no-LGC/tenure); manual edits win after.
- **Land match:** the 243 ≥10 ac parcels get land enrichment (arsenic/nitrate/septic/slope/TCE/wetland) attached from the Hudson Land tool's `hudson_improved_enriched.geojson` (path in `sync.ts`, overridable via `LAND_ENRICHED_PATH`) into the `landData` JSON column; summarized by `src/lib/land.ts` and shown on the detail page + as a red flag in the list.
- **KNOWN GAP:** beds / finished-sqft / year-built are **not** in the free parcel layer (they're in scrape-restricted assessor detail). They auto-pull blank → fill per-finalist. Motivation signals (probate/obit/tenure/lottery/TOD) stay manual (WCCA no-scrape). This is inherent to the data, not a TODO.

**Prefer PRODUCTION mode for daily use of this data-heavy app:** `pnpm build && pnpm start` (fast, robust). `pnpm dev` works in a browser but its render worker can crash on Windows if a request is cut off mid-compile (the app is fine — it's a Next-dev fragility with 2,400-row pages).

**This is deliberately LOCAL-ONLY — no auth, no deploy, no cloud.** The SQLite DB (`data/leads.db`) holds other people's names and mailing addresses (PII); per spec §8 it stays on the box. It's gitignored. **Do not add auth-less deploy or push the DB.** (This is the opposite choice from the land tool, which was moved to Vercel behind Basic Auth — here we keep it off the internet entirely.)

**Run it** (repo root; first `export PATH="/c/Program Files/nodejs:/c/Users/ajrun/AppData/Roaming/npm:$PATH"`):
```bash
pnpm install            # once; native better-sqlite3 build is pre-approved in pnpm-workspace.yaml
pnpm db:migrate         # create data/leads.db from schema (idempotent)
pnpm sync               # PRIMARY: pull ~2,400 existing-home parcels from the county layer (~70s, network)
pnpm build && pnpm start  # http://localhost:3000  (recommended for daily use — fast + robust)
# pnpm dev              # alt: hot-reload dev server (fine in a browser; see dev-fragility note above)
```

**The app** (`src/app/`, Next 15 App Router + React 19, plain CSS, no Tailwind):
- **Leads** (`/`) — all leads sorted by **total score** (fit + motivation), status badges, fit/motivation split, signal flags (absentee / no-lottery-credit / 25yr+ tenure / probate), inline status dropdown.
- **Pipeline** (`/board`) — kanban, one column per status.
- **Today** (`/today`) — `next_action_date <= today` (excludes closed/dead), most-overdue first.
- **Lead detail** (`/leads/[id]`) — inline-edit every §7 field (saves on blur/change; `total` recomputes live), + a timestamped **activity log**; status changes auto-append log entries.
- **New lead** (`/new`) — quick create; `parcel_id` required + unique.
- **Import CSV** (`/import`) — upload a county export, **map columns** (auto-guessed from headers, override any / ignore), import with **dedupe on `parcel_id`** (existing parcels skipped, never overwritten).

**Scoring:** manual in Phase 1 (auto-scoring per §4 is Phase 2). `total = fit + motivation`, each **clamped 0–10** on write. §4 tiers: ≥12 → letter, 9–11 → watchlist.

**Architecture note:** all DB mutations live in framework-free modules — CRM edits in **`src/db/service.ts`**, county upsert in **`src/db/sync.ts`** (plain functions); the server actions in `src/app/actions.ts` are thin wrappers that call these then `revalidatePath`/`redirect`. This keeps the logic testable outside a Next request — `scripts/verify_sync.ts` imports the upsert directly and asserts county fields refresh while user research is preserved. **When adding write logic, put it in the service/sync module, not the action.**

**Verification:** `pnpm exec tsx scripts/verify_sync.ts` asserts the county upsert refreshes county fields while preserving user research (scores/status/notes/probate/beds/sqft) + auto-scores new rows. `pnpm typecheck` and `pnpm build` are clean; all routes render 200 in production. (The original §8 CSV-acceptance was verified 2026-07-12 before the dynamic pull superseded CSV import; that test + the seed/sample tooling were removed 2026-07-13 to keep fake data out.)

**Suggested NEXT (Phase 2):** district gate + scoring engine — load Hudson SD boundary GeoJSON (WI DPI shapefile → GeoJSON), point-in-polygon flag on `in_hudson_sd` (never trust mailing city — "Hudson, WI 54016" extends into St. Croix Central / River Falls districts), then auto-compute fit/motivation from the §4 rubric with manual override. The land project already solved Hudson SD identification via the state parcel layer's `SCHOOLDIST` field — reuse that approach or the boundary polygon. Then Phase 3 (letter-merge PDFs from §6 templates), Phase 4 (weekly WCCA/obit intake), Phase 5 (comp helper).

## The §7 schema (implemented as the `leads` table)
`src/db/schema.ts`. One row per parcel/lead. Key fields: `parcelId` (unique — dedupe key), `address`/`municipality`, `inHudsonSd` (bool), `ownerName`/`mailingAddress`, `acreage`(real)/`yearBuilt`/`sqft`/`beds`, `assessedValue`/`estMarket`, `lotteryCredit` (bool), `tenureYears`, `source` (probate|obit|absentee|drive-by|expired-listing), `probateCaseNo`/`prName`/`prAttorney`, `fitScore`/`motivationScore`/`total`, `status`, `letter1Date`/`letter2Date`/`responseDate`, `notes`/`nextAction`/`nextActionDate`, `createdAt`/`updatedAt`. Date-only fields are **ISO `YYYY-MM-DD` text** (lexical == chronological, used by the Today queue); row timestamps are unix-epoch integers. Second table `notes_log` (id, leadId FK cascade, body, kind: note|status|system, createdAt) = the timestamped activity log.

**Statuses** (pipeline order, drives the board): `watchlist → queued → letter1_sent → letter2_sent → responded → negotiating → closed → dead`. Moving to letter1_sent / letter2_sent / responded auto-stamps the matching date column (if empty) and appends a status log entry (see `STATUS_DATE_FIELD` in `src/lib/constants.ts`).

## Repo map
```
src/
  db/        schema.ts · index.ts (better-sqlite3+drizzle client) · queries.ts (reads + getLeadsFiltered)
             · service.ts (CRM writes — framework-free) · sync.ts (county upsert: syncHomes/upsertParcels)
  lib/       constants.ts · scoring.ts (clamp/total/tier) · autoscore.ts (auto Fit/Motivation) · parcels.ts (ArcGIS fetch/map + absentee)
             · land.ts (land-enrichment summary) · coerce.ts · csv.ts (header→field mapping) · util.ts
  app/       page.tsx (leads+filters+sync) · board/ · today/ · new/ · import/ · leads/[id]/ (detail+county/land panel)
             · actions.ts (server actions incl. syncFromCounty) · layout.tsx · globals.css
  components/ Nav · badges · StatusSelect · InlineField · NoteComposer · NewLeadForm · ImportClient
             · DeleteButton · SyncButton · LeadFilters
scripts/     migrate · reset · sync · verify_sync   (run via tsx)
drizzle/     generated migration SQL + meta (0000 base, 0001 sync columns)
data/        leads.db (GITIGNORED — real PII; no sample/fixture files)
```

## Stack / conventions
- **Next.js 15 App Router + React 19**, TypeScript, **plain CSS** (`globals.css` — no Tailwind, matches the land app). Path alias `@/*` → `src/*` (Next only; scripts use relative imports so `tsx` can run them without alias resolution — keep the `src/db/service.ts` → `queries.ts` → `lib/*` chain alias-free).
- **Drizzle ORM + better-sqlite3** (synchronous). `db.transaction(fn)` **runs immediately and returns fn's result** (not a callable — unlike raw better-sqlite3). Native build is approved in `pnpm-workspace.yaml` (`allowBuilds:` map, pnpm 11 format: `better-sqlite3: true`).
- Mutations = server actions wrapping `service.ts`. Reads = server components calling `queries.ts`. `export const dynamic = "force-dynamic"` on data pages (no stale caching of the local DB).
- `pnpm` scripts: `dev`/`build`/`start`/`typecheck`/`db:generate`/`db:migrate`/`db:reset`/`sync`.

## Environment / gotchas
- Windows; **must `export PATH="/c/Program Files/nodejs:/c/Users/ajrun/AppData/Roaming/npm:$PATH"`** before pnpm/node in the Bash tool. Bash tool = Git Bash; cwd resets after each call — `cd` first.
- Claude's Bash/PowerShell tools are **network-sandboxed** — pass `dangerouslyDisableSandbox: true` for `pnpm install` / any fetch.
- **Windows locks open DB files:** stop the dev server (kill the PID on port 3000) before `pnpm db:reset`, or the `fs.rmSync` fails.
- WAL mode is on; the sync/reset scripts open their own connection.

## Ground rules (from spec §2 — respect these when building outreach features later)
Owner-occupant fair-value framing; **never reference age/health/widowhood/grief**; **60-day buffer on estates**; no pressure mechanics (one letter + one follow-up, then stop); phone/text only if THEY provide a number (TCPA); if a seller seems confused, stop and require independent counsel (WI §46.90 elder-exploitation). **WCCA (wcca.wicourts.gov) prohibits scraping — manual weekly review only.** Any outreach mechanics get attorney review before shipping.
