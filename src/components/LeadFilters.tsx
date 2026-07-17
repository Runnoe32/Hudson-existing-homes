"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";

export function LeadFilters({ municipalities = [] }: { municipalities?: string[] }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function push(next: URLSearchParams) {
    const s = next.toString();
    router.push(s ? `/?${s}` : "/");
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    push(next);
  }

  const type = params.get("type") ?? "";
  const status = params.get("status") ?? "";
  const muni = params.get("muni") ?? "";
  const min = params.get("min") ?? "";
  const minac = params.get("minac") ?? "";
  const absentee = params.get("absentee") === "1";
  const enriched = params.get("enriched") === "1";
  const hidedep = params.get("hidedep") === "1";
  const sfh = params.get("sfh") === "1";

  const RANGE_KEYS = ["minval", "maxval", "minimp", "maximp", "maxac"];
  const anyActive =
    type ||
    status ||
    muni ||
    min ||
    minac ||
    absentee ||
    enriched ||
    hidedep ||
    sfh ||
    params.get("q") ||
    RANGE_KEYS.some((k) => params.get(k));

  return (
    <div className="filters">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", q);
        }}
        style={{ display: "contents" }}
      >
        <input
          className="filter-input"
          placeholder="Search owner / address / parcel…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>

      <select className="filter-input" value={type} onChange={(e) => setParam("type", e.target.value)}>
        <option value="">All types</option>
        <option value="home-fit">Home-fit</option>
        <option value="acreage-split">Acreage / split</option>
      </select>

      <select className="filter-input" value={status} onChange={(e) => setParam("status", e.target.value)}>
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>

      <select className="filter-input" value={muni} onChange={(e) => setParam("muni", e.target.value)}>
        <option value="">All municipalities</option>
        {municipalities.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select className="filter-input" value={min} onChange={(e) => setParam("min", e.target.value)}>
        <option value="">Any score</option>
        <option value="12">Score ≥ 12 (letter)</option>
        <option value="9">Score ≥ 9 (watchlist)</option>
        <option value="6">Score ≥ 6</option>
      </select>

      <RangeFilter
        label="Assessed $"
        minKey="minval"
        maxKey="maxval"
        params={params}
        setParam={setParam}
      />

      <RangeFilter
        label="House $"
        minKey="minimp"
        maxKey="maximp"
        params={params}
        setParam={setParam}
      />

      <select className="filter-input" value={minac} onChange={(e) => setParam("minac", e.target.value)}>
        <option value="">Any size</option>
        <option value="1">≥ 1 acre</option>
        <option value="2">≥ 2 acres</option>
        <option value="3">≥ 3 acres</option>
        <option value="5">≥ 5 acres</option>
      </select>

      <label className="filter-check">
        <input type="checkbox" checked={absentee} onChange={(e) => setParam("absentee", e.target.checked ? "1" : "")} />
        Absentee
      </label>
      <label className="filter-check">
        <input type="checkbox" checked={enriched} onChange={(e) => setParam("enriched", e.target.checked ? "1" : "")} />
        Land-matched
      </label>
      <label className="filter-check">
        <input type="checkbox" checked={hidedep} onChange={(e) => setParam("hidedep", e.target.checked ? "1" : "")} />
        Hide rentals/institutional
      </label>
      <label className="filter-check" title="Best-effort: excludes twin-home / townhome units we can detect (unit-designator addresses, twin/townhome owner names, and same-owner same-street clusters). Building type isn't in the free parcel data, so confirm SFH per finalist.">
        <input type="checkbox" checked={sfh} onChange={(e) => setParam("sfh", e.target.checked ? "1" : "")} />
        Single-family only
      </label>

      {anyActive && (
        <button className="btn sm" onClick={() => router.push("/")}>
          Clear
        </button>
      )}
    </div>
  );
}

/**
 * A min/max numeric range bound to two URL params. Commits on blur or Enter (not
 * per keystroke) so typing a dollar amount doesn't fire a navigation each digit.
 * Accepts "450k"/"1.2m"/"$450,000" shorthand.
 */
function RangeFilter({
  label,
  minKey,
  maxKey,
  params,
  setParam,
}: {
  label: string;
  minKey: string;
  maxKey: string;
  params: URLSearchParams;
  setParam: (key: string, value: string) => void;
}) {
  return (
    <span className="range-filter" title={`${label} range`}>
      <span className="range-label">{label}</span>
      <RangeInput placeholder="min" initial={params.get(minKey) ?? ""} commit={(v) => setParam(minKey, v)} />
      <span className="range-dash">–</span>
      <RangeInput placeholder="max" initial={params.get(maxKey) ?? ""} commit={(v) => setParam(maxKey, v)} />
    </span>
  );
}

function parseAmount(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/[$,\s]/g, "");
  if (!s) return "";
  const m = s.match(/^([0-9]*\.?[0-9]+)(k|m)?$/);
  if (!m) return "";
  let n = parseFloat(m[1]);
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m") n *= 1_000_000;
  return String(Math.round(n));
}

function RangeInput({
  placeholder,
  initial,
  commit,
}: {
  placeholder: string;
  initial: string;
  commit: (value: string) => void;
}) {
  const [v, setV] = useState(initial);
  // Keep the box in sync when the URL changes elsewhere (e.g. Clear).
  const [seen, setSeen] = useState(initial);
  if (initial !== seen) {
    setSeen(initial);
    setV(initial);
  }
  function fire() {
    const parsed = parseAmount(v);
    setV(parsed);
    if (parsed !== initial) commit(parsed);
  }
  return (
    <input
      className="filter-input range-num"
      inputMode="numeric"
      placeholder={placeholder}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={fire}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}
