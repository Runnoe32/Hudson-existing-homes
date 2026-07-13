"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateField } from "@/app/actions";
import type { FieldDef } from "@/lib/constants";

function toInputValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

export function InlineField({
  id,
  def,
  value,
}: {
  id: number;
  def: FieldDef;
  value: unknown;
}) {
  const [val, setVal] = useState<string>(toInputValue(value));
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function commit(next: string) {
    if (next === toInputValue(value) && !saved) return; // nothing changed
    start(async () => {
      const res = await updateField(id, def.key, next);
      if (!res?.ok) {
        setErr(res?.error ?? "Save failed");
        setSaved(false);
      } else {
        setErr(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
        router.refresh(); // reflect recomputed total / date stamps elsewhere
      }
    });
  }

  const common = {
    disabled: pending,
    onBlur: () => commit(val),
  };

  return (
    <div className={`field${def.colSpan === 2 ? " span2" : ""}`}>
      <label htmlFor={`f-${def.key}`}>{def.label}</label>

      {def.type === "textarea" ? (
        <textarea
          id={`f-${def.key}`}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          {...common}
        />
      ) : def.type === "select" ? (
        <select
          id={`f-${def.key}`}
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            commit(e.target.value);
          }}
          disabled={pending}
        >
          <option value="">—</option>
          {def.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : def.type === "bool" ? (
        <select
          id={`f-${def.key}`}
          value={val === "true" ? "true" : val === "false" ? "false" : ""}
          onChange={(e) => {
            setVal(e.target.value);
            commit(e.target.value);
          }}
          disabled={pending}
        >
          <option value="">—</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      ) : (
        <input
          id={`f-${def.key}`}
          type={def.type === "number" ? "number" : def.type === "date" ? "date" : "text"}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && def.type !== "textarea") {
              (e.target as HTMLInputElement).blur();
            }
          }}
          {...common}
        />
      )}

      {err ? (
        <span className="fielderr">{err}</span>
      ) : (
        <span className="saved">{saved ? "✓ saved" : pending ? "saving…" : ""}</span>
      )}
    </div>
  );
}
