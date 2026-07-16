import { STATUS_LABELS, type Status } from "@/lib/constants";
import { scoreTier } from "@/lib/scoring";
import type { OwnerCategory } from "@/lib/priority";

const CATEGORY_META: Record<
  Exclude<OwnerCategory, null>,
  { label: string; title: string; cls: string }
> = {
  "rental-portfolio": {
    label: "rental",
    title:
      "Active rental / investor portfolio — a landlord running this as a business. Low sell-probability; deprioritized in the default sort.",
    cls: "cat-rental",
  },
  institutional: {
    label: "institutional",
    title:
      "Institutional owner (government / church / HOA / utility / healthcare) — not a homeowner-outreach target. Deprioritized in the default sort.",
    cls: "cat-inst",
  },
  developer: {
    label: "developer",
    title: "Developer / builder — may hold this as inventory and be a willing seller.",
    cls: "cat-dev",
  },
};

export function CategoryBadge({ category }: { category: OwnerCategory }) {
  if (!category) return null;
  const m = CATEGORY_META[category];
  return (
    <span className={`badge-cat ${m.cls}`} title={m.title}>
      {m.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as Status] ?? status;
  return (
    <span className={`badge st-${status}`}>
      <span className="dot" />
      {label}
    </span>
  );
}

export function EstateBadge() {
  return (
    <span
      className="badge-estate"
      title="Owner deceased (obituary) — route to the estate/probate MAIL channel via the personal representative; do not cold-call heirs (§2)"
    >
      ⚰ estate
    </span>
  );
}

export function ScoreBadge({
  total,
  fit,
  motivation,
}: {
  total: number;
  fit?: number | null;
  motivation?: number | null;
}) {
  const tier = scoreTier(total);
  return (
    <span className="row-gap" style={{ gap: 6 }}>
      <span className={`score tier-${tier}`}>{total}</span>
      {fit != null && motivation != null && (
        <span className="score-parts">
          {fit}+{motivation}
        </span>
      )}
    </span>
  );
}
