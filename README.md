# Hudson Existing Homes — Lead Tracker (Phase 1)

Local-only tracker for off-market outreach to likely-seller homeowners in the Hudson
School District. Companion to the Hudson Land project. Full spec lives in
`hudson-existing-homes-project.md`; this app implements **Phase 1 (§8)**.

> ⚠️ **Local only.** The SQLite database (`data/leads.db`) holds other people's names and
> addresses. It is gitignored and this app has **no auth and is not deployed** — keep it on
> your machine (spec §8).

## Stack
- Next.js 15 (App Router) + React 19
- SQLite via **Drizzle ORM** + `better-sqlite3`
- Plain CSS (no Tailwind)
- Server Actions for all mutations; framework-free logic in `src/db/service.ts`

## Setup
```bash
pnpm install
pnpm db:migrate     # create data/leads.db from the schema
pnpm seed           # 8 sample leads across every status
pnpm sample-csv     # write data/sample_county_export_50.csv (for testing import)
pnpm dev            # http://localhost:3000
```

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
| `pnpm seed` | (re)seed 8 sample leads |
| `pnpm sample-csv` | generate the 50-row test CSV |
| `tsx scripts/verify_acceptance.ts` | end-to-end acceptance check (import 50 / edit scores / status transition) |

## Acceptance (§8, verified)
`db:reset → db:migrate → seed → sample-csv → tsx scripts/verify_acceptance.ts` — imports a
50-row CSV (mapped, deduped), edits scores (total recomputes + clamps), and moves a lead
`watchlist → letter1_sent` with the date stamped and logged. All checks pass.

## Layout
```
src/
  db/        schema.ts · index.ts (client) · queries.ts (reads) · service.ts (writes)
  lib/       constants.ts · scoring.ts · coerce.ts · csv.ts · util.ts
  app/       page.tsx (leads) · board/ · today/ · new/ · import/ · leads/[id]/ · actions.ts
  components/ Nav · badges · StatusSelect · InlineField · NoteComposer · NewLeadForm · ImportClient · DeleteButton
scripts/     migrate · reset · seed · make_sample_csv · verify_acceptance
```

## Next (not built yet)
Phase 2 (district gate + auto-scoring), Phase 3 (letter-merge PDFs), Phase 4 (weekly WCCA/obit
intake), Phase 5 (comp helper). See spec §8.
