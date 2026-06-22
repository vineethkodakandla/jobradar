import { getFitTier } from "@/lib/fit";
import { cn } from "@/lib/utils";

export interface FitBadgeProps {
  score: number | null | undefined;
  /** sm = compact pill for cards; md = larger for headers. */
  size?: "sm" | "md";
  showBand?: boolean;
  className?: string;
}

/**
 * The fit-score pill. Colors come from getFitTier (the single source of truth);
 * never hardcode score->color here.
 */
export function FitBadge({
  score,
  size = "sm",
  showBand = false,
  className,
}: FitBadgeProps) {
  if (score == null) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border border-border bg-muted font-semibold text-muted-foreground",
          size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
          className,
        )}
        title="Not yet scored"
      >
        —
      </span>
    );
  }
  const tier = getFitTier(score);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-semibold tabular-nums",
        tier.text,
        tier.bg,
        tier.border,
        size === "sm" ? "px-1.5 py-0.5 text-xs" : "px-2 py-1 text-sm",
        className,
      )}
      title={`${tier.band} fit — ${score}/100`}
    >
      {score}
      {showBand && <span className="font-medium">· {tier.band}</span>}
    </span>
  );
}
