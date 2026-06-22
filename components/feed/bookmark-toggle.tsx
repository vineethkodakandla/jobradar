"use client";

import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToggleSaved } from "../hooks/use-saved";

export interface BookmarkToggleProps {
  jobId: number;
  saved: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function BookmarkToggle({
  jobId,
  saved,
  size = "sm",
  className,
}: BookmarkToggleProps) {
  const toggle = useToggleSaved();

  return (
    <button
      type="button"
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save job"}
      title={saved ? "Saved" : "Save"}
      disabled={toggle.isPending}
      onClick={(e) => {
        e.stopPropagation();
        toggle.mutate({ jobId, nextSaved: !saved });
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-md transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        saved ? "text-primary" : "text-muted-foreground",
        className,
      )}
    >
      <Bookmark
        className={cn(size === "sm" ? "h-4 w-4" : "h-5 w-5")}
        fill={saved ? "currentColor" : "none"}
      />
    </button>
  );
}
