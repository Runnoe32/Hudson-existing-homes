"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addNote } from "@/app/actions";

export function NoteComposer({ parcelId }: { parcelId: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function submit() {
    const text = body.trim();
    if (!text) return;
    start(async () => {
      const res = await addNote(parcelId, text);
      if (res?.ok) {
        setBody("");
        router.refresh();
      }
    });
  }

  return (
    <div className="log-composer">
      <textarea
        placeholder="Add a note (call outcome, drive-by, letter mailed…)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
        disabled={pending}
      />
      <div className="row-gap" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="muted" style={{ fontSize: 11 }}>⌘/Ctrl + Enter to save</span>
        <button className="btn primary sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Saving…" : "Add note"}
        </button>
      </div>
    </div>
  );
}
