/**
 * Pull existing-home parcels from the county/state parcel layer into the tracker.
 * Run: pnpm sync   (needs network; Claude's sandbox needs dangerouslyDisableSandbox)
 */
import { syncHomes } from "../src/db/sync";

const t0 = Date.now();
syncHomes()
  .then((r) => {
    console.log("✔ county sync complete");
    console.log(`  fetched:  ${r.fetched}`);
    console.log(`  inserted: ${r.inserted}`);
    console.log(`  updated:  ${r.updated}`);
    console.log(`  land-enrichment attached: ${r.enrichedAttached}`);
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  })
  .catch((e) => {
    console.error("✗ sync failed:", e.message);
    process.exit(1);
  });
