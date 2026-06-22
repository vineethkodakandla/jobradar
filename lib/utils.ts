import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-aware className combiner. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Compact "$120k–$160k" style salary label from annual USD bounds. */
export function formatSalary(
  min: number | null,
  max: number | null,
  estimated = false,
): string | null {
  if (min == null && max == null) return null;
  const k = (n: number) =>
    n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${n}`;
  let label: string;
  if (min != null && max != null && min !== max) label = `${k(min)}–${k(max)}`;
  else label = k((min ?? max) as number);
  return estimated ? `${label} (est.)` : label;
}

/** "3d ago" style relative time from an ISO timestamp. */
export function relativeTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 86_400_000;
  const hr = 3_600_000;
  if (diff < hr) return "just now";
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  const days = Math.floor(diff / day);
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const EXPERIENCE_LABELS: Record<string, string> = {
  intern: "Internship",
  new_grad: "New grad",
  entry: "Entry level",
  mid: "Mid (1–3 yr)",
  senior: "Senior",
  lead: "Lead / Staff",
  unknown: "Not specified",
};

export function experienceLabel(level: string): string {
  return EXPERIENCE_LABELS[level] ?? level;
}

const WORKTYPE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "Unspecified",
};

export function workTypeLabel(wt: string): string {
  return WORKTYPE_LABELS[wt] ?? wt;
}

export function locationLabel(job: {
  is_remote: boolean;
  city: string | null;
  state: string | null;
  location_raw: string | null;
}): string {
  if (job.city && job.state) return `${job.city}, ${job.state}`;
  if (job.state) return job.state;
  if (job.location_raw) return job.location_raw;
  if (job.is_remote) return "Remote";
  return "Location N/A";
}
