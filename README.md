# Hudson Existing Homes — Lead Tracker

Tracker for off-market outreach to likely-seller homeowners in the Hudson School District.
Companion to the Hudson Land project. Full spec in `hudson-existing-homes-project.md`.

**Live (password-gated):** https://hudson-existing-homes.vercel.app — HTTP Basic Auth
(user `hudson`, password in the owner's password manager / Vercel `SITE_PASSWORD`).

> ⚠️ **Holds real homeowner PII.** Data lives in Upstash Redis (prod) behind app-level auth;
> `data/leads.json` (local dev fallback) is gitignored and never committed. Keep auth on.

## Stack
- Next.js 15 (App Router) + React 19, TypeScript, plain CSS
- **Upstash Redis** in prod / local **JSON file** in dev (`src/db/store.ts`) — no ORM
- Deployed on Vercel (git-connected: push to `master` auto-deploys)
- Server Actions for mutations; framework-free logic in `src/db/service.ts` + `sync.ts`

## Setup
```bash
pnpm install
# create .env.local with KV_REST_API_URL / KV_REST_API_TOKEN to use Redis (else it uses data/leads.json)
pnpm sync               # pull ~2,400 existing-home parcels from the county layer (~70s)
pnpm build && pnpm start  # http://localhost:3000  (recommended for daily use)
# pnpm dev              # alt hot-reload dev server
```

## Where the data comes from
Leads are pulled **live from the Wisconsin Statewide Parcel Map** (the same open ArcGIS
source the Hudson Land tool uses), filtered to existing homes in the Hudson School District —
via **`pnpm sync`** or the **⟳ Sync from county** button on the Leads page. Re-syncing refreshes
county fields (owner, mailing, valuation) but **never overwrites your research** (scores, status,
notes, probate, beds/sqft). The 243 parcels ≥10 ac also get land enrichment
(arsenic/septic/slope/TCE) matched in from the land tool.

**Not auto-pullable** (inherent to the data): bedrooms / finished sqft / year built live in
scrape-restricted assessor detail — fill those per finalist. Probate/obit/tenure/lottery signals
are entered manually (WCCA forbids scraping). CSV import (`/import`) remains as a fallback.

## What's here (Phase 1)
- **Leads** (`/`) — every lead, sorted by total score (fit + motivation), with status badges,
  fit/motivation split, quick signal flags (absentee, no-LGC, tenure, probate), and an
  inline status dropdown.
- **Pipeline** (`/board`) — kanban board, one column per status.
- **Today** (`/today`) — the "what do I do today" queue: leads whose `next_action_date` is on
  or before today (excludes closed/dead), most-overdue first.
- **Lead detail** (`/leads/[id]`) — inline-edit every §7 field (saves on blur/change; total
  recomputes live), plus a timestamped **activity log** (status changes auto-append here).
- **New lead** (`/new`) — quick create (parcel id required, unique).
- **Import CSV** (`/import`) — upload a county export, **map columns** (auto-guessed from
  headers, override any), then import. **Dedupe on `parcel_id`** — existing parcels are
  skipped, never overwritten.

Scores are **manual** in Phase 1 (auto-scoring per §4 is Phase 2). `total = fit + motivation`,
each clamped to 0–10.

## Scripts
| Command | What it does |
|---|---|
| `pnpm dev` / `build` / `start` | Next dev / production build / serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | regenerate Drizzle migration SQL from `schema.ts` |
| `pnpm db:migrate` | apply migrations to `data/leads.db` |
| `pnpm db:reset` | delete the local DB file |
| `pnpm sync` | pull existing-home parcels from the county layer |
| `tsx scripts/verify_sync.ts` | assert county sync refreshes county data but preserves user research |

## Data policy
The tracker holds **real county data only** — the seed/sample-CSV tooling was removed so no
fake/inaccurate leads can enter. `data/leads.db` is gitignored (real PII, never committed).

## Layout
```
src/
  db/        schema.ts · index.ts (client) · queries.ts (reads) · service.ts (CRM writes) · sync.ts (county upsert)
  lib/       constants.ts · scoring.ts · autoscore.ts · parcels.ts · land.ts · coerce.ts · csv.ts · util.ts
  app/       page.tsx (leads+filters+sync) · board/ · today/ · new/ · import/ · leads/[id]/ · actions.ts
  components/ Nav · badges · StatusSelect · InlineField · NoteComposer · NewLeadForm · ImportClient · DeleteButton · SyncButton · LeadFilters
scripts/     migrate · reset · sync · verify_sync
```

## Next (not built yet)
Phase 2 (district gate + auto-scoring), Phase 3 (letter-merge PDFs), Phase 4 (weekly WCCA/obit
intake), Phase 5 (comp helper). See spec §8.
