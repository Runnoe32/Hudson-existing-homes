/**
 * Generate a realistic 50-row "county parcel export" CSV for testing the import
 * flow. Headers deliberately differ from our field names so the column-mapping
 * step is exercised. Writes data/sample_county_export_50.csv (safe to commit —
 * fully synthetic).
 *
 * Run: pnpm sample-csv
 */
import Papa from "papaparse";
import fs from "node:fs";
import path from "node:path";

const FIRST = ["Gary", "Linda", "Dennis", "Sandra", "Roger", "Diane", "Wayne", "Cheryl", "Dale", "Nancy", "Curtis", "Joan", "Randy", "Peggy", "Duane", "Sharon", "Larry", "Connie", "Terry", "Gloria"];
const LAST = ["Nyberg", "Halvorson", "Petersen", "Schultz", "Erickson", "Berg", "Lund", "Aamodt", "Kubista", "Fritz", "Mattson", "Olander", "Buckley", "Stellrecht", "Dahlberg", "Weiss", "Kohler", "Steinmetz", "Runde", "Vitalis"];
const STREETS = ["190th St", "Cty Rd A", "Cty Rd F", "Cty Rd UU", "Trout Brook Rd", "Rustic Rd", "Oakridge Dr", "Willow Ln", "Cove Rd", "Ridgeview Ct", "Meadowbrook Rd", "Stageline Rd", "Quarry Rd", "Deerfield Ln", "Norway Pt"];
const MUNIS = [
  { name: "Town of Hudson", prefix: "018", zip: "54016", place: "Hudson" },
  { name: "Town of St. Joseph", prefix: "020", zip: "54016", place: "Hudson" },
  { name: "Town of Troy", prefix: "022", zip: "54016", place: "Hudson" },
  { name: "City of Hudson", prefix: "246", zip: "54016", place: "Hudson" },
  { name: "Village of North Hudson", prefix: "121", zip: "54016", place: "North Hudson" },
  { name: "Town of Warren", prefix: "020", zip: "54023", place: "Roberts" },
  { name: "Town of Kinnickinnic", prefix: "030", zip: "54022", place: "River Falls" },
];
const OUT_OF_AREA = [
  "8804 Xylon Ct N, Brooklyn Park, MN 55445",
  "305 Vine St, Stillwater, MN 55082",
  "12 Oakhill Dr, Woodbury, MN 55125",
  "44 Summit Ave, St. Paul, MN 55102",
  "9021 Lyndale Ave S, Bloomington, MN 55420",
];
const SOURCES = ["absentee", "drive-by", "expired-listing", "obit", ""];

// Deterministic PRNG so the file is stable across runs.
let s = 1337;
function rnd() {
  s = (s * 1103515245 + 12345) & 0x7fffffff;
  return s / 0x7fffffff;
}
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

const rows: Record<string, string | number>[] = [];
const usedParcels = new Set<string>();

for (let i = 0; i < 50; i++) {
  const m = pick(MUNIS);
  let parcel = "";
  do {
    parcel = `${m.prefix}-${int(1000, 1999)}-${int(10, 99)}-${String(int(0, 999)).padStart(3, "0")}`;
  } while (usedParcels.has(parcel));
  usedParcels.add(parcel);

  const owner = `${pick(FIRST)} & ${pick(FIRST)} ${pick(LAST)}`;
  const num = int(100, 1990);
  const street = pick(STREETS);
  const site = `${num} ${street}, ${m.place}, WI ${m.zip}`;
  const absentee = rnd() < 0.28;
  const mail = absentee ? pick(OUT_OF_AREA) : site;
  const assessed = int(360, 500) * 1000;

  rows.push({
    PARCEL_ID: parcel,
    SITE_ADDRESS: site,
    TAX_DISTRICT: m.name,
    OWNER_NAME: owner,
    MAIL_ADDRESS: mail,
    GIS_ACRES: (int(75, 1200) / 100).toFixed(2),
    YEAR_BUILT: int(1962, 2004),
    LIVING_SQFT: int(1850, 3200),
    BEDROOMS: int(3, 5),
    ASSESSED_TOTAL: `$${assessed.toLocaleString()}`,
    EST_FMV: `$${Math.round(assessed * 1.11).toLocaleString()}`,
    LOTTERY_CREDIT: absentee ? "N" : pick(["Y", "Y", "N"]),
    YRS_OWNED: int(4, 40),
    LEAD_SOURCE: absentee ? "absentee" : pick(SOURCES),
  });
}

const csv = Papa.unparse(rows);
const outDir = path.join(process.cwd(), "data");
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "sample_county_export_50.csv");
fs.writeFileSync(outPath, csv, "utf8");
console.log(`✔ wrote ${rows.length} rows → ${path.relative(process.cwd(), outPath)}`);
