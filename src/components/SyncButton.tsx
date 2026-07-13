"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncFromCounty } from "@/app/actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const router = useRouter();

  function run() {
    setMsg(null);
    start(async () => {
      const r = await syncFromCounty();
      if (r.ok) {
        setMsg({
          ok: true,
          text: `Synced ${r.fetched} parcels — ${r.inserted} new, ${r.updated} refreshed, ${r.enrichedAttached} land-matched.`,
        });
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  return (
    <span className="row-gap" style={{ gap: 8 }}>
      <button className="btn primary" onClick={run} disabled={pending} title="Pull latest from the WI parcel layer">
        {pending ? "Syncing county data… (~1 min)" : "⟳ Sync from county"}
      </button>
      {msg && (
        <span className={`banner ${msg.ok ? "ok" : "err"}`} style={{ margin: 0, padding: "6px 10px" }}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
