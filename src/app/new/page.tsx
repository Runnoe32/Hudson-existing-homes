import Link from "next/link";
import { NewLeadForm } from "@/components/NewLeadForm";

export const dynamic = "force-dynamic";

export default function NewLeadPage() {
  return (
    <main className="wrap" style={{ maxWidth: 620 }}>
      <div className="row-gap" style={{ marginBottom: 6 }}>
        <Link href="/" className="muted">
          ← All leads
        </Link>
      </div>
      <div className="page-head">
        <h1>New lead</h1>
      </div>
      <NewLeadForm />
    </main>
  );
}
