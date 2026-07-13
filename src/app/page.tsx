import Link from "next/link";
import { getLeads } from "@/db/queries";
import { ScoreBadge } from "@/components/badges";
import { StatusSelect } from "@/components/StatusSelect";
import { fmtMoney } from "@/lib/util";
import type { Lead } from "@/db/schema";

export const dynamic = "force-dynamic";

function fitFlags(l: Lead): { text: string; cls: string }[] {
  const flags: { text: string; cls: string }[] = [];
  if (l.inHudsonSd === false) flags.push({ text: "not Hudson SD?", cls: "warn" });
  if (l.mailingAddress && l.address && l.mailingAddress.trim() !== l.address.trim()) {
    flags.push({ text: "absentee", cls: "" });
  }
  if (l.lotteryCredit === false) flags.push({ text: "no LGC", cls: "" });
  if ((l.tenureYears ?? 0) >= 25) flags.push({ text: `${l.tenureYears}yr`, cls: "" });
  if (l.source === "probate") flags.push({ text: "probate", cls: "good" });
  return flags;
}

export default function LeadsPage() {
  const leads = getLeads();

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1>Leads</h1>
          <div className="sub">
            {leads.length} lead{leads.length === 1 ? "" : "s"} · sorted by total score (fit +
            motivation)
          </div>
        </div>
        <Link href="/new" className="btn primary">
          + New lead
        </Link>
      </div>

      {leads.length === 0 ? (
        <div className="panel empty-state">
          <h2>No leads yet</h2>
          <p>
            Import a county parcel export or add a lead manually to get started.
          </p>
          <div className="row-gap" style={{ justifyContent: "center", marginTop: 12 }}>
            <Link href="/import" className="btn primary">
              Import CSV
            </Link>
            <Link href="/new" className="btn">
              + New lead
            </Link>
          </div>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="leads">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Score</th>
                <th>Owner / address</th>
                <th>Municipality</th>
                <th className="num">Acres</th>
                <th className="num">BR</th>
                <th className="num">Sqft</th>
                <th className="num">Assessed</th>
                <th>Source / signals</th>
                <th style={{ minWidth: 150 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>
                    <ScoreBadge total={l.total ?? 0} fit={l.fitScore} motivation={l.motivationScore} />
                  </td>
                  <td>
                    <div className="owner-cell">
                      <Link href={`/leads/${l.id}`}>{l.ownerName || "(unknown owner)"}</Link>
                    </div>
                    <div className="addr-cell">{l.address || l.parcelId}</div>
                  </td>
                  <td>{l.municipality || <span className="muted">—</span>}</td>
                  <td className="num">{l.acreage ?? "—"}</td>
                  <td className="num">{l.beds ?? "—"}</td>
                  <td className="num">{l.sqft ? l.sqft.toLocaleString() : "—"}</td>
                  <td className="num">{l.assessedValue ? fmtMoney(l.assessedValue) : "—"}</td>
                  <td>
                    <div className="row-gap" style={{ gap: 5 }}>
                      {fitFlags(l).map((f, i) => (
                        <span key={i} className={`pill-flag ${f.cls}`}>
                          {f.text}
                        </span>
                      ))}
                      {fitFlags(l).length === 0 && <span className="muted">—</span>}
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
