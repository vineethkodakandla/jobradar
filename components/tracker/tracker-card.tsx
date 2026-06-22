"use client";

import * as React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Building2, CalendarClock, GripVertical } from "lucide-react";
import type { ApplicationWithJob } from "@/lib/types";
import { cn, locationLabel, relativeTime } from "@/lib/utils";
import { FitBadge } from "../feed/fit-badge";

export interface TrackerCardProps {
  app: ApplicationWithJob;
  onOpen: (app: ApplicationWithJob) => void;
  /** Rendered inside a DragOverlay (no sortable wiring). */
  overlay?: boolean;
}

export function TrackerCard({ app, onOpen, overlay }: TrackerCardProps) {
  const sortable = useSortable({
    id: app.id,
    data: { app },
    disabled: overlay,
  });

  const style: React.CSSProperties = overlay
    ? {}
    : {
        transform: CSS.Translate.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0.4 : 1,
      };

  const job = app.job;

  return (
    <div
      ref={overlay ? undefined : sortable.setNodeRef}
      style={style}
      className={cn(
        "group rounded-lg border border-border bg-card p-3 text-left shadow-sm",
        overlay && "cursor-grabbing shadow-lg ring-1 ring-primary/40",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          aria-label="Drag to move"
          className="mt-0.5 cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          {...(overlay ? {} : sortable.attributes)}
          {...(overlay ? {} : sortable.listeners)}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onOpen(app)}
          className="min-w-0 flex-1 text-left focus-visible:outline-none"
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
              {job.title}
            </h4>
            <FitBadge score={job.fit?.score ?? null} />
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            <span className="truncate">
              {job.company ?? "—"} · {locationLabel(job)}
            </span>
          </p>
          {(app.next_action || app.applied_at) && (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarClock className="h-3 w-3" />
              {app.next_action
                ? app.next_action
                : `Applied ${relativeTime(app.applied_at)}`}
            </p>
          )}
        </button>
      </div>
    </div>
  );
}
