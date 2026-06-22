"use client";

import * as React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { ApplicationWithJob } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrackerCard } from "./tracker-card";
import type { TrackerColumn } from "./status-config";

export interface KanbanColumnProps {
  column: TrackerColumn;
  apps: ApplicationWithJob[];
  onOpen: (app: ApplicationWithJob) => void;
}

export function KanbanColumn({ column, apps, onOpen }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column: column.id },
  });

  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg border border-border bg-muted/30">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className={cn("h-2 w-2 rounded-full", column.dot)} aria-hidden />
        <span className="text-sm font-semibold text-foreground">
          {column.label}
        </span>
        <span className="ml-auto rounded-full bg-card px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
          {apps.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto scrollbar-thin p-2 transition-colors",
          isOver && "bg-primary/5",
        )}
      >
        <SortableContext
          items={apps.map((a) => a.id)}
          strategy={verticalListSortingStrategy}
        >
          {apps.map((app) => (
            <TrackerCard key={app.id} app={app} onOpen={onOpen} />
          ))}
        </SortableContext>
        {apps.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-muted-foreground">
            Drop here
          </p>
        )}
      </div>
    </div>
  );
}
