import { BOOL_KEYS, NUMBER_KEYS } from "./constants";

const TRUE_WORDS = new Set(["1", "true", "yes", "y", "t", "x"]);
const FALSE_WORDS = new Set(["0", "false", "no", "n", "f", ""]);

export function parseBool(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (raw == null) return null;
  const s = String(raw).trim().toLowerCase();
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return null;
}

export function parseNum(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  // Strip $ , and stray whitespace from county exports ("$465,000", "2,341 sf")
  const cleaned = String(raw).replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Normalize a variety of date inputs to ISO YYYY-MM-DD, or null. */
export function parseDate(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // M/D/YYYY or MM/DD/YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let [, mo, day, yr] = m;
    if (yr.length === 2) yr = "20" + yr;
    return `${yr}-${mo.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

/**
 * Coerce a raw string (from a form field or CSV cell) to the correct type for a
 * given lead column key. Empty → null (so blanks clear rather than write "").
 */
export function coerceValue(key: string, raw: unknown): unknown {
  if (BOOL_KEYS.has(key)) return parseBool(raw);
  if (NUMBER_KEYS.has(key)) return parseNum(raw);
  if (key === "nextActionDate") return parseDate(raw);
  const s = raw == null ? "" : String(raw).trim();
  return s === "" ? null : s;
}
