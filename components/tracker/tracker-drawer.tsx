"use client";

import * as React from "react";
import { Building2, ExternalLink } from "lucide-react";
import type { ApplicationWithJob, AppStatus } from "@/lib/types";
import { APP_STATUSES } from "@/lib/types";
import { cn, locationLabel, relativeTime } from "@/lib/utils";
import { Modal } from "../ui/modal";
import { Input, Textarea } from "../ui/input";
import { Select } from "../ui/select";
import { FitBadge } from "../feed/fit-badge";
import { useDebouncedCallback } from "../hooks/use-debounced-callback";
import { usePatchApplication } from "../hooks/use-applications";
import { STATUS_LABELS } from "./status-config";

export interface TrackerDrawerProps {
  app: ApplicationWithJob | null;
  onClose: () => void;
}

const STATUS_OPTIONS = APP_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABELS[s],
}));

/** Convert an ISO timestamp to a yyyy-mm-dd value for <input type=date>. */
function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}
function fromDateInput(v: string): string | null {
  return v ? new Date(`${v}T12:00:00Z`).toISOString() : null;
}

export function TrackerDrawer({ app, onClose }: TrackerDrawerProps) {
  const patch = usePatchApplication();

  const [notes, setNotes] = React.useState(app?.notes ?? "");
  const [nextAction, setNextAction] = React.useState(app?.next_action ?? "");
  const [savedHint, setSavedHint] = React.useState<string>("");

  // Re-seed local state whenever a different application opens.
  React.useEffect(() => {
    setNotes(app?.notes ?? "");
    setNextAction(app?.next_action ?? "");
    setSavedHint("");
  }, [app?.id, app?.notes, app?.next_action]);

  const autosave = useDebouncedCallback(
    (id: number, partial: { notes?: string; next_action?: string }) => {
      patch.mutate(
        { id, ...partial },
        { onSuccess: () => setSavedHint("Saved") },
      );
    },
    700,
  );

  if (!app) return null;
  const job = app.job;

  return (
    <Modal
      open={app != null}
      onClose={onClose}
      side="right"
      title="Application"
      labelledBy="tracker-drawer-title"
    >
      <div className="space-y-5 p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-tight text-foreground">
              {job.title}
            </h3>
            <p className="text-sm text-muted-foreground">
              {job.company ?? "—"} · {locationLabel(job)}
            </p>
          </div>
          <FitBadge score={job.fit?.score ?? null} size="md" />
        </div>

        <a
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Open application <ExternalLink className="h-4 w-4" />
        </a>

        {/* Status */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Status
          </label>
          <Select
            value={app.status}
            onValueChange={(v) => patch.mutate({ id: app.id, status: v as AppStatus })}
            options={STATUS_OPTIONS}
            className="w-full"
          />
        </div>

        {/* Date fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="applied-at"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Applied on
            </label>
            <Input
              id="applied-at"
              type="date"
              value={toDateInput(app.applied_at)}
              onChange={(e) =>
                patch.mutate({
                  id: app.id,
                  applied_at: fromDateInput(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="next-action-at"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Next action date
            </label>
            <Input
              id="next-action-at"
              type="date"
              value={toDateInput(app.next_action_at)}
              onChange={(e) =>
                patch.mutate({
                  id: app.id,
                  next_action_at: fromDateInput(e.target.value),
                })
              }
            />
          </div>
        </div>

        {/* Next action */}
        <div className="space-y-1.5">
          <label
            htmlFor="next-action"
            className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Next action
          </label>
          <Input
            id="next-action"
            value={nextAction}
            placeholder="e.g. Follow up with recruiter"
            onChange={(e) => {
              setNextAction(e.target.value);
              setSavedHint("Saving…");
              autosave(app.id, { next_action: e.target.value });
            }}
          />
        </div>

        {/* Notes (autosave) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="notes"
              className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Notes
            </label>
            {savedHint && (
              <span className="text-[11px] text-muted-foreground">
                {savedHint}
              </span>
            )}
          </div>
          <Textarea
            id="notes"
            value={notes}
            placeholder="Interviewers, compensation, impressions…"
            className="min-h-[120px]"
            onChange={(e) => {
              setNotes(e.target.value);
              setSavedHint("Saving…");
              autosave(app.id, { notes: e.target.value });
            }}
          />
        </div>

        {/* Status timeline */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Timeline
          </h4>
          <ol className="space-y-2 text-xs text-muted-foreground">
            <TimelineRow
              label={`Added to tracker`}
              at={app.created_at}
            />
            {app.applied_at && (
              <TimelineRow label="Applied" at={app.applied_at} highlight />
            )}
            <TimelineRow
              label={`Current: ${STATUS_LABELS[app.status]}`}
              at={app.updated_at}
              highlight
            />
          </ol>
        </div>
      </div>
    </Modal>
  );
}

function TimelineRow({
  label,
  at,
  highlight,
}: {
  label: string;
  at: string | null;
  highlight?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          highlight ? "bg-primary" : "bg-border",
        )}
        aria-hidden
      />
      <span className={cn(highlight && "text-foreground")}>{label}</span>
      {at && <span className="ml-auto">{relativeTime(at)}</span>}
    </li>
  );
}
