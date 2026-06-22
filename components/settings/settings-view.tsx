"use client";

import * as React from "react";
import {
  CircleAlert,
  Download,
  Filter,
  RadioTower,
  Settings as SettingsIcon,
} from "lucide-react";
import type { JobsResponse, JobWithFit } from "@/lib/types";
import { FILTER_DEFAULTS } from "@/lib/filters";
import {
  experienceLabel,
  formatSalary,
  locationLabel,
  workTypeLabel,
} from "@/lib/utils";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { RefreshButton } from "../refresh-button";
import { SignOutButton } from "../sign-out-button";
import { apiFetch } from "../hooks/fetcher";
import { useLatestRun } from "../hooks/use-latest-run";
import { SOURCE_OPTIONS } from "../feed/us-states";

// Full datetime in America/New_York (ET).
const ET_DATETIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  dateStyle: "medium",
  timeStyle: "short",
});
function fmtEt(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `${ET_DATETIME.format(new Date(iso))} ET`;
  } catch {
    return "—";
  }
}

function csvEscape(v: string): string {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsView() {
  const { data: run, isLoading: runLoading } = useLatestRun();
  const [exporting, setExporting] = React.useState(false);

  const exportSavedCsv = async () => {
    setExporting(true);
    try {
      // Pull all saved jobs (paginate to the cap).
      const items: JobWithFit[] = [];
      let page = 1;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await apiFetch<JobsResponse>(
          `/api/jobs?saved=1&pageSize=50&page=${page}`,
        );
        items.push(...res.items);
        if (page * res.pageSize >= res.total || res.items.length === 0) break;
        page += 1;
        if (page > 50) break; // safety
      }

      const header = [
        "title",
        "company",
        "location",
        "work_type",
        "experience",
        "salary",
        "fit_score",
        "fit_band",
        "source",
        "apply_url",
      ];
      const rows = items.map((j) =>
        [
          j.title,
          j.company ?? "",
          locationLabel(j),
          workTypeLabel(j.work_type),
          experienceLabel(j.experience_level),
          formatSalary(j.salary_min, j.salary_max, j.salary_is_estimated) ?? "",
          j.fit?.score != null ? String(j.fit.score) : "",
          j.fit?.band ?? "",
          j.source_name ?? j.source_slug ?? "",
          j.apply_url,
        ]
          .map((c) => csvEscape(String(c)))
          .join(","),
      );
      const csv = [header.join(","), ...rows].join("\n");

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jobradar-saved-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const isError = run?.status === "failed";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <SettingsIcon className="h-5 w-5 text-primary" />
        Settings
      </h1>

      {/* Scrape health */}
      <Section
        icon={RadioTower}
        title="Scrape health"
        description="Daily scrape runs 05:45–06:55 ET. Times shown in America/New_York."
      >
        {runLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : !run ? (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        ) : (
          <>
            {isError && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-fit-low/30 bg-fit-low/10 px-3 py-2 text-xs text-fit-low">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Last run failed.</p>
                  {run.error_text && (
                    <p className="mt-0.5 opacity-90">{run.error_text}</p>
                  )}
                </div>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Stat label="Status" value={run.status} />
              <Stat label="Started" value={fmtEt(run.started_at)} />
              <Stat label="Finished" value={fmtEt(run.finished_at)} />
              <Stat label="Jobs seen" value={String(run.jobs_seen ?? 0)} />
              <Stat
                label="New / updated"
                value={String(run.jobs_upserted ?? 0)}
              />
              <Stat label="Fits scored" value={String(run.fits_scored ?? 0)} />
              <Stat
                label="Deactivated"
                value={String(run.jobs_deactivated ?? 0)}
              />
              <Stat label="Adzuna calls" value={String(run.adzuna_calls ?? 0)} />
              <Stat label="Trigger" value={run.trigger} />
            </dl>
          </>
        )}
        <div className="mt-4">
          <RefreshButton labelled />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Manual refreshes are capped at 10/day to stay within free Actions
            minutes. The remaining count is shown after each trigger.
          </p>
        </div>
      </Section>

      {/* Sources (display only) */}
      <Section
        icon={RadioTower}
        title="Sources"
        description="Job sources are configured in the scraper. This is a read-only overview."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SOURCE_OPTIONS.map((s) => (
            <div
              key={s.slug}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2"
            >
              <span className="text-sm text-foreground">{s.label}</span>
              <Checkbox checked disabled onCheckedChange={() => {}} />
            </div>
          ))}
        </div>
      </Section>

      {/* Default filters */}
      <Section
        icon={Filter}
        title="Default filters"
        description="The feed opens with these unless the URL overrides them."
      >
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>
            Experience:{" "}
            <span className="text-foreground">
              {FILTER_DEFAULTS.level.map(experienceLabel).join(", ") || "Any"}
            </span>
          </li>
          <li>
            Sort:{" "}
            <span className="text-foreground capitalize">
              {FILTER_DEFAULTS.sort}
            </span>
          </li>
          <li>
            Fit threshold:{" "}
            <span className="text-foreground">
              {FILTER_DEFAULTS.fit > 0 ? `${FILTER_DEFAULTS.fit}+` : "Any"}
            </span>
          </li>
          <li>
            Include jobs with no salary:{" "}
            <span className="text-foreground">
              {FILTER_DEFAULTS.includeNoSalary ? "Yes" : "No"}
            </span>
          </li>
        </ul>
      </Section>

      {/* Export */}
      <Section
        icon={Download}
        title="Export saved jobs"
        description="Download your saved jobs as a CSV (generated in your browser)."
      >
        <Button
          variant="outline"
          size="md"
          disabled={exporting}
          onClick={exportSavedCsv}
        >
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </Section>

      {/* Account */}
      <Section icon={SettingsIcon} title="Account">
        <SignOutButton labelled variant="outline" />
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize text-foreground">{value}</dd>
    </div>
  );
}
