"use client";

import { Bookmark, ExternalLink, KanbanSquare } from "lucide-react";
import type { JobWithFit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useToggleSaved } from "../hooks/use-saved";
import { useCreateApplication } from "../hooks/use-applications";

export interface JobActionsProps {
  job: JobWithFit;
}

export function JobActions({ job }: JobActionsProps) {
  const toggleSaved = useToggleSaved();
  const createApp = useCreateApplication();
  const tracked = job.application_status != null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Apply — real anchor (target=_blank) */}
      <a
        href={job.apply_url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        )}
      >
        Apply
        <ExternalLink className="h-4 w-4" />
      </a>

      <Button
        variant="outline"
        size="md"
        disabled={toggleSaved.isPending}
        aria-pressed={job.is_saved}
        onClick={() =>
          toggleSaved.mutate({ jobId: job.id, nextSaved: !job.is_saved })
        }
      >
        <Bookmark
          className="h-4 w-4"
          fill={job.is_saved ? "currentColor" : "none"}
        />
        {job.is_saved ? "Saved" : "Save"}
      </Button>

      <Button
        variant="outline"
        size="md"
        disabled={createApp.isPending || tracked}
        onClick={() =>
          createApp.mutate({ job_id: job.id, status: "saved" })
        }
      >
        <KanbanSquare className="h-4 w-4" />
        {tracked ? "In tracker" : "Track"}
      </Button>
    </div>
  );
}
