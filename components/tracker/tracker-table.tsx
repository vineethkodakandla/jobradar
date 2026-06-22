"use client";

import * as React from "react";
import type { ApplicationWithJob, AppStatus } from "@/lib/types";
import { APP_STATUSES } from "@/lib/types";
import { cn, locationLabel, relativeTime } from "@/lib/utils";
import { FitBadge } from "../feed/fit-badge";
import { Select } from "../ui/select";
import { usePatchApplication } from "../hooks/use-applications";
import { STATUS_LABELS } from "./status-config";

export interface TrackerTableProps {
  apps: ApplicationWithJob[];
  onOpen: (app: ApplicationWithJob) => void;
}

type SortCol = "title" | "company" | "status" | "fit" | "updated";

const STATUS_OPTIONS = APP_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
}));

export function TrackerTable({ apps, onOpen }: TrackerTableProps) {
  const patch = usePatchApplication();
  const [sortCol, setSortCol] = React.useState<SortCol>("updated");
  const [asc, setAsc] = React.useState(false);

  const sorted = React.useMemo(() => {
    const arr = [...apps];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "title":
          cmp = a.job.title.localeCompare(b.job.title);
          break;
        case "company":
          cmp = (a.job.company ?? "").localeCompare(b.job.company ?? "");
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "fit":
          cmp = (a.job.fit?.score ?? -1) - (b.job.fit?.score ?? -1);
          break;
        case "updated":
          cmp =
            new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime();
          break;
      }
      return asc ? cmp : -cmp;
    });
    return arr;
  }, [apps, sortCol, asc]);

  const toggleSort = (col: SortCol) => {
    if (col === sortCol) setAsc((v) => !v);
    else {
      setSortCol(col);
      setAsc(col === "title" || col === "company");
    }
  };

  const Th = ({ col, children }: { col: SortCol; children: React.ReactNode }) => (
    <th className="px-3 py-2 text-left font-medium">
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          sortCol === col ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        {sortCol === col && <span aria-hidden>{asc ? "↑" : "↓"}</span>}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs">
          <tr>
            <Th col="title">Role</Th>
            <Th col="company">Company</Th>
            <Th col="status">Status</Th>
            <Th col="fit">Fit</Th>
            <Th col="updated">Updated</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((app) => (
            <tr key={app.id} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => onOpen(app)}
                  className="text-left font-medium text-foreground hover:text-primary hover:underline"
                >
                  {app.job.title}
                </button>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {app.job.company ?? "—"}
                <span className="block text-xs">
                  {locationLabel(app.job)}
                </span>
              </td>
              <td className="px-3 py-2">
                <Select
                  value={app.status}
                  onValueChange={(v) =>
                    patch.mutate({ id: app.id, status: v as AppStatus })
                  }
                  options={STATUS_OPTIONS}
                />
              </td>
              <td className="px-3 py-2">
                <FitBadge score={app.job.fit?.score ?? null} />
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">
                {relativeTime(app.updated_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <p className="px-3 py-8 text-center text-sm text-muted-foreground">
          No tracked applications yet.
        </p>
      )}
    </div>
  );
}
