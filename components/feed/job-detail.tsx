"use client";

import {
  Briefcase,
  Building2,
  Clock,
  DollarSign,
  MapPin,
  MousePointerClick,
  Radar,
} from "lucide-react";
import type { JobWithFit } from "@/lib/types";
import {
  experienceLabel,
  formatSalary,
  locationLabel,
  relativeTime,
  workTypeLabel,
} from "@/lib/utils";
import { EmptyState } from "../ui/empty-state";
import { Skeleton } from "../ui/skeleton";
import { useJob } from "../hooks/use-jobs";
import { AdzunaAttribution } from "./adzuna-attribution";
import { FitScorePanel } from "./fit-score-panel";
import { JobActions } from "./job-actions";
import { JobDescription } from "./job-description";
import { MetaPill } from "./meta-pill";

export interface JobDetailProps {
  jobId: number | null;
  /** When provided, render this job directly (standalone /jobs/[id] page). */
  job?: JobWithFit;
}

export function JobDetail({ jobId, job: jobProp }: JobDetailProps) {
  // Standalone page passes `job`; the feed passes `jobId` and we fetch.
  const query = useJob(jobProp ? null : jobId);
  const job = jobProp ?? query.data;

  if (!jobProp && jobId == null) {
    return (
      <EmptyState
        icon={MousePointerClick}
        title="Select a job"
        description="Pick a listing from the list to see its fit score, rationale, and full description."
        className="h-full"
      />
    );
  }

  if (!jobProp && query.isLoading) {
    return <JobDetailSkeleton />;
  }

  if (!job) {
    return (
      <EmptyState
        icon={Radar}
        title="Job not found"
        description="This listing may have been deactivated or removed."
        className="h-full"
      />
    );
  }

  const salary = formatSalary(
    job.salary_min,
    job.salary_max,
    job.salary_is_estimated,
  );
  const isAdzuna = job.source_slug === "adzuna";

  return (
    <article className="space-y-5 p-5">
      {/* Header */}
      <header className="space-y-2">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight text-foreground">
              {job.title}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {job.company ?? "Unknown company"} · {locationLabel(job)}
              {job.posted_at && <> · {relativeTime(job.posted_at)}</>}
            </p>
          </div>
        </div>
      </header>

      {/* Meta pills */}
      <div className="flex flex-wrap items-center gap-2">
        {salary && <MetaPill icon={DollarSign} label={salary} />}
        <MetaPill
          icon={Briefcase}
          label={experienceLabel(job.experience_level)}
        />
        <MetaPill icon={MapPin} label={workTypeLabel(job.work_type)} />
        {job.posted_at && (
          <MetaPill icon={Clock} label={relativeTime(job.posted_at)} />
        )}
        {/* Source pill — Adzuna requires the linked attribution (§4). */}
        {isAdzuna ? (
          <AdzunaAttribution href={job.apply_url} />
        ) : (
          job.source_name && (
            <MetaPill label={`via ${job.source_name}`} />
          )
        )}
      </div>

      {/* Actions */}
      <JobActions job={job} />

      {/* Fit score */}
      <FitScorePanel fit={job.fit} />

      {/* Description */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Description</h2>
        <JobDescription description={job.description} />
      </section>
    </article>
  );
}

function JobDetailSkeleton() {
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-start gap-3">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-24" />
        <Skeleton className="h-7 w-16" />
      </div>
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-32 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  );
}
