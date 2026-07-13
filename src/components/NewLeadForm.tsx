"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createLead, type CreateState } from "@/app/actions";
import { SOURCES } from "@/lib/constants";

export function NewLeadForm() {
  const [state, formAction, pending] = useActionState<CreateState | null, FormData>(
    createLead,
    null,
  );

  return (
    <form action={formAction} className="panel panel-pad">
      <p className="muted" style={{ marginTop: 0 }}>
        Just the essentials to create the record — fill in the rest (facts, scores, probate) on the
        detail page.
      </p>
      {state?.error && <div className="banner err">{state.error}</div>}
      <div className="fields">
        <div className="field span2">
          <label htmlFor="parcelId">Parcel ID *</label>
          <input id="parcelId" name="parcelId" required placeholder="020-1234-56-789" />
        </div>
        <div className="field span2">
          <label htmlFor="ownerName">Owner name</label>
          <input id="ownerName" name="ownerName" placeholder="Jane & John Doe" />
        </div>
        <div className="field span2">
          <label htmlFor="address">Situs address</label>
          <input id="address" name="address" placeholder="1234 County Rd A, Hudson, WI" />
        </div>
        <div className="field span2">
          <label htmlFor="source">Source</label>
          <select id="source" name="source" defaultValue="">
            <option value="">—</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="row-gap" style={{ justifyContent: "flex-end", marginTop: 14 }}>
        <Link href="/" className="btn">
          Cancel
        </Link>
        <button className="btn primary" type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create lead"}
        </button>
      </div>
    </form>
  );
}
