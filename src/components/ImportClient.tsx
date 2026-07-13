"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import Link from "next/link";
import {
  IMPORTABLE_KEYS,
  IMPORT_FIELD_LABELS,
  type ImportableKey,
} from "@/lib/constants";
import { guessMapping } from "@/lib/csv";
import { importLeads, type ImportResult } from "@/app/actions";

type Row = Record<string, string>;
type Mapping = Record<string, ImportableKey | "">;

export function ImportClient() {
  const [fileName, setFileName] = useState<string>("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function onFile(file: File) {
    setResult(null);
    setParseError(null);
    setFileName(file.name);
    Papa.parse<Row>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const hdrs = (res.meta.fields ?? []).filter((h) => h && h.length > 0);
        if (hdrs.length === 0) {
          setParseError("No header row detected in this CSV.");
          return;
        }
        setHeaders(hdrs);
        setRows(res.data as Row[]);
        setMapping(guessMapping(hdrs));
      },
      error: (err) => setParseError(err.message),
    });
  }

  // Which lead keys are already claimed (to prevent mapping two columns to one field)
  const claimed = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [h, k] of Object.entries(mapping)) if (k) m[k] = h;
    return m;
  }, [mapping]);

  const parcelMapped = Object.values(mapping).includes("parcelId");
  const mappedCount = Object.values(mapping).filter(Boolean).length;

  function setCol(header: string, key: ImportableKey | "") {
    setMapping((prev) => {
      const next = { ...prev };
      // If this key was claimed by another header, release that one.
      if (key) {
        for (const h of Object.keys(next)) {
          if (h !== header && next[h] === key) next[h] = "";
        }
      }
      next[header] = key;
      return next;
    });
  }

  function doImport() {
    // Build objects keyed by lead field from the mapping.
    const mapped: Partial<Record<ImportableKey, string>>[] = rows.map((r) => {
      const o: Partial<Record<ImportableKey, string>> = {};
      for (const [header, key] of Object.entries(mapping)) {
        if (!key) continue;
        const v = r[header];
        if (v != null && String(v).trim() !== "") o[key] = String(v).trim();
      }
      return o;
    });
    start(async () => {
      const res = await importLeads(mapped);
      setResult(res);
      router.refresh();
    });
  }

  function reset() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
    setParseError(null);
  }

  return (
    <div>
      {parseError && <div className="banner err">{parseError}</div>}

      {headers.length === 0 ? (
        <label className="dropzone" style={{ display: "block", cursor: "pointer" }}>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>
            Choose a CSV file
          </div>
          <div style={{ marginTop: 6 }}>
            A county parcel export or any CSV with a header row. You&apos;ll map columns next.
          </div>
        </label>
      ) : (
        <>
          <div className="row-gap" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <div>
              <b>{fileName}</b>{" "}
              <span className="muted">
                · {rows.length} rows · {headers.length} columns · {mappedCount} mapped
              </span>
            </div>
            <button className="btn sm" onClick={reset} disabled={pending}>
              Choose different file
            </button>
          </div>

          {!parcelMapped && (
            <div className="banner err">
              Map one column to <b>Parcel ID</b> — it&apos;s the dedupe key and is required to
              import.
            </div>
          )}

          {result ? (
            <div className="banner ok">
              <b>Import complete.</b> {result.inserted} inserted, {result.skipped} duplicate
              {result.skipped === 1 ? "" : "s"} skipped
              {result.errors.length ? `, ${result.errors.length} row error(s)` : ""}.{" "}
              <Link href="/">View leads →</Link>
              {result.skippedParcels.length > 0 && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Skipped (already present): {result.skippedParcels.join(", ")}
                  {result.skipped > result.skippedParcels.length ? ", …" : ""}
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {result.errors.slice(0, 5).join(" ")}
                </div>
              )}
            </div>
          ) : (
            <div className="banner info">
              Review the mapping below (auto-guessed from headers). Set anything wrong to the right
              field, or <b>Ignore</b>. Existing parcels are skipped, not overwritten.
            </div>
          )}

          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table className="map-table">
              <thead>
                <tr>
                  <th style={{ width: "30%" }}>CSV column</th>
                  <th style={{ width: "30%" }}>Sample value</th>
                  <th style={{ width: "40%" }}>Import as</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h) => {
                  const sample = rows.find((r) => r[h] && String(r[h]).trim() !== "")?.[h] ?? "";
                  return (
                    <tr key={h}>
                      <td>
                        <code>{h}</code>
                      </td>
                      <td className="sample" title={sample}>
                        {sample || <span className="muted">(empty)</span>}
                      </td>
                      <td>
                        <select
                          value={mapping[h] ?? ""}
                          onChange={(e) => setCol(h, e.target.value as ImportableKey | "")}
                        >
                          <option value="">— Ignore —</option>
                          {IMPORTABLE_KEYS.map((k) => (
                            <option
                              key={k}
                              value={k}
                              disabled={!!claimed[k] && claimed[k] !== h}
                            >
                              {IMPORT_FIELD_LABELS[k]}
                              {claimed[k] && claimed[k] !== h ? " (used)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="row-gap" style={{ justifyContent: "flex-end" }}>
            {!result && (
              <button
                className="btn primary"
                onClick={doImport}
                disabled={pending || !parcelMapped || rows.length === 0}
              >
                {pending ? "Importing…" : `Import ${rows.length} rows`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
