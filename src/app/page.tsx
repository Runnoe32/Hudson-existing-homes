import Link from "next/link";
import { getLeadsFiltered, type LeadFilter, type SortKey } from "@/db/queries";
import { SyncButton } from "@/components/SyncButton";
import { LeadFilters } from "@/components/LeadFilters";
import { LeadsExplorer } from "@/components/LeadsExplorer";

export const dynamic = "force-dynamic";

const LIMIT = 250;

const SORT_KEYS: SortKey[] = [
  "priority",
  "total",
  "assessedValue",
  "impValue",
  "acreage",
  "municipality",
  "owner",
];
const SORT_LABELS: Record<SortKey, string> = {
  priority: "priority (fit + motivation)",
  total: "score",
  assessedValue: "assessed value",
  impValue: "house value",
  acreage: "acreage",
  municipality: "municipality",
  owner: "owner",
};

function num(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const sortBy = (SORT_KEYS.includes(sp.sort as SortKey) ? sp.sort : "priority") as SortKey;
  const sortDir = sp.dir === "asc" ? "asc" : "desc";
  const filter: LeadFilter = {
    q: sp.q,
    parcelType: sp.type,
    status: sp.status,
    municipality: sp.muni,
    absentee: sp.absentee === "1",
    enrichedOnly: sp.enriched === "1",
    hideDeprioritized: sp.hidedep === "1",
    minTotal: sp.min ? Number(sp.min) : undefined,
    minAssessed: num(sp.minval),
    maxAssessed: num(sp.maxval),
    minImp: num(sp.minimp),
    maxImp: num(sp.maximp),
    minAcres: sp.minac ? Number(sp.minac) : undefined,
    maxAcres: num(sp.maxac),
    singleFamilyOnly: sp.sfh === "1",
    sortBy,
    sortDir,
    limit: LIMIT,
  };
  const { rows, total, pins, facets } = await getLeadsFiltered(filter);
  const sortLabel =
    sortBy === "priority"
      ? SORT_LABELS.priority
      : `${SORT_LABELS[sortBy]} (${sortDir === "asc" ? "low→high" : "high→low"})`;

  return (
    <main className="wrap" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <div className="sub">
            {total.toLocaleString()} matching · sorted by {sortLabel}
            {total > rows.length && ` · table shows top ${rows.length}`}
          </div>
        </div>
        <SyncButton />
      </div>

      <LeadFilters municipalities={facets.municipalities} />

      {rows.length === 0 ? (
        <div className="panel empty-state">
          <h2>No leads match</h2>
          <p>
            Adjust the filters, or pull the latest parcels with <b>Sync from county</b> (top right).
            First run takes about a minute.
          </p>
          <Link href="/" className="btn" style={{ marginTop: 8 }}>
            Clear filters
          </Link>
        </div>
      ) : (
        <LeadsExplorer rows={rows} pins={pins} total={total} />
      )}
    </main>
  );
}
