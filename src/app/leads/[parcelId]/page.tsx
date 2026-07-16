import Link from "next/link";
import { notFound } from "next/navigation";
import { getLead, getLeadNotes } from "@/db/queries";
import { LEAD_FIELDS } from "@/lib/constants";
import { InlineField } from "@/components/InlineField";
import { NoteComposer } from "@/components/NoteComposer";
import { StatusSelect } from "@/components/StatusSelect";
import { ScoreBadge, EstateBadge } from "@/components/badges";
import { DeleteButton } from "@/components/DeleteButton";
import { fmtTimestamp, fmtMoney } from "@/lib/util";
import { parseLandData, summarizeLand } from "@/lib/land";
import type { Lead } from "@/lib/types";

export const dynamic = "force-dynamic";

const GROUP_ORDER = ["Property", "Owner", "Facts", "Source", "Scoring", "Pipeline"];

export default async function LeadDetail({ params }: { params: Promise<{ parcelId: string }> }) {
  const { parcelId: raw } = await params;
  const parcelId = decodeURIComponent(raw);

  const lead = await getLead(parcelId);
  if (!lead) notFound();
  const notes = await getLeadNotes(parcelId);

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
          {lead.source === "estate" && <EstateBadge />}
          <StatusSelect parcelId={lead.parcelId} status={lead.status} />
        </div>
      </div>

      <DateStrip lead={lead} />

      <CountyLandPanel lead={lead} />

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
                    parcelId={lead.parcelId}
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
            <DeleteButton parcelId={lead.parcelId} label={lead.ownerName || lead.parcelId} />
          </div>
        </div>

        {/* Right: timestamped notes log */}
        <div className="panel panel-pad">
          <p className="fg-title" style={{ marginBottom: 10 }}>
            Activity log
          </p>
          <NoteComposer parcelId={lead.parcelId} />
          <div className="log-list">
            {notes.length === 0 && <p className="muted">No entries yet.</p>}
            {notes.map((n, i) => (
              <div key={i} className={`log-entry kind-${n.kind}`}>
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

function CountyLandPanel({ lead }: { lead: Lead }) {
  const land = summarizeLand(parseLandData(lead.landData));
  const isCounty = lead.parcelType != null;
  return (
    <div className="panel panel-pad" style={{ marginBottom: 16 }}>
      <div className="row-gap" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <p className="fg-title" style={{ margin: 0 }}>
          County record {isCounty ? "" : "(manual / imported lead)"}
        </p>
        <span className="muted" style={{ fontSize: 11.5 }}>
          {lead.syncedAt ? `synced ${fmtTimestamp(lead.syncedAt)}` : "not county-synced"}
        </span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
        <dl className="kv">
          <dt>Type</dt>
          <dd>
            {lead.parcelType === "acreage-split"
              ? "Acreage / split (≥10 ac)"
              : lead.parcelType === "home-fit"
                ? "Home-fit"
                : "—"}
          </dd>
          <dt>House value</dt>
          <dd>{lead.impValue ? fmtMoney(lead.impValue) : "—"}</dd>
          <dt>Land value</dt>
          <dd>{lead.landValue ? fmtMoney(lead.landValue) : "—"}</dd>
          <dt>Assessed</dt>
          <dd>{lead.assessedValue ? fmtMoney(lead.assessedValue) : "—"}</dd>
        </dl>
        <dl className="kv">
          <dt>Acreage</dt>
          <dd>{lead.acreage ?? "—"}</dd>
          <dt>Prop class</dt>
          <dd>{lead.propClass || "—"}</dd>
          <dt>Owner-occ?</dt>
          <dd>{lead.absentee ? "No — absentee" : "Likely owner-occupant"}</dd>
          <dt>Mailing</dt>
          <dd style={{ maxWidth: 260 }}>{lead.mailingAddress || "—"}</dd>
        </dl>
        <div>
          <div className="muted" style={{ fontSize: 11.5, marginBottom: 6 }}>
            Land data {land ? `· risk: ${land.risk}` : ""}
          </div>
          {land ? (
            <div className="row-gap" style={{ gap: 5, maxWidth: 300 }}>
              {land.flags.map((f, i) => (
                <span key={i} className={`pill-flag ${f.cls}`}>
                  {f.text}
                </span>
              ))}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, maxWidth: 260 }}>
              Not land-matched. Full enrichment (water/septic/slope/TCE) is available for ≥10 ac
              parcels from the Hudson Land tool.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
