"use client";

import "leaflet/dist/leaflet.css";
import type { CircleMarker, Map as LMap } from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Lead } from "@/lib/types";
import type { LeadPin } from "@/db/queries";
import { ScoreBadge } from "./badges";
import { StatusSelect } from "./StatusSelect";
import { fmtMoney } from "@/lib/util";
import { parseLandData, summarizeLand } from "@/lib/land";

type ColorBy = "score" | "type";

const SATELLITE =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Score tiers (match the score badge): ≥12 letter, 9–11 watchlist, else low.
function scoreColor(total: number): string {
  return total >= 12 ? "#37b24d" : total >= 9 ? "#f5b301" : "#adb5bd";
}
// Parcel type: home-fit green, acreage/split purple.
function typeColor(t: string | null): string {
  return t === "acreage-split" ? "#9775fa" : "#37b24d";
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function signals(l: Lead): { text: string; cls: string }[] {
  const out: { text: string; cls: string }[] = [];
  if (l.absentee) out.push({ text: "absentee", cls: "" });
  if ((l.tenureYears ?? 0) >= 25) out.push({ text: `${l.tenureYears}yr`, cls: "" });
  if (l.source === "probate") out.push({ text: "probate", cls: "good" });
  const land = summarizeLand(parseLandData(l.landData));
  const bad = land?.flags.find((f) => f.cls === "bad");
  if (bad) out.push({ text: bad.text, cls: "warn" });
  return out;
}

export function LeadsExplorer({ rows, pins, total }: { rows: Lead[]; pins: LeadPin[]; total: number }) {
  const [colorBy, setColorBy] = useState<ColorBy>("score");
  const [selected, setSelected] = useState<string | null>(null);

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
      const m = L.circleMarker([p.lat, p.lon], {
        radius: 5,
        weight: 1,
        color: "rgba(0,0,0,0.45)",
        fillColor: color,
        fillOpacity: 0.9,
      });
      m.bindPopup(
        `<b>${esc(p.ownerName || "(unknown)")}</b><br/>score ${p.total} · ${p.parcelType ?? "—"}<br/>` +
          `<a href="/leads/${encodeURIComponent(p.parcelId)}">Open lead →</a>`,
      );
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

  // Fly to + highlight the selected lead.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const m = markers.current.get(selected);
    if (m) {
      map.flyTo(m.getLatLng(), Math.max(map.getZoom(), 14), { duration: 0.6 });
      m.openPopup();
    }
    document.getElementById(`row-${selected}`)?.scrollIntoView({ block: "nearest" });
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
          {colorBy === "score" ? (
            <>
              <Chip c="#37b24d" t="≥12 letter" />
              <Chip c="#f5b301" t="9–11 watch" />
              <Chip c="#adb5bd" t="<9" />
            </>
          ) : (
            <>
              <Chip c="#37b24d" t="home-fit" />
              <Chip c="#9775fa" t="acreage/split" />
            </>
          )}
        </div>
      </div>

      <div ref={mapEl} className="lead-map" />

      <div className="table-wrap" style={{ marginTop: 14 }}>
        <table className="leads">
          <thead>
            <tr>
              <th style={{ width: 66 }}>Score</th>
              <th>Owner / address</th>
              <th>Municipality</th>
              <th className="num">Acres</th>
              <th className="num">House val</th>
              <th className="num">Assessed</th>
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
