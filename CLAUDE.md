# CLAUDE.md — Hudson Existing Homes

Project context and working rules for Claude / agents. Read this first.

## What this is

A **private, local-only** lead tracker for **off-market acquisition of an existing family home in the Hudson School District** — direct-mail outreach to owners who are statistically likely to sell but haven't listed (probate, obituary, absentee, expired-listing, long-tenure signals). Companion to the **Hudson Land** project (`c:\Users\ajrun\hudsonland`, buildable land) and the **Hudson Home Build** app (`c:\Users\ajrun\hudson-home-build`). Same discipline (parcel-level research, county records, scoring), different target: existing homes.

**Full spec:** `hudson-existing-homes-project.md` — currently lives in the user's **Downloads** folder (not committed to this repo). It defines the objective (§1), ethics ground-rules (§2), lead sources (§3), the fit/motivation scoring rubric (§4), outreach cadence (§5), letter templates (§6), the DB schema (§7), the 5 build phases (§8), and WI legal notes (§9). If you need the spec and it's not in the repo, ask the user to point you at it.

## ✅ CURRENT STATE & HOW TO RESUME (updated 2026-07-12) — read this first

**Phase 1 (of 5) is BUILT, running, and verified.** It's a local Next.js + SQLite CRM for leads. Phases 2–5 are **not started**.

**This is deliberately LOCAL-ONLY — no auth, no deploy, no cloud.** The SQLite DB (`data/leads.db`) holds other people's names and mailing addresses (PII); per spec §8 it stays on the box. It's gitignored. **Do not add auth-less deploy or push the DB.** (This is the opposite choice from the land tool, which was moved to Vercel behind Basic Auth — here we keep it off the internet entirely.)

**Run it** (repo root; first `export PATH="/c/Program Files/nodejs:/c/Users/ajrun/AppData/Roaming/npm:$PATH"`):
```bash
pnpm install            # once; native better-sqlite3 build is pre-approved in pnpm-workspace.yaml
pnpm db:migrate         # create data/leads.db from schema (idempotent)
pnpm seed               # 8 sample leads across every status (idempotent — re-run to reset demo)
pnpm sample-csv         # write data/sample_county_export_50.csv for testing import
pnpm dev                # http://localhost:3000
```

**The app** (`src/app/`, Next 15 App Router + React 19, plain CSS, no Tailwind):
- **Leads** (`/`) — all leads sorted by **total score** (fit + motivation), status badges, fit/motivation split, signal flags (absentee / no-lottery-credit / 25yr+ tenure / probate), inline status dropdown.
- **Pipeline** (`/board`) — kanban, one column per status.
- **Today** (`/today`) — `next_action_date <= today` (excludes closed/dead), most-overdue first.
- **Lead detail** (`/leads/[id]`) — inline-edit every §7 field (saves on blur/change; `total` recomputes live), + a timestamped **activity log**; status changes auto-append log entries.
- **New lead** (`/new`) — quick create; `parcel_id` required + unique.
- **Import CSV** (`/import`) — upload a county export, **map columns** (auto-guessed from headers, override any / ignore), import with **dedupe on `parcel_id`** (existing parcels skipped, never overwritten).

**Scoring:** manual in Phase 1 (auto-scoring per §4 is Phase 2). `total = fit + motivation`, each **clamped 0–10** on write. §4 tiers: ≥12 → letter, 9–11 → watchlist.

**Architecture note:** all DB mutations live in **framework-free `src/db/service.ts`** (plain functions); the server actions in `src/app/actions.ts` are thin wrappers that call the service then `revalidatePath`/`redirect`. This keeps the logic testable outside a Next request — `scripts/verify_acceptance.ts` imports the service directly and runs the §8 acceptance E2E. **When adding write logic, put it in the service, not the action.**

**Acceptance (§8) — verified 2026-07-12, all pass:**
`pnpm db:reset && pnpm db:migrate && pnpm seed && pnpm sample-csv && pnpm exec tsx scripts/verify_acceptance.ts` → imports the 50-row CSV (mapped + deduped: 50 inserted, re-import skips all 50), edits scores (total recomputes; 50 clamps to 10), moves a lead `watchlist → letter1_sent` (date stamped to today + logged). `pnpm typecheck` and `pnpm build` are clean.

**Suggested NEXT (Phase 2):** district gate + scoring engine — load Hudson SD boundary GeoJSON (WI DPI shapefile → GeoJSON), point-in-polygon flag on `in_hudson_sd` (never trust mailing city — "Hudson, WI 54016" extends into St. Croix Central / River Falls districts), then auto-compute fit/motivation from the §4 rubric with manual override. The land project already solved Hudson SD identification via the state parcel layer's `SCHOOLDIST` field — reuse that approach or the boundary polygon. Then Phase 3 (letter-merge PDFs from §6 templates), Phase 4 (weekly WCCA/obit intake), Phase 5 (comp helper).

