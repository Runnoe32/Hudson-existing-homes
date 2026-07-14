# CLAUDE.md — Hudson Existing Homes

Project context and working rules for Claude / agents. Read this first.

## What this is

A **private, local-only** lead tracker for **off-market acquisition of an existing family home in the Hudson School District** — direct-mail outreach to owners who are statistically likely to sell but haven't listed (probate, obituary, absentee, expired-listing, long-tenure signals). Companion to the **Hudson Land** project (`c:\Users\ajrun\hudsonland`, buildable land) and the **Hudson Home Build** app (`c:\Users\ajrun\hudson-home-build`). Same discipline (parcel-level research, county records, scoring), different target: existing homes.

**Full spec:** `hudson-existing-homes-project.md` — currently lives in the user's **Downloads** folder (not committed to this repo). It defines the objective (§1), ethics ground-rules (§2), lead sources (§3), the fit/motivation scoring rubric (§4), outreach cadence (§5), letter templates (§6), the DB schema (§7), the 5 build phases (§8), and WI legal notes (§9). If you need the spec and it's not in the repo, ask the user to point you at it.

## ✅ CURRENT STATE & HOW TO RESUME (updated 2026-07-14) — read this first

**DEPLOYED & LIVE.** CRM + dynamic county pull + a **satellite map** are built, deployed, and password-gated at **https://hudson-existing-homes.vercel.app**. Data ingest is **automatic from the WI Statewide Parcel layer** (same source as Hudson Land, pointed at improved parcels); CSV import is a fallback. **2,436 REAL leads** (2,193 home-fit + 243 acreage/split) in Upstash Redis. **No fake/demo/sample data** (seed + sample tooling deleted per user 2026-07-13). Phases 3–5 not started; Phase 2's SD-gate + auto-scoring is partially done (SCHOOLDIST filter + preliminary auto Fit/Motivation).

