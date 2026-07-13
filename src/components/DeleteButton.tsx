"use client";

import { useTransition } from "react";
import { deleteLead } from "@/app/actions";

export function DeleteButton({ id, label }: { id: number; label: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      className="btn danger sm"
      disabled={pending}
      onClick={() => {
        if (confirm(`Delete lead "${label}"? This cannot be undone.`)) {
          start(() => deleteLead(id));
        }
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
