// Small shared utilities.

/** Local date as ISO YYYY-MM-DD (not UTC — the "Today" queue is local-day based). */
export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60_000);
  return local.toISOString().slice(0, 10);
}

/** Format a unix-epoch Date (from Drizzle timestamp mode) for display. */
export function fmtTimestamp(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return "$" + Math.round(n).toLocaleString();
}
