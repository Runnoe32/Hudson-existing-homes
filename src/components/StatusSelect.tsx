"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STATUSES, STATUS_LABELS } from "@/lib/constants";
import { changeStatus } from "@/app/actions";

export function StatusSelect({
  parcelId,
  status,
  size = "md",
}: {
  parcelId: string;
  status: string;
  size?: "sm" | "md";
}) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    const prev = value;
    setValue(next);
    start(async () => {
      const res = await changeStatus(parcelId, next);
      if (!res?.ok) {
        setValue(prev);
        setMsg(res?.error ?? "Failed");
      } else {
        setMsg(res.stamped ? `dated ${res.stamped}` : null);
        router.refresh();
      }
    });
  }

  return (
    <span className="row-gap" style={{ gap: 6 }}>
      <select
        className={`badge st-${value}`}
        style={{
          border: "1px solid var(--border-strong)",
          padding: size === "sm" ? "2px 6px" : "5px 8px",
          borderRadius: 8,
          fontWeight: 600,
          cursor: "pointer",
        }}
        value={value}
        onChange={onChange}
        disabled={pending}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABELS[s]}
          </option>
        ))}
      </select>
      {msg && <span className="muted" style={{ fontSize: 11 }}>{msg}</span>}
    </span>
  );
}
