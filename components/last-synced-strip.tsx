"use client";

import { CircleAlert, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./ui/skeleton";
import { useLatestRun } from "./hooks/use-latest-run";

// Render a timestamp in America/New_York (ET) as "HH:MM".
const ET_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatEtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return ET_TIME.format(new Date(iso));
  } catch {
    return "—";
  }
}

export function LastSyncedStrip({ className }: { className?: string }) {
  const { data: run, isLoading } = useLatestRun();

  if (isLoading) {
    return <Skeleton className={cn("h-5 w-40", className)} />;
  }

  if (!run) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className,
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        No sync yet
      </span>
    );
  }

  const stamp = run.finished_at ?? run.started_at;
  const isError = run.status === "failed";
  const newCount = run.jobs_upserted ?? 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs",
        isError ? "text-fit-low" : "text-muted-foreground",
        className,
      )}
      title={`Last run status: ${run.status}`}
    >
      {isError ? (
        <CircleAlert className="h-3.5 w-3.5" />
      ) : (
        <Clock className="h-3.5 w-3.5" />
      )}
      <span>
        Synced {formatEtTime(stamp)} ET
      </span>
      {!isError && newCount > 0 && (
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
          {newCount} new
        </span>
      )}
      {run.status === "running" && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
          running…
        </span>
      )}
    </span>
  );
}
