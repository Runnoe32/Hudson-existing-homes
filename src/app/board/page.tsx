import Link from "next/link";
import { getBoard } from "@/db/queries";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";
import { ScoreBadge } from "@/components/badges";

export const dynamic = "force-dynamic";

export default function BoardPage() {
  const board = getBoard();
  const total = Object.values(board).reduce((n, arr) => n + arr.length, 0);

  return (
    <main className="wrap" style={{ maxWidth: 1500 }}>
      <div className="page-head">
        <div>
          <h1>Pipeline</h1>
          <div className="sub">{total} leads across {STATUSES.length} stages</div>
        </div>
      </div>

      <div className="board">
        {STATUSES.map((s) => {
          const items = board[s] ?? [];
          return (
            <div className="board-col" key={s}>
              <h3>
                <span className={`badge st-${s}`} style={{ padding: "2px 8px" }}>
                  <span className="dot" />
                  {STATUS_LABELS[s]}
                </span>
                <span className="col-count">{items.length}</span>
              </h3>
              <div className="col-body">
                {items.length === 0 && <div className="col-empty">—</div>}
                {items.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="mini-card">
                    <div className="mc-top">
                      <span className="mc-owner">{l.ownerName || "(unknown)"}</span>
                      <ScoreBadge total={l.total ?? 0} />
                    </div>
                    <div className="mc-addr">{l.address || l.parcelId}</div>
                    <div className="mc-meta">
                      {l.municipality && <span>{l.municipality}</span>}
                      {l.source && <span>{l.source}</span>}
                      {l.nextActionDate && <span>▶ {l.nextActionDate}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
