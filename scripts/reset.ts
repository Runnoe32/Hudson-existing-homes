import path from "node:path";
import fs from "node:fs";

// Danger: deletes the local DB file so `db:migrate` + `seed` start clean.
const dataDir = path.join(process.cwd(), "data");
for (const f of ["leads.db", "leads.db-shm", "leads.db-wal"]) {
  const p = path.join(dataDir, f);
  if (fs.existsSync(p)) {
    fs.rmSync(p);
    console.log("removed", f);
  }
}
console.log("✔ db reset");
