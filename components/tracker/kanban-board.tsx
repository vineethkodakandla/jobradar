"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { KanbanSquare, LayoutGrid, Table2 } from "lucide-react";
import { toast } from "sonner";
import type { ApplicationWithJob, AppStatus } from "@/lib/types";
import { EmptyState } from "../ui/empty-state";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import {
  useApplications,
  usePatchApplication,
} from "../hooks/use-applications";
import { TrackerCard } from "./tracker-card";
import { TrackerDrawer } from "./tracker-drawer";
import { TrackerStats } from "./tracker-stats";
import { TrackerTable } from "./tracker-table";
import { KanbanColumn } from "./kanban-column";
import {
  columnForStatus,
  STATUS_LABELS,
  TRACKER_COLUMNS,
} from "./status-config";

type View = "board" | "table";
const VIEW_KEY = "jobradar-tracker-view";

export function KanbanBoard() {
  const { data: apps, isLoading, isError } = useApplications();
  const patch = usePatchApplication();

  const [activeId, setActiveId] = React.useState<number | null>(null);
  const [openApp, setOpenApp] = React.useState<ApplicationWithJob | null>(null);
  const [view, setView] = React.useState<View>("board");

  // Persisted view toggle (table vs board).
  React.useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "table" || saved === "board") setView(saved);
  }, []);
  const setViewPersist = (v: View) => {
    setView(v);
    window.localStorage.setItem(VIEW_KEY, v);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Keep the open drawer in sync with fresh data.
  React.useEffect(() => {
    if (openApp && apps) {
      const fresh = apps.find((a) => a.id === openApp.id);
      if (fresh && fresh !== openApp) setOpenApp(fresh);
    }
  }, [apps, openApp]);

  const byColumn = React.useMemo(() => {
    const map = new Map<AppStatus, ApplicationWithJob[]>();
    for (const c of TRACKER_COLUMNS) map.set(c.id, []);
    for (const a of apps ?? []) {
      const col = columnForStatus(a.status);
      map.get(col)?.push(a);
    }
    // Sort within each column by position then updated_at.
    for (const list of map.values()) {
      list.sort((a, b) => {
        const pa = a.position ?? Number.MAX_SAFE_INTEGER;
        const pb = b.position ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      });
    }
    return map;
  }, [apps]);

  const activeApp = React.useMemo(
    () => apps?.find((a) => a.id === activeId) ?? null,
    [apps, activeId],
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(Number(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const app = apps?.find((a) => a.id === Number(active.id));
    if (!app) return;

    // The drop target is either a column (droppable) or another card; resolve
    // the destination column either way.
    const overData = over.data.current as
      | { column?: AppStatus; app?: ApplicationWithJob }
      | undefined;
    const destColumn: AppStatus =
      overData?.column ??
      (overData?.app ? columnForStatus(overData.app.status) : columnForStatus(app.status));

    const fromColumn = columnForStatus(app.status);
    if (destColumn === fromColumn) return;

    const prevStatus = app.status;
    patch.mutate({ id: app.id, status: destColumn });

    toast.success(
      `Moved to ${STATUS_LABELS[destColumn]}`,
      {
        description: app.job.title,
        action: {
          label: "Undo",
          onClick: () => patch.mutate({ id: app.id, status: prevStatus }),
        },
        duration: 5000,
      },
    );
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <KanbanSquare className="h-5 w-5 text-primary" />
          Application tracker
        </h1>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          <Button
            variant={view === "board" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewPersist("board")}
            aria-pressed={view === "board"}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Board
          </Button>
          <Button
            variant={view === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewPersist("table")}
            aria-pressed={view === "table"}
          >
            <Table2 className="h-3.5 w-3.5" /> Table
          </Button>
        </div>
      </div>

      {!isLoading && !isError && apps && <TrackerStats apps={apps} />}

      {isLoading ? (
        <div className="flex gap-3 overflow-hidden">
          {TRACKER_COLUMNS.map((c) => (
            <Skeleton key={c.id} className="h-72 w-72 shrink-0" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          icon={KanbanSquare}
          title="Couldn't load the tracker"
          description="Try reloading the page."
        />
      ) : (apps?.length ?? 0) === 0 ? (
        <EmptyState
          icon={KanbanSquare}
          title="No applications tracked yet"
          description="Save a job and hit Track, or use the Track button on any job to start your pipeline."
        />
      ) : view === "table" ? (
        <TrackerTable apps={apps ?? []} onOpen={setOpenApp} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex flex-1 gap-3 overflow-x-auto scrollbar-thin pb-2">
            {TRACKER_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.id}
                column={col}
                apps={byColumn.get(col.id) ?? []}
                onOpen={setOpenApp}
              />
            ))}
          </div>
          <DragOverlay>
            {activeApp ? (
              <TrackerCard app={activeApp} onOpen={() => {}} overlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <TrackerDrawer app={openApp} onClose={() => setOpenApp(null)} />
    </div>
  );
}
