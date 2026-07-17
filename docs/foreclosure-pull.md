# Pulling WI foreclosure records (St. Croix County)

How to feed **mortgage-foreclosure distress signals** into the lead tracker. This
is a Prong-B channel: a homeowner in foreclosure is often highly motivated to
sell *before* the sheriff's sale to preserve equity — the strongest pre-listing
signal there is. All Hudson-School-District parcels are in **St. Croix County**.

Like the probate/divorce channel, this is **user-run and manual** — WCCA
(wcca.wicourts.gov) prohibits automated scraping. You pull the records by hand;
the tooling only consumes the export you produce.

## Where the records live (three sources, most→least useful for matching)

### 1. St. Croix County Sheriff's Sales — BEST (address-keyed)
The Sheriff publishes upcoming foreclosure **sale notices**, and WI law requires
the sale to be published in a local paper. These list the **property address**,
the defendant/owner, the case number, the judgment amount, and the sale date.
- St. Croix County Sheriff (sccwi.gov → Sheriff → foreclosure/civil sales), and
  legal notices in the **Hudson Star-Observer** / **River Falls Journal**.
- Address-keyed → matches our parcels **by address**, which is more reliable than
  name matching and also catches homes titled in a **trust or LLC** (whose
  owner name won't name-match a person defendant).

### 2. WCCA Advanced Search — PRIMARY (case-level, party names)
wcca.wicourts.gov → **Advanced Search**:
- **County:** St. Croix
- **Case type:** *Foreclosure of Mortgage* (a Civil case type; set the class filter
  to Civil, then pick "Foreclosure of Mortgage" — WCCA type code 30404).
- **Date filed:** last ~24 months (older cases are usually sold/resolved).
- Optionally filter to **open** status.
- For each hit, capture: **defendant (homeowner) name, case number, filing date,
  case status**, and from the case detail if shown — the **property address**,
  the **plaintiff (lender)**, and the **defense attorney**.

### 3. Lis pendens / Notice of foreclosure — EARLIEST signal
Filed at case start (before judgment/sale) and recorded at the **St. Croix County
Register of Deeds**. Earliest point in the timeline = the most runway for a fair,
pre-foreclosure sale. Optional; the WCCA case filing already marks the same start.

## The matching workflow
1. **Export to CSV** with a header row. Minimum columns (headers are
   auto-detected, order-independent):
   - `name` (or `party` / `defendant`), `case_no`, `filed`, `status`
   - Sheriff list, also include: `address`, `sale_date`, `judgment`
2. **Match:** `pnpm match-wcca data/wcca_foreclosure.csv --type=foreclosure`
   → name-matches parties to owners (surname + first-initial; surname-only is
   dropped as too noisy) → writes reviewable `data/wcca_matches.json`.
3. **Review** `wcca_matches.json` — name matches can be false. Confirm the
   municipality/address lines up with the parcel before keeping it. Drop the good
   ones into `data/research_inbox.json` (they carry `likely_motivation:
   "foreclosure"` + a `wcca_case` string).
4. **Merge:** `pnpm merge-research` → sets `motivationScore` up by **+4**
   (foreclosure boost), tags `source="foreclosure"`, appends a log entry, and
   fans out across the owner's parcels.

## Address matching (recommended for the sheriff's-sale list)
`match-wcca` currently matches by **name**, which misses trust/LLC-titled homes.
Sheriff's-sale notices are **address-keyed**, so an `--by=address` mode would
match them directly and more reliably. Not built yet — say the word and I'll add
it (normalize `address` against each lead's situs; fall back to name).

## Timeline — when a foreclosure lead is actionable
WI owner-occupied foreclosure runs roughly: **lis pendens/filing → judgment →
redemption period (commonly 6–12 months) → sheriff's sale → confirmation.** The
sweet spot for a fair-value purchase is **after filing but before the sheriff's
sale**, while the owner still holds title and is motivated to avoid the sale.
Prioritize **open** cases filed in the last ~12 months with **no sale yet**.

## Compliance — READ before any foreclosure outreach (stricter than normal)
Compiling these public records is fine. **Outreach to someone in foreclosure is
heavily regulated** and must get **attorney review before anything is sent**:
- **Wis. Stat. §846.40 / §846.45** — foreclosure "consultant" / "reconveyance"
  (equity-purchaser) rules: mandatory disclosures, written-contract requirements,
  a homeowner right to cancel, and penalties for violations. Buying from an owner
  in foreclosure can trigger these.
- **TCPA / DNC** for any call or text (and only call a number the owner gave).
- Never frame outreach as foreclosure "rescue"/"help you save your home."
Keep it the same fair-value, non-pressure framing as the rest of the pipeline,
and route the letter/script through counsel first (already the standing rule).
