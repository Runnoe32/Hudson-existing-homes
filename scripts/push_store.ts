/**
 * Push the local data/leads.json into whatever the store points at. Run WITH the
 * Upstash env vars set (they're in .env.local) to populate the cloud DB:
 *   pnpm push-store
 * With no creds it just rewrites the local file (no-op-ish).
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "./loadenv";
import { putMany, usingRedis } from "../src/db/store";
import type { Lead } from "../src/lib/types";

loadEnvLocal(); // populate KV_* before the store reads them (getRedis runs at call time)

const file = path.join(process.cwd(), "data", "leads.json");
if (!fs.existsSync(file)) {
  console.error("no data/leads.json — run the sync first");
  process.exit(1);
}
const all = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Lead>;
const leads = Object.values(all);

putMany(leads)
  .then(() => console.log(`✔ pushed ${leads.length} leads to ${usingRedis() ? "Upstash Redis" : "local file"}`))
  .catch((e) => {
    console.error("✗ push failed:", e.message);
    process.exit(1);
  });
