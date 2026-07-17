"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LMap } from "leaflet";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Lead } from "@/lib/types";
import type { LeadPin } from "@/db/queries";
import { ScoreBadge, EstateBadge, CategoryBadge } from "./badges";
import { StatusSelect } from "./StatusSelect";
import { fmtMoney } from "@/lib/util";
import { parseLandData, summarizeLand } from "@/lib/land";

type ColorBy = "score" | "type";

const SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Bright, satellite-legible buckets. Finer than the §4 12/9 cutoffs so the
// current (mostly auto-scored, low) data still shows variation; hotter = higher.
function scoreColor(total: number): string {
  if (total >= 12) return "#ff1744"; // red — hottest
  if (total >= 9) return "#ff9100"; // orange
  if (total >= 6) return "#ffea00"; // yellow
  if (total >= 3) return "#00e5ff"; // cyan
  return "#c8d6e0"; // pale — lowest
}
const SCORE_LEGEND = [
  { c: "#ff1744", t: "≥12" },
  { c: "#ff9100", t: "9–11" },
  { c: "#ffea00", t: "6–8" },
  { c: "#00e5ff", t: "3–5" },
  { c: "#c8d6e0", t: "0–2" },
];
// Parcel type: home-fit green, acreage/split magenta.
function typeColor(t: string | null): string {
  return t === "acreage-split" ? "#d500f9" : "#00e676";
}
const TYPE_LEGEND = [
  { c: "#00e676", t: "home-fit" },
  { c: "#d500f9", t: "acreage/split" },
];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function signals(l: Lead): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  if (l.absentee) out.push({ text: "absentee", cls: "" });
  if ((l.tenureYears ?? 0) >= 25) out.push({ text: `${l.tenureYears}yr`, cls: "" });
  // Researched motivation source (estate is shown as its own badge, not here).
  const MOT: Record<string, string> = {
    probate: "probate",
    divorce: "divorce",
    foreclosure: "foreclosure",
    landlord: "landlord",
    relocated: "relocated",
    snowbird: "snowbird",
    investor: "investor",
    "long-tenure": "long-tenure",
  };
  // A rental/investor motivation is already conveyed by the category badge (and
  // shouldn't read as a "good" buy-signal on a deprioritized row), so skip it there.
  const suppress = l.deprioritized && (l.source === "landlord" || l.source === "investor");
  if (l.source && MOT[l.source] && !suppress) out.push({ text: MOT[l.source], cls: "good" });
  const land = summarizeLand(parseLandData(l.landData));
  const bad = land?.flags.find((f) => f.cls === "bad");
  if (bad) out.push({ text: bad.text, cls: "warn" });
  return out;
}

// Column key → default sort direction on first click (numbers high→low, text low→high).
const SORTABLE = {
  total: "desc",
  owner: "asc",
  municipality: "asc",
  acreage: "desc",
  impValue: "desc",
  assessedValue: "desc",
} as const;
type SortCol = keyof typeof SORTABLE;