### Dynamic county sync (the primary ingest)
- **Source:** WI Statewide Parcel Map ArcGIS layer (`services3.arcgis.com/n6uYoouQZW75n5WI/.../Wisconsin_Statewide_Parcels/FeatureServer/0`) — open, no scraping. `src/lib/parcels.ts` builds the query + paginates; `src/db/sync.ts` upserts.
- **Scope (HOMES_WHERE):** `SCHOOLDIST='HUDSON SCHOOL DISTRICT' AND IMPVALUE>0 AND ((PROPCLASS LIKE '%1%' AND GISACRES 0.75–5 AND CNTASSDVALUE 380k–560k) OR GISACRES>=10)`. Home-fit band + all improved ≥10 ac (split-parcel plays).
- **Run:** `pnpm sync` (CLI, ~70s) or the **⟳ Sync from county** button on the Leads page (server action `syncFromCounty`). **Upsert on parcel_id: refreshes county fields, NEVER clobbers user research** (scores, status, notes, probate, beds/sqft — verified by `scripts/verify_sync.ts`). New rows get preliminary auto Fit (acreage + assessed-value band) + auto Motivation (absentee/no-LGC/tenure); manual edits win after.
- **Land match:** the 243 ≥10 ac parcels get land enrichment (arsenic/nitrate/septic/slope/TCE/wetland) attached from the Hudson Land tool's `hudson_improved_enriched.geojson` (path in `sync.ts`, overridable via `LAND_ENRICHED_PATH`) into the `landData` JSON column; summarized by `src/lib/land.ts` and shown on the detail page + as a red flag in the list.
- **KNOWN GAP:** beds / finished-sqft / year-built are **not** in the free parcel layer (they're in scrape-restricted assessor detail). They auto-pull blank → fill per-finalist. Motivation signals (probate/obit/tenure/lottery/TOD) stay manual (WCCA no-scrape). This is inherent to the data, not a TODO.

**Prefer PRODUCTION mode for daily use of this data-heavy app:** `pnpm build && pnpm start` (fast, robust). `pnpm dev` works in a browser but its render worker can crash on Windows if a request is cut off mid-compile (the app is fine — it's a Next-dev fragility with 2,400-row pages).

### DEPLOYED (2026-07-13) — cloud, password-gated
**LIVE: https://hudson-existing-homes.vercel.app** — Basic Auth (user `hudson`, password = Vercel env `SITE_PASSWORD`, in the user's password manager; rotate via `vercel env`). Repo **`Runnoe32/Hudson-existing-homes`** (private) is git-connected to Vercel project `adams-projects-7593f3d7/hudson-existing-homes` → **`git push` on `master` auto-deploys**; manual = `vercel deploy --prod --yes`. Vercel CLI logged in as `ajrunnoe-6462`.

**Data layer = Upstash Redis in prod / local `data/leads.json` in dev** (`src/db/store.ts`) — the same Redis-or-file pattern as the land tool (SQLite can't run on Vercel). Reused the land tool's Upstash creds (`KV_REST_API_*`), namespaced to the **`hh_leads`** hash keyed by parcelId; notes embedded as `lead.log`. **No Drizzle / better-sqlite3.** The PII decision mirrors the land tool: cloud, behind app-level auth. `.env.local` holds KV creds only (auth OFF locally); `SITE_PASSWORD`/`SITE_USER` live in Vercel across all envs.

**⚠️ AUTH GOTCHA:** middleware MUST be at **`src/middleware.ts`** (this is a `src/`-dir project) — at the repo root Next silently ignores it and the PII site goes public. Verified 401 (no creds) / 200 (creds) after the fix.

**Run it** (repo root; first `export PATH="/c/Program Files/nodejs:/c/Users/ajrun/AppData/Roaming/npm:$PATH"`):
```bash
pnpm install
pnpm dev                # or: pnpm build && pnpm start  → http://localhost:3000 (auth OFF locally)
pnpm sync               # pull ~2,400 parcels from the county layer; writes Redis when KV creds set (~70s)
pnpm push-store         # push local data/leads.json → Redis (used to seed/refresh the cloud DB)
```

**The app** (`src/app/`, Next 15 App Router + React 19, plain CSS, no Tailwind):
- **Leads** (`/`) — **satellite map** (`src/components/LeadsExplorer.tsx`, Leaflet + Esri imagery, all filtered pins) above a score-sorted table. Map has a **Score↔Type colour toggle** (score = 5 buckets 0-2/3-5/6-8/9-11/12+ hotter=higher; type = green home-fit / magenta acreage-split) + legend. **Two-way link:** click a pin → scroll map into view + fly/zoom to it + info popup (does NOT navigate; "Open full lead" is an opt-in link); click a table row → same fly/zoom + highlight. Table shows top 250 by score, map shows all matches. Filters (type/absentee/status/score/search via `LeadFilters` → URL params) drive both. `SyncButton` (⟳ Sync from county) in the header.
- **Pipeline** (`/board`) — kanban, one column per status (capped 50/col).
- **Today** (`/today`) — `nextActionDate <= today` (excludes closed/dead), most-overdue first.
- **Lead detail** (`/leads/[parcelId]`) — county/land panel + inline-edit every field (saves on blur/change; `total` recomputes live) + timestamped **activity log** (`lead.log`); status changes auto-append log entries.
- **New lead** (`/new`) — quick create; parcelId required + unique. **Import CSV** (`/import`) — fallback; column-map + dedupe on parcelId.

**Scoring:** `total = fit + motivation`, each **clamped 0–10**. New synced rows get a *preliminary auto* Fit (acreage + assessed-value band, `src/lib/autoscore.ts`) + Motivation (absentee/no-LGC/tenure); **manual edits win and are preserved on re-sync.** Most current data is auto-scored ≤7 until you score leads up. §4 tiers: ≥12 letter, 9–11 watchlist.

**Architecture note:** all data mutations live in framework-free modules — CRM edits in **`src/db/service.ts`**, county upsert in **`src/db/sync.ts`**, storage in **`src/db/store.ts`** (all async, plain functions); the server actions in `src/app/actions.ts` are thin wrappers that call these then `revalidatePath`/`redirect`. **When adding write logic, put it in the service/sync module, not the action.**

**Verification:** `pnpm typecheck` + `pnpm build` clean; all routes render 200 in production; auth verified (401 no-creds / 200 with creds / 401 wrong pw). (There's no automated test script currently — the old `verify_sync.ts`/`verify_acceptance.ts` were removed in the Redis rewrite / fake-data purge. Re-add a store-level upsert test if you touch sync.)

**Suggested NEXT:** (a) enrich the 2,193 fit-band homes with the full land pipeline (water/septic/slope/TCE) — currently only the 243 ≥10 ac parcels are land-matched from the land tool's geojson; (b) refine scoring now real data flows (add the manual signals: probate/obit via the weekly WCCA review, tenure/lottery via county records); (c) Phase 3 letter-merge PDFs from §6 templates; (d) map polish (marker clustering when zoomed out, resizable map/table split like the land tool). Phase 2's SD gate is effectively handled by the SCHOOLDIST filter; a boundary-polygon point-in-polygon refinement is optional (mailing city ≠ district — parcels already carry SCHOOLDIST so it's reliable).

## The §7 schema (the `Lead` type — `src/lib/types.ts`)
Plain JSON object per parcel, keyed by `parcelId` in the store. Key fields: `parcelId` (unique key), `address`/`municipality`, `inHudsonSd`, `ownerName`/`mailingAddress`, `acreage`/`yearBuilt`/`sqft`/`beds`, `assessedValue`/`estMarket`, `lotteryCredit`, `tenureYears`, `source`, `probateCaseNo`/`prName`/`prAttorney`, `fitScore`/`motivationScore`/`total`, `status`, `letter1Date`/`letter2Date`/`responseDate`, `notes`/`nextAction`/`nextActionDate`, county-sync fields (`landValue`/`impValue`/`lat`/`lon`/`propClass`/`parcelType`/`absentee`/`landData`/`syncedAt`), `createdAt`/`updatedAt`, and **`log: NoteEntry[]`** (embedded timestamped activity log — status changes + notes; `{body,kind:note|status|system,createdAt}`). All dates are ISO strings; date-only fields are `YYYY-MM-DD` (lexical == chronological for the Today queue).

**Statuses** (pipeline order, drives the board): `watchlist → queued → letter1_sent → letter2_sent → responded → negotiating → closed → dead`. Moving to letter1_sent / letter2_sent / responded auto-stamps the matching date column (if empty) and appends a status log entry (see `STATUS_DATE_FIELD` in `src/lib/constants.ts`).

## Repo map
```
src/
  middleware.ts  Basic Auth gate (MUST be here, not repo root — src/-dir project)
  db/        store.ts (Redis|JSON-file backend, `hh_leads` hash) · queries.ts (reads + getLeadsFiltered, filter/sort in JS)
             · service.ts (CRM writes) · sync.ts (county upsert: syncHomes/upsertParcels)
  lib/       types.ts (Lead/NoteEntry + blankLead) · constants.ts · scoring.ts · autoscore.ts (auto Fit/Motivation)
             · parcels.ts (ArcGIS fetch/map + absentee) · land.ts (enrichment summary) · coerce.ts · csv.ts · util.ts
  app/       page.tsx (leads+filters+sync) · board/ · today/ · new/ · import/ · leads/[parcelId]/ (detail+county/land panel)
             · actions.ts (server actions incl. syncFromCounty) · layout.tsx · globals.css
  components/ LeadsExplorer (map+table+two-way link) · Nav · badges · StatusSelect · InlineField
             · NoteComposer · NewLeadForm · ImportClient · DeleteButton · SyncButton · LeadFilters
scripts/     sync · push_store (leads.json→Redis) · loadenv (.env.local loader for tsx)   (run via tsx)
data/        leads.json (GITIGNORED — real PII; local dev fallback; prod uses Redis)
```

## Stack / conventions
- **Next.js 15 App Router + React 19**, TypeScript, **plain CSS** (`globals.css` — no Tailwind). Path alias `@/*` → `src/*` works in Next; **standalone `tsx` scripts can't resolve `@/`**, so the script-reachable chain (`scripts/*` → `src/db/store.ts`/`src/db/sync.ts` → `src/lib/*`) uses **relative imports** — keep it that way.
- **Storage = `src/db/store.ts`**: Upstash Redis when `KV_REST_API_URL`+`KV_REST_API_TOKEN` are set (prod), else `data/leads.json` (dev). Leads live in one `hh_leads` hash keyed by parcelId; bulk writes chunk at 100 (Upstash request-size limit). `getRedis()` reads env at call-time, so scripts just call `loadEnvLocal()` before any store call. No ORM.
- Mutations = async server actions wrapping `service.ts`/`sync.ts`. Reads = async server components calling `queries.ts`. `export const dynamic = "force-dynamic"` on data pages.
- `pnpm` scripts: `dev`/`build`/`start`/`typecheck`/`sync`/`push-store`.

## Environment / gotchas
- Windows; **must `export PATH="/c/Program Files/nodejs:/c/Users/ajrun/AppData/Roaming/npm:$PATH"`** before pnpm/node in the Bash tool. Bash tool = Git Bash; cwd resets after each call — `cd` first.
- Claude's Bash/PowerShell tools are **network-sandboxed** — pass `dangerouslyDisableSandbox: true` for `pnpm install`, `pnpm sync`, `vercel …`, or any fetch.
- **Kill stray `next` processes with PowerShell** (`Get-CimInstance Win32_Process … CommandLine -like '*hudson-existing-homes*'`), not git-bash `pkill` — orphaned `next` procs racing on `.next` corrupt the build (`Cannot find module './xxx.js'`). If a prod build errors that way: kill all, `rm -rf .next`, rebuild.
- `pnpm dev` render worker can 500 on Windows if a request is cut off mid-compile (EPIPE); a real browser is fine. Prod (`pnpm build && pnpm start`) is robust.

## Ground rules (from spec §2 — respect these when building outreach features later)
Owner-occupant fair-value framing; **never reference age/health/widowhood/grief**; **60-day buffer on estates**; no pressure mechanics (one letter + one follow-up, then stop); phone/text only if THEY provide a number (TCPA); if a seller seems confused, stop and require independent counsel (WI §46.90 elder-exploitation). **WCCA (wcca.wicourts.gov) prohibits scraping — manual weekly review only.** Any outreach mechanics get attorney review before shipping.
