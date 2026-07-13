import fs from "node:fs";

/** Minimal .env.local loader for standalone tsx scripts (tsx doesn't auto-load it). */
export function loadEnvLocal(file = ".env.local"): void {
  try {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2].trim().replace(/^["']|["']$/g, "");
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* no .env.local — fine (local file store) */
  }
}
