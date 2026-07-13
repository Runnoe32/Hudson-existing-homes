import Link from "next/link";
import { notFound } from "next/navigation";
import { getLead, getLeadNotes } from "@/db/queries";
import { LEAD_FIELDS } from "@/lib/constants";
import { InlineField } from "@/components/InlineField";
import { NoteComposer } from "@/components/NoteComposer";
import { StatusSelect } from "@/components/StatusSelect";
import { ScoreBadge } from "@/components/badges";
import { DeleteButton } from "@/components/DeleteButton";
import { fmtTimestamp } from "@/lib/util";
import type { Lead } from "@/db/schema";

export const dynamic = "force-dynamic";

const GROUP_ORDER = ["Property", "Owner", "Facts", "Source", "Scoring", "Pipeline"];

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const lead = getLead(id);
  if (!lead) notFound();
  const notes = getLeadNotes(id);

  const byGroup = GROUP_ORDER.map((g) => ({
    group: g,
    fields: LEAD_FIELDS.filter((f) => f.group === g),
  })).filter((g) => g.fields.length > 0);

  return (
    <main className="wrap" style={{ maxWidth: 1080 }}>
      <div className="row-gap" style={{ marginBottom: 6 }}>
        <Link href="/" className="muted">
          ← All leads
        </Link>
      </div>

      <div className="page-head">
        <div>
          <h1 style={{ marginBottom: 4 }}>{lead.ownerName || "(unknown owner)"}</h1>
          <div className="sub">
            {lead.address || "—"} · <span className="mono">{lead.parcelId}</span>
          </div>
        </div>
        <div className="row-gap">
          <ScoreBadge total={lead.total ?? 0} fit={lead.fitScore} motivation={lead.motivationScore} />
          <StatusSelect id={lead.id} status={lead.status} />
        </div>
      </div>

      <DateStrip lead={lead} />

      <div className="detail-grid">
        {/* Left: editable fields */}
        <div className="panel panel-pad">
          {byGroup.map(({ group, fields }) => (
            <div className="field-group" key={group}>
              <p className="fg-title">{group}</p>
              <div className="fields">
                {fields.map((def) => (
                  <InlineField
                    key={def.key}
                    id={lead.id}
                    def={def}
                    value={(lead as unknown as Record<string, unknown>)[def.key]}
                  />
                ))}
              </div>
              {group === "Scoring" && (
                <p className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                  Total = fit + motivation = <b>{lead.total ?? 0}</b> (auto). ≥12 → letter · 9–11 →
                  watchlist (per §4).
                </p>
              )}
            </div>
          ))}
          <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 4 }}>
            <DeleteButton id={lead.id} label={lead.ownerName || lead.parcelId} />
          </div>
        </div>

        {/* Right: timestamped notes log */}
        <div className="panel panel-pad">
          <p className="fg-title" style={{ marginBottom: 10 }}>
            Activity log
          </p>
          <NoteComposer id={lead.id} />
          <div className="log-list">
            {notes.length === 0 && <p className="muted">No entries yet.</p>}
            {notes.map((n) => (
              <div key={n.id} className={`log-entry kind-${n.kind}`}>
                <div className="log-when">{fmtTimestamp(n.createdAt)}</div>
                <div className="log-body">{n.body}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function DateStrip({ lead }: { lead: Lead }) {
  const items: { label: string; value: string | null }[] = [
    { label: "Letter 1", value: lead.letter1Date },
    { label: "Letter 2", value: lead.letter2Date },
    { label: "Response", value: lead.responseDate },
    { label: "Next action", value: lead.nextActionDate },
  ];
  return (
    <div className="row-gap" style={{ marginBottom: 16, gap: 18 }}>
      {items.map((it) => (
        <span key={it.label} style={{ fontSize: 12.5 }}>
          <span className="muted">{it.label}: </span>
          {it.value ? <b>{it.value}</b> : <span className="muted">—</span>}
        </span>
      ))}
    </div>
  );
}
