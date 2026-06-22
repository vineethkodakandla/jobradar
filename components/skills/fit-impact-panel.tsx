"use client";

import { TrendingUp } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import { useFitImpactCount } from "../hooks/use-fit-impact";

export interface FitImpactPanelProps {
  /** The fit threshold to count against (default 70 per §9). */
  threshold?: number;
  /** True while a profile save is in flight (scores recompute on next run). */
  pendingRecompute?: boolean;
}

/**
 * "Jobs >= N fit: X" — recomputed after the profile is saved. Note: actual
 * re-scoring happens in the daily/manual scrape run (server-side), so this
 * count reflects the *current* precomputed scores. After a save we show a hint
 * that the count updates once the next run re-scores.
 */
export function FitImpactPanel({
  threshold = 70,
  pendingRecompute,
}: FitImpactPanelProps) {
  const { data: count, isLoading } = useFitImpactCount(threshold);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Fit impact</h3>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        {isLoading ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <span className="text-3xl font-bold tabular-nums text-foreground">
            {count ?? 0}
          </span>
        )}
        <span className="text-sm text-muted-foreground">
          jobs ≥ {threshold} fit
        </span>
      </div>
      {/* deferred (v1): before/after sparkline + top-3 fit movers after a save */}
      <p className="mt-2 text-xs text-muted-foreground">
        {pendingRecompute
          ? "Saved. Scores recompute on the next scrape run — hit “Scrape now” in Settings to refresh immediately."
          : "Reflects the latest computed scores. Editing weights changes scores after the next run re-scores all active jobs."}
      </p>
    </div>
  );
}