export function LeadsExplorer({ rows, pins, total }: { rows: Lead[]; pins: LeadPin[]; total: number }) {
  const [colorBy, setColorBy] = useState<ColorBy>("score");
  const [selected, setSelected] = useState<string | null>(null);

  const router = useRouter();
  const params = useSearchParams();
  const activeSort = (params.get("sort") ?? "priority") as SortCol | "priority";
  const activeDir = params.get("dir") === "asc" ? "asc" : "desc";

  function sortBy(col: SortCol) {
    const next = new URLSearchParams(params.toString());
    // Same column → flip direction; new column → its natural default direction.
    const dir = activeSort === col ? (activeDir === "asc" ? "desc" : "asc") : SORTABLE[col];
    next.set("sort", col);
    next.set("dir", dir);
    router.push(`/?${next.toString()}`);
  }

  function SortTh({ col, children, num }: { col: SortCol; children: ReactNode; num?: boolean }) {
    const on = activeSort === col;
    return (
      <th
        className={`sortable${num ? " num" : ""}${on ? " sorted" : ""}`}
        onClick={() => sortBy(col)}
        title="Click to sort; click again to reverse"
      >
        {children}
        <span className="sort-caret">{on ? (activeDir === "asc" ? "▲" : "▼") : "↕"}</span>
      </th>
    );
  }

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const markers = useRef<Map<string, CircleMarker>>(new Map());
  const [ready, setReady] = useState(false);

  // Re-fit the map only when the pin SET changes (filter), not on colour toggle.
  const pinsKey = useMemo(
    () => `${pins.length}:${pins[0]?.parcelId ?? ""}:${pins[pins.length - 1]?.parcelId ?? ""}`,
    [pins],
  );

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await import("leaflet");
      if (cancelled || !mapEl.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(mapEl.current, { preferCanvas: true, worldCopyJump: false }).setView(
        [44.97, -92.7],
        11,
      );
      L.tileLayer(SATELLITE, { maxZoom: 19, attribution: "Imagery © Esri" }).addTo(map);
      mapRef.current = map;
      setReady(true);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // (Re)draw markers when ready / pins / colour change.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map) return;
    markers.current.forEach((m) => m.remove());
    markers.current.clear();
    for (const p of pins) {
      const color = colorBy === "score" ? scoreColor(p.total) : typeColor(p.parcelType);
      // Deprioritized owners (rental portfolios / institutional) render small and
      // faint so they don't read as hot leads on the map.
      const m = L.circleMarker([p.lat, p.lon], {
        radius: p.deprioritized ? 4 : 6,
        weight: 1.5,
        color: "rgba(0,0,0,0.55)",
        fillColor: p.deprioritized ? "#8a94a0" : color,
        fillOpacity: p.deprioritized ? 0.5 : 0.95,
      });
      m.bindPopup(
        `<div style="min-width:150px">` +
          `<b>${p.estate ? "⚰ " : ""}${esc(p.ownerName || "(unknown)")}</b>` +
          `<div style="color:#5b6675;font-size:12px;margin:3px 0">score ${p.total} · ${p.parcelType ?? "—"} · ${esc(p.status)}</div>` +
          `<a href="/leads/${encodeURIComponent(p.parcelId)}" style="font-size:12px">Open full lead ↗</a>` +
          `</div>`,
        { autoPan: true, closeButton: true },
      );
      // Click a pin = zoom to it on the map (not navigate). The popup link is opt-in.
      m.on("click", () => setSelected(p.parcelId));
      m.addTo(map);
      markers.current.set(p.parcelId, m);
    }
  }, [ready, pins, colorBy]);

  // Fit to the current pin set.
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!ready || !L || !map || pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map((p) => [p.lat, p.lon] as [number, number]));
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
  }, [ready, pinsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Select (from a pin OR a table row) = bring the map into view and zoom to the
  // parcel so you can see where it is (like the land tool). Never navigates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const m = markers.current.get(selected);
    if (m) {
      mapEl.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      // let the scroll settle, then fly + fix Leaflet's size after any layout shift
      setTimeout(() => {
        map.invalidateSize();
        map.flyTo(m.getLatLng(), 16, { duration: 0.7 });
        m.openPopup();
      }, 120);
    }
  }, [selected]);

  return (
    <div>
      <div className="map-bar">
        <span className="muted" style={{ fontSize: 12.5 }}>
          {pins.length.toLocaleString()} of {total.toLocaleString()} on map
        </span>
        <div className="seg">
          <button className={colorBy === "score" ? "on" : ""} onClick={() => setColorBy("score")}>
            Colour: Score
          </button>
          <button className={colorBy === "type" ? "on" : ""} onClick={() => setColorBy("type")}>
            Type
          </button>
        </div>
        <div className="legend">
          {(colorBy === "score" ? SCORE_LEGEND : TYPE_LEGEND).map((x) => (
            <Chip key={x.t} c={x.c} t={x.t} />
          ))}
        </div>
      </div>

      <div ref={mapEl} className="lead-map" />

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="leads">
          <thead>
            <tr>
              <SortTh col="total">Score</SortTh>
              <SortTh col="owner">Owner / address</SortTh>
              <SortTh col="municipality">Municipality</SortTh>
              <SortTh col="acreage" num>
                Acres
              </SortTh>
              <SortTh col="impValue" num>
                House val
              </SortTh>
              <SortTh col="assessedValue" num>
                Assessed
              </SortTh>
              <th>Signals</th>
              <th style={{ minWidth: 140 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr
                key={l.parcelId}
                id={`row-${l.parcelId}`}
                className={selected === l.parcelId ? "row-sel" : ""}
                onClick={() => setSelected(l.parcelId)}
              >
                <td>
                  <ScoreBadge total={l.total ?? 0} fit={l.fitScore} motivation={l.motivationScore} />
                </td>
                <td>
                  <div className="owner-cell">
                    <Link href={`/leads/${encodeURIComponent(l.parcelId)}`} onClick={(e) => e.stopPropagation()}>
                      {l.ownerName || "(unknown owner)"}
                    </Link>
                    {l.source === "estate" && <EstateBadge />}
                    <CategoryBadge category={l.category ?? null} />
                    {l.parcelType === "acreage-split" && (
                      <span className="pill-flag" style={{ marginLeft: 6 }} title="≥10 acres — split-parcel play">
                        ⌂+land
                      </span>
                    )}
                  </div>
                  <div className="addr-cell">
                    {l.address || l.parcelId}
                    {!l.beds && !l.sqft && (
                      <span className="muted" title="Beds/sqft aren't in the free parcel layer — verify per finalist">
                        {" "}· beds/sqft?
                      </span>
                    )}
                  </div>
                </td>
                <td>{l.municipality || <span className="muted">—</span>}</td>
                <td className="num">{l.acreage ?? "—"}</td>
                <td className="num">{l.impValue ? fmtMoney(l.impValue) : "—"}</td>
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
                <td onClick={(e) => e.stopPropagation()}>
                  <StatusSelect parcelId={l.parcelId} status={l.status} size="sm" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Chip({ c, t }: { c: string; t: string }) {
  return (
    <span className="lgnd">
      <span className="dot" style={{ background: c }} />
      {t}
    </span>
  );
}
