"use client";

import type { ApplicationWithJob } from "@/lib/types";
import { columnForStatus, TRACKER_COLUMNS } from "./status-config";

export interface TrackerStatsProps {
  apps: ApplicationWithJob[];
}

/** A compact funnel strip: count per column. */
export function TrackerStats({ apps }: TrackerStatsProps) {
  const counts = new Map<string, number>();
  for (const a of apps) {
    const col = columnForStatus(a.status);
    counts.set(col, (counts.get(col) ?? 0) + 1);
  }
  const total = apps.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {TRACKER_COLUMNS.map((c) => {
        const n = counts.get(c.id) ?? 0;
        return (
          <div
            key={c.id}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs"
          >
            <span className={`h-2 w-2 rounded-full ${c.dot}`} aria-hidden />
            <span className="text-muted-foreground">{c.label}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {n}
            </span>
          </div>
        );
      })}
      <div className="ml-auto text-xs text-muted-foreground">
        {total} tracked
      </div>
    </div>
  );
}
