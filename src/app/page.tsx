import Link from "next/link";
import { getLeadsFiltered, type LeadFilter } from "@/db/queries";
import { SyncButton } from "@/components/SyncButton";
import { LeadFilters } from "@/components/LeadFilters";
import { LeadsExplorer } from "@/components/LeadsExplorer";

export const dynamic = "force-dynamic";

const LIMIT = 250;

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter: LeadFilter = {
    q: sp.q,
    parcelType: sp.type,
    status: sp.status,
    absentee: sp.absentee === "1",
    enrichedOnly: sp.enriched === "1",
    hideDeprioritized: sp.hidedep === "1",
    minTotal: sp.min ? Number(sp.min) : undefined,
    minAssessed: sp.minval ? Number(sp.minval) : undefined,
    maxAssessed: sp.maxval ? Number(sp.maxval) : undefined,
    minAcres: sp.minac ? Number(sp.minac) : undefined,
    singleFamilyOnly: sp.sfh === "1",
    limit: LIMIT,
  };
  const { rows, total, pins } = await getLeadsFiltered(filter);

  return (
    <main className="wrap" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <div className="sub">
            {total.toLocaleString()} matching · sorted by total score (fit + motivation)
            {total > rows.length && ` · table shows top ${rows.length}`}
          </div>
        </div>
        <SyncButton />
      </div>

      <LeadFilters />

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
