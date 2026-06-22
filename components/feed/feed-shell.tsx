"use client";

import * as React from "react";
import { parseAsInteger, useQueryState } from "nuqs";
import type { SortKey } from "@/lib/filters";
import { useJobFilters } from "../hooks/use-job-filters";
import { SplitView } from "../split-view";
import { ActiveFilterChips } from "./active-filter-chips";
import { FilterRail, FilterRailSheet } from "./filter-rail";
import { JobDetail } from "./job-detail";
import { JobList } from "./job-list";

export interface FeedShellProps {
  /** Scope the feed to saved jobs (the /saved page). */
  savedOnly?: boolean;
}

/**
 * The three-pane feed: FilterRail | JobList | JobDetail. Selected job id lives
 * in the URL as ?job=ID (nuqs) so it's deep-linkable. Filter state also lives
 * in the URL via useJobFilters.
 */
export function FeedShell({ savedOnly = false }: FeedShellProps) {
  const controller = useJobFilters(savedOnly);
  const [selectedId, setSelectedId] = useQueryState(
    "job",
    parseAsInteger.withOptions({ history: "replace" }),
  );

  const onSelect = React.useCallback(
    (id: number) => void setSelectedId(id),
    [setSelectedId],
  );
  const onSortChange = React.useCallback(
    (sort: SortKey) => controller.set({ sort }),
    [controller],
  );

  const listPane = (
    <div className="flex h-full flex-col">
      {/* Mobile filter trigger + active chips */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
        <FilterRailSheet controller={controller} scopedSaved={savedOnly} />
      </div>
      <ActiveFilterChips controller={controller} />
      <div className="min-h-0 flex-1">
        <JobList
          filters={controller.filters}
          selectedId={selectedId}
          onSelect={onSelect}
          onSortChange={onSortChange}
        />
      </div>
    </div>
  );

  return (
    <SplitView
      left={<FilterRail controller={controller} scopedSaved={savedOnly} />}
      middle={listPane}
      right={<JobDetail jobId={selectedId} />}
      rightOpen={selectedId != null}
      onCloseRight={() => void setSelectedId(null)}
    />
  );
}