## The §7 schema (implemented as the `leads` table)
`src/db/schema.ts`. One row per parcel/lead. Key fields: `parcelId` (unique — dedupe key), `address`/`municipality`, `inHudsonSd` (bool), `ownerName`/`mailingAddress`, `acreage`(real)/`yearBuilt`/`sqft`/`beds`, `assessedValue`/`estMarket`, `lotteryCredit` (bool), `tenureYears`, `source` (probate|obit|absentee|drive-by|expired-listing), `probateCaseNo`/`prName`/`prAttorney`, `fitScore`/`motivationScore`/`total`, `status`, `letter1Date`/`letter2Date`/`responseDate`, `notes`/`nextAction`/`nextActionDate`, `createdAt`/`updatedAt`. Date-only fields are **ISO `YYYY-MM-DD` text** (lexical == chronological, used by the Today queue); row timestamps are unix-epoch integers. Second table `notes_log` (id, leadId FK cascade, body, kind: note|status|system, createdAt) = the timestamped activity log.

**Statuses** (pipeline order, drives the board): `watchlist → queued → letter1_sent → letter2_sent → responded → negotiating → closed → dead`. Moving to letter1_sent / letter2_sent / responded auto-stamps the matching date column (if empty) and appends a status log entry (see `STATUS_DATE_FIELD` in `src/lib/constants.ts`).

## Repo map
```
src/
  db/        schema.ts · index.ts (better-sqlite3+drizzle client) · queries.ts (reads) · service.ts (writes — framework-free)
  lib/       constants.ts (STATUSES/SOURCES/field defs/import field map) · scoring.ts (clamp + total + tier)
             · coerce.ts (string→typed, money/date parsing) · csv.ts (header→field auto-mapping) · util.ts (todayISO, fmt)
  app/       page.tsx (leads) · board/ · today/ · new/ · import/ · leads/[id]/ (detail) · actions.ts (server actions) · layout.tsx · globals.css
  components/ Nav · badges (Status/Score) · StatusSelect · InlineField · NoteComposer · NewLeadForm · ImportClient · DeleteButton
scripts/     migrate · reset · seed · make_sample_csv · verify_acceptance   (all run via tsx)
drizzle/     generated migration SQL + meta
data/        leads.db (GITIGNORED — PII) · sample_county_export_50.csv (synthetic, committed)
```

## Stack / conventions
- **Next.js 15 App Router + React 19**, TypeScript, **plain CSS** (`globals.css` — no Tailwind, matches the land app). Path alias `@/*` → `src/*` (Next only; scripts use relative imports so `tsx` can run them without alias resolution — keep the `src/db/service.ts` → `queries.ts` → `lib/*` chain alias-free).
- **Drizzle ORM + better-sqlite3** (synchronous). `db.transaction(fn)` **runs immediately and returns fn's result** (not a callable — unlike raw better-sqlite3). Native build is approved in `pnpm-workspace.yaml` (`allowBuilds:` map, pnpm 11 format: `better-sqlite3: true`).
- Mutations = server actions wrapping `service.ts`. Reads = server components calling `queries.ts`. `export const dynamic = "force-dynamic"` on data pages (no stale caching of the local DB).
- `pnpm` scripts: `dev`/`build`/`start`/`typecheck`/`db:generate`/`db:migrate`/`db:reset`/`seed`/`sample-csv`.

## Environment / gotchas
- Windows; **must `export PATH="/c/Program Files/nodejs:/c/Users/ajrun/AppData/Roaming/npm:$PATH"`** before pnpm/node in the Bash tool. Bash tool = Git Bash; cwd resets after each call — `cd` first.
- Claude's Bash/PowerShell tools are **network-sandboxed** — pass `dangerouslyDisableSandbox: true` for `pnpm install` / any fetch.
- **Windows locks open DB files:** stop the dev server (kill the PID on port 3000) before `pnpm db:reset`, or the `fs.rmSync` fails.
- WAL mode is on; the seed/reset scripts open their own connection.

## Ground rules (from spec §2 — respect these when building outreach features later)
Owner-occupant fair-value framing; **never reference age/health/widowhood/grief**; **60-day buffer on estates**; no pressure mechanics (one letter + one follow-up, then stop); phone/text only if THEY provide a number (TCPA); if a seller seems confused, stop and require independent counsel (WI §46.90 elder-exploitation). **WCCA (wcca.wicourts.gov) prohibits scraping — manual weekly review only.** Any outreach mechanics get attorney review before shipping.
