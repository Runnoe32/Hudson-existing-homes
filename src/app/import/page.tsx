import { ImportClient } from "@/components/ImportClient";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <main className="wrap" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div>
          <h1>Import CSV</h1>
          <div className="sub">
            Map columns on upload · dedupe on parcel_id (existing parcels are skipped)
          </div>
        </div>
      </div>
      <ImportClient />
    </main>
  );
}
