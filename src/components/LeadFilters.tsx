"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";

export function LeadFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`/?${next.toString()}`);
  }

  const type = params.get("type") ?? "";
  const status = params.get("status") ?? "";
  const min = params.get("min") ?? "";
  const minac = params.get("minac") ?? "";
  const absentee = params.get("absentee") === "1";
  const enriched = params.get("enriched") === "1";
  const hidedep = params.get("hidedep") === "1";
  const sfh = params.get("sfh") === "1";
  // Assessed-value band. "450-600" is the current focus tier; the value maps to
  // minval/maxval params so the server can filter on assessedValue.
  const valueBand =
    params.get("minval") === "450000" && params.get("maxval") === "600000" ? "450-600" : "";

  function setValueBand(v: string) {
    const next = new URLSearchParams(params.toString());
    if (v === "450-600") {
      next.set("minval", "450000");
      next.set("maxval", "600000");
    } else {
      next.delete("minval");
      next.delete("maxval");
    }
    router.push(`/?${next.toString()}`);
  }

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

      <select className="filter-input" value={min} onChange={(e) => setParam("min", e.target.value)}>
        <option value="">Any score</option>
        <option value="12">Score ≥ 12 (letter)</option>
        <option value="9">Score ≥ 9 (watchlist)</option>
        <option value="6">Score ≥ 6</option>
      </select>

      <select className="filter-input" value={valueBand} onChange={(e) => setValueBand(e.target.value)}>
        <option value="">Any value</option>
        <option value="450-600">Assessed $450–600k</option>
      </select>

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

      {(type || status || min || valueBand || minac || absentee || enriched || hidedep || sfh || params.get("q")) && (
        <button className="btn sm" onClick={() => router.push("/")}>
          Clear
        </button>
      )}
    </div>
  );
}
