"use client";

import * as React from "react";
import { Building2, Clock, DollarSign } from "lucide-react";
import type { JobWithFit } from "@/lib/types";
import {
  cn,
  experienceLabel,
  formatSalary,
  locationLabel,
  relativeTime,
  workTypeLabel,
} from "@/lib/utils";
import { FitBadge } from "./fit-badge";
import { BookmarkToggle } from "./bookmark-toggle";

export interface JobListCardProps {
  job: JobWithFit;
  isSelected: boolean;
  onSelect: () => void;
}

function JobListCardImpl({ job, isSelected, onSelect }: JobListCardProps) {
  const salary = formatSalary(
    job.salary_min,
    job.salary_max,
    job.salary_is_estimated,
  );

  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={-1}
      onClick={onSelect}
      className={cn(
        "group cursor-pointer border-b border-border px-4 py-3 transition-colors",
        "focus-visible:outline-none",
        isSelected
          ? "border-l-2 border-l-primary bg-accent/60 pl-[14px]"
          : "border-l-2 border-l-transparent hover:bg-muted/50 pl-[14px]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {job.title}
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <FitBadge score={job.fit?.score ?? null} />
          <BookmarkToggle jobId={job.id} saved={job.is_saved} />
        </div>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
        {job.company && (
          <span className="inline-flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {job.company}
          </span>
        )}
        <span aria-hidden="true">·</span>
        <span>{workTypeLabel(job.work_type)}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{locationLabel(job)}</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {salary && (
          <span className="inline-flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {salary}
          </span>
        )}
        <span>{experienceLabel(job.experience_level)}</span>
        {job.posted_at && (
          <span className="ml-auto inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {relativeTime(job.posted_at)}
          </span>
        )}
      </div>

      {job.application_status && (
        <div className="mt-1.5">
          <span className="inline-flex rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
            {job.application_status.replace("_", " ")}
          </span>
        </div>
      )}
    </div>
  );
}

// Memoized: the virtualized list re-renders rows often.
export const JobListCard = React.memo(
  JobListCardImpl,
  (prev, next) =>
    prev.job.id === next.job.id &&
    prev.isSelected === next.isSelected &&
    prev.job.is_saved === next.job.is_saved &&
    prev.job.application_status === next.job.application_status &&
    prev.job.fit?.score === next.job.fit?.score,
);
