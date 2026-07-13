import Link from "next/link";
import { getTodayLeads } from "@/db/queries";
import { ScoreBadge } from "@/components/badges";
import { StatusSelect } from "@/components/StatusSelect";
import { todayISO } from "@/lib/util";

export const dynamic = "force-dynamic";

export default function TodayPage() {
  const leads = getTodayLeads();
  const today = todayISO();

  return (
    <main className="wrap">
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <div className="sub">
            Next action due on or before {today} · {leads.length} item
            {leads.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="panel empty-state">
          <h2>Nothing due 🎉</h2>
          <p>No leads have a next-action date on or before today.</p>
          <Link href="/" className="btn" style={{ marginTop: 8 }}>
            Back to all leads
          </Link>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="leads">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Due</th>
                <th style={{ width: 60 }}>Score</th>
                <th>Owner / next action</th>
                <th style={{ minWidth: 150 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const overdue = (l.nextActionDate ?? "") < today;
                return (
                  <tr key={l.id}>
                    <td>
                      <span
                        className={`pill-flag ${overdue ? "warn" : ""}`}
                        title={overdue ? "Overdue" : "Due today"}
                      >
                        {l.nextActionDate}
                      </span>
                    </td>
                    <td>
                      <ScoreBadge total={l.total ?? 0} />
                    </td>
                    <td>
                      <div className="owner-cell">
                        <Link href={`/leads/${l.id}`}>{l.ownerName || l.parcelId}</Link>
                      </div>
                      <div className="addr-cell">
                        {l.nextAction || <span className="muted">(no action text)</span>}
                        {l.address ? ` · ${l.address}` : ""}
                      </div>
                    </td>
                    <td>
                      <StatusSelect id={l.id} status={l.status} size="sm" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
