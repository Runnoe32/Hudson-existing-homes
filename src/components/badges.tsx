import { STATUS_LABELS, type Status } from "@/lib/constants";
import { scoreTier } from "@/lib/scoring";

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status as Status] ?? status;
  return (
    <span className={`badge st-${status}`}>
      <span className="dot" />
      {label}
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
