"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Briefcase, SearchX } from "lucide-react";
import type { JobWithFit } from "@/lib/types";
import type { JobFilters, SortKey } from "@/lib/filters";
import { EmptyState } from "../ui/empty-state";
import { Skeleton } from "../ui/skeleton";
import { Spinner } from "../ui/spinner";
import { flattenJobs, totalJobs, useJobs } from "../hooks/use-jobs";
import { useToggleSaved } from "../hooks/use-saved";
import { JobListCard } from "./job-list-card";
import { SortMenu } from "./sort-menu";

const ESTIMATED_ROW = 116;

export interface JobListProps {
  filters: JobFilters;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onSortChange: (sort: SortKey) => void;
}

export function JobList({
  filters,
  selectedId,
  onSelect,
  onSortChange,
}: JobListProps) {
  const query = useJobs(filters);
  const toggleSaved = useToggleSaved();

  const jobs = React.useMemo(() => flattenJobs(query.data), [query.data]);
  const total = totalJobs(query.data);

  const parentRef = React.useRef<HTMLDivElement>(null);
  const {
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isLoading,
    isError,
    error,
  } = query;

  const rowCount = hasNextPage ? jobs.length + 1 : jobs.length;
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW,
    overscan: 8,
  });

  // Fetch next page when the sentinel row scrolls into view.
  const virtualItems = virtualizer.getVirtualItems();
  React.useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= jobs.length - 1 && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [virtualItems, jobs.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // --- Keyboard navigation: j/k move, Enter open, s save ---------------------
  const selectedIndex = React.useMemo(
    () => jobs.findIndex((j) => j.id === selectedId),
    [jobs, selectedId],
  );

  const move = React.useCallback(
    (delta: number) => {
      if (jobs.length === 0) return;
      const base = selectedIndex < 0 ? (delta > 0 ? -1 : 0) : selectedIndex;
      const next = Math.max(0, Math.min(jobs.length - 1, base + delta));
      const job = jobs[next];
      if (job) {
        onSelect(job.id);
        virtualizer.scrollToIndex(next, { align: "auto" });
      }
    },
    [jobs, selectedIndex, onSelect, virtualizer],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "j") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter" && selectedIndex >= 0) {
        e.preventDefault();
        onSelect(jobs[selectedIndex]!.id);
      } else if (e.key === "s" && selectedIndex >= 0) {
        e.preventDefault();
        const job: JobWithFit = jobs[selectedIndex]!;
        toggleSaved.mutate({ jobId: job.id, nextSaved: !job.is_saved });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move, jobs, selectedIndex, onSelect, toggleSaved]);

  return (
    <div className="flex h-full flex-col">
      {/* deferred (v1): compare / bulk-select toolbar would sit above the header */}
      {/* Header: "N of M jobs" + sort */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <p className="text-sm font-medium text-foreground">
          {isLoading ? (
            <Skeleton className="h-4 w-24" />
          ) : (
            <>
              <span className="tabular-nums">{jobs.length}</span>
              <span className="text-muted-foreground">
                {" "}
                of <span className="tabular-nums">{total}</span> jobs
              </span>
            </>
          )}
        </p>
        <SortMenu value={filters.sort} onChange={onSortChange} />
      </div>

      {/* List */}
      <div
        ref={parentRef}
        role="listbox"
        aria-label="Job results"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {isLoading ? (
          <JobListSkeletonRows />
        ) : isError ? (
          <EmptyState
            icon={SearchX}
            title="Couldn't load jobs"
            description={error?.message ?? "Something went wrong."}
          />
        ) : jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No jobs match your filters"
            description="Try widening the fit threshold, clearing role keywords, or expanding the date range."
          />
        ) : (
          <div
            style={{
              height: virtualizer.getTotalSize(),
              position: "relative",
              width: "100%",
            }}
          >
            {virtualItems.map((vi) => {
              const isLoaderRow = vi.index >= jobs.length;
              const job = jobs[vi.index];
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {isLoaderRow ? (
                    <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                      {isFetchingNextPage && <Spinner className="h-3.5 w-3.5" />}
                      {isFetchingNextPage ? "Loading more…" : ""}
                    </div>
                  ) : job ? (
                    <JobListCard
                      job={job}
                      isSelected={job.id === selectedId}
                      onSelect={() => onSelect(job.id)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function JobListSkeletonRows() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-5 w-9" />
          </div>
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
