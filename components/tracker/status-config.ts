import type { AppStatus } from "@/lib/types";

// ============================================================================
// The kanban shows 5 columns (Saved -> Applied -> Interview -> Offer ->
// Rejected) per §9, but AppStatus has 8 values. We map the extra statuses into
// columns for display, while the column's *canonical* status is what a drop
// persists. phone_screen -> Interview column; withdrawn/ghosted -> Rejected.
// ============================================================================

export interface TrackerColumn {
  /** The status a card moved into this column is persisted as. */
  id: AppStatus;
  label: string;
  /** All statuses that render in this column. */
  members: AppStatus[];
  /** Tailwind accent for the column header dot. */
  dot: string;
}

export const TRACKER_COLUMNS: TrackerColumn[] = [
  {
    id: "saved",
    label: "Saved",
    members: ["saved"],
    dot: "bg-muted-foreground",
  },
  {
    id: "applied",
    label: "Applied",
    members: ["applied"],
    dot: "bg-primary",
  },
  {
    id: "interview",
    label: "Interview",
    members: ["phone_screen", "interview"],
    dot: "bg-fit-good",
  },
  {
    id: "offer",
    label: "Offer",
    members: ["offer"],
    dot: "bg-fit-strong",
  },
  {
    id: "rejected",
    label: "Rejected",
    members: ["rejected", "withdrawn", "ghosted"],
    dot: "bg-fit-low",
  },
];

export const STATUS_LABELS: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  phone_screen: "Phone screen",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  ghosted: "Ghosted",
};

/** Which column a given status belongs to. */
export function columnForStatus(status: AppStatus): AppStatus {
  const col = TRACKER_COLUMNS.find((c) => c.members.includes(status));
  return col?.id ?? "saved";
}

// The funnel order for stats (linear pipeline progress).
export const FUNNEL_ORDER: AppStatus[] = [
  "saved",
  "applied",
  "interview",
  "offer",
];
