"use client";

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { useRefresh } from "./hooks/use-refresh";

export interface RefreshButtonProps {
  /** Compact icon-only (topbar) vs. labelled (settings). */
  labelled?: boolean;
  className?: string;
}

export function RefreshButton({ labelled, className }: RefreshButtonProps) {
  const refresh = useRefresh();
  const pending = refresh.isPending;

  if (labelled) {
    return (
      <Button
        variant="outline"
        size="md"
        disabled={pending}
        onClick={() => refresh.mutate()}
        className={className}
      >
        <RefreshCw
          className={cn("h-4 w-4", pending && "motion-safe:animate-spin")}
        />
        {pending ? "Queuing…" : "Scrape now"}
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={pending}
      onClick={() => refresh.mutate()}
      aria-label="Refresh jobs"
      title="Refresh jobs (manual scrape)"
      className={className}
    >
      <RefreshCw
        className={cn("h-4 w-4", pending && "motion-safe:animate-spin")}
      />
    </Button>
  );
}
