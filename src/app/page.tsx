import Link from "next/link";
import { getLeadsFiltered, type LeadFilter } from "@/db/queries";
import { ScoreBadge } from "@/components/badges";
import { StatusSelect } from "@/components/StatusSelect";
import { SyncButton } from "@/components/SyncButton";
import { LeadFilters } from "@/components/LeadFilters";
import { fmtMoney } from "@/lib/util";
import { parseLandData, summarizeLand } from "@/lib/land";
import type { Lead } from "@/db/schema";

export const dynamic = "force-dynamic";

const LIMIT = 250;

function signals(l: Lead): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  if (l.absentee) out.push({ text: "absentee", cls: "" });
  if (l.lotteryCredit === false && l.tenureYears != null) out.push({ text: "no LGC", cls: "" });
  if ((l.tenureYears ?? 0) >= 25) out.push({ text: `${l.tenureYears}yr`, cls: "" });
  if (l.source === "probate") out.push({ text: "probate", cls: "good" });
  const land = summarizeLand(parseLandData(l.landData));
  if (land) {
    const bad = land.flags.find((f) => f.cls === "bad");
    if (bad) out.push({ text: bad.text, cls: "warn" });
  }
  return out;
}

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
    minTotal: sp.min ? Number(sp.min) : undefined,
    limit: LIMIT,
  };
  const { rows, total } = getLeadsFiltered(filter);

  return (
    <main className="wrap" style={{ maxWidth: 1320 }}>
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <div className="sub">
            {total.toLocaleString()} matching · sorted by total score (fit + motivation)
            {total > rows.length && ` · showing top ${rows.length}`}
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
        </div>
      ) : (
        <div className="table-wrap">
          <table className="leads">
            <thead>
              <tr>
                <th style={{ width: 66 }}>Score</th>
                <th>Owner / address</th>
                <th>Municipality</th>
                <th className="num">Acres</th>
                <th className="num">House val</th>
                <th className="num">Land val</th>
                <th className="num">Assessed</th>
                <th>Signals</th>
                <th style={{ minWidth: 140 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <ScoreBadge total={l.total ?? 0} fit={l.fitScore} motivation={l.motivationScore} />
                  </td>
                  <td>
                    <div className="owner-cell">
                      <Link href={`/leads/${l.id}`}>{l.ownerName || "(unknown owner)"}</Link>
                      {l.parcelType === "acreage-split" && (
                        <span className="pill-flag" style={{ marginLeft: 6 }} title="≥10 acres — split-parcel / land play">
                          ⌂+land
                        </span>
                      )}
                    </div>
                    <div className="addr-cell">
                      {l.address || l.parcelId}
                      {l.beds || l.sqft ? (
                        <span className="muted"> · {l.beds ? `${l.beds}BR` : ""}{l.beds && l.sqft ? " " : ""}{l.sqft ? `${l.sqft.toLocaleString()}sf` : ""}</span>
                      ) : (
                        <span className="muted" title="Beds/sqft aren't in the free parcel layer — verify on a finalist"> · beds/sqft?</span>
                      )}
                    </div>
                  </td>
                  <td>{l.municipality || <span className="muted">—</span>}</td>
                  <td className="num">{l.acreage ?? "—"}</td>
                  <td className="num">{l.impValue ? fmtMoney(l.impValue) : "—"}</td>
                  <td className="num">{l.landValue ? fmtMoney(l.landValue) : "—"}</td>
                  <td className="num">{l.assessedValue ? fmtMoney(l.assessedValue) : "—"}</td>
                  <td>
                    <div className="row-gap" style={{ gap: 5 }}>
                      {signals(l).map((f, i) => (
                        <span key={i} className={`pill-flag ${f.cls}`}>
                          {f.text}
                        </span>
                      ))}
                      {signals(l).length === 0 && <span className="muted">—</span>}
                    </div>
                  </td>
                  <td>
                    <StatusSelect id={l.id} status={l.status} size="sm" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
