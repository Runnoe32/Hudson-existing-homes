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
  const absentee = params.get("absentee") === "1";
  const enriched = params.get("enriched") === "1";

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

      <label className="filter-check">
        <input type="checkbox" checked={absentee} onChange={(e) => setParam("absentee", e.target.checked ? "1" : "")} />
        Absentee
      </label>
      <label className="filter-check">
        <input type="checkbox" checked={enriched} onChange={(e) => setParam("enriched", e.target.checked ? "1" : "")} />
        Land-matched
      </label>

      {(type || status || min || absentee || enriched || params.get("q")) && (
        <button className="btn sm" onClick={() => router.push("/")}>
          Clear
        </button>
      )}
    </div>
  );
}
