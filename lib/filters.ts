import type { AppStatus, ExperienceLevel, FitBand, WorkType } from "./types";

/** Application-status filter values (the 8 statuses + a synthetic "none" = untracked). */
export type StatusFilter = AppStatus | "none";

// ============================================================================
// Canonical job-filter contract. The UI binds these exact query-param KEYS via
// nuqs; GET /api/jobs parses the same keys with `parseJobFilters`. Keep both
// sides in sync by importing from here.
// ============================================================================

export type SortKey = "fit" | "posted" | "salary" | "company";
export type DatePosted = "24h" | "3d" | "7d" | "14d" | "30d" | "any";

export interface JobFilters {
  q: string;
  level: ExperienceLevel[];
  work: WorkType[];
  remote: boolean;
  state: string[];
  src: string[];
  salaryMin: number | null;
  includeNoSalary: boolean;
  relocate: boolean;
  since: DatePosted;
  fit: number; // minimum fit score 0..100
  sort: SortKey;
  page: number;
  pageSize: number;
  savedOnly: boolean;
  company: string; // company-name contains
  status: StatusFilter[]; // application-status (incl. "none" = untracked)
  fitBand: FitBand[]; // Strong/Good/Stretch/Low
  excludeKw: string[]; // titles/descriptions to exclude
}

/** Query-param keys (shared with the nuqs config in the UI). */
export const FILTER_KEYS = {
  q: "q",
  level: "level",
  work: "work",
  remote: "remote",
  state: "state",
  src: "src",
  salaryMin: "salaryMin",
  includeNoSalary: "noSal",
  relocate: "relocate",
  since: "since",
  fit: "fit",
  sort: "sort",
  page: "page",
  pageSize: "pageSize",
  savedOnly: "saved",
  company: "company",
  status: "status",
  fitBand: "fitBand",
  excludeKw: "excludeKw",
} as const;

export const FILTER_DEFAULTS: JobFilters = {
  q: "",
  level: ["new_grad", "mid"], // owner's early-career band by default
  work: [],
  remote: false,
  state: [],
  src: [],
  salaryMin: null,
  includeNoSalary: true,
  relocate: false,
  since: "any",
  fit: 0,
  sort: "fit",
  page: 1,
  pageSize: 25,
  savedOnly: false,
  company: "",
  status: [],
  fitBand: [],
  excludeKw: [],
};

export const MAX_PAGE_SIZE = 50;

const EXPERIENCE_VALUES: ExperienceLevel[] = [
  "intern",
  "new_grad",
  "entry",
  "mid",
  "senior",
  "lead",
  "unknown",
];
const WORKTYPE_VALUES: WorkType[] = ["remote", "hybrid", "onsite", "unknown"];
const SORT_VALUES: SortKey[] = ["fit", "posted", "salary", "company"];
const SINCE_VALUES: DatePosted[] = ["24h", "3d", "7d", "14d", "30d", "any"];
export const STATUS_FILTER_VALUES: StatusFilter[] = [
  "none",
  "saved",
  "applied",
  "phone_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
];
export const FIT_BAND_VALUES: FitBand[] = ["Strong", "Good", "Stretch", "Low"];

function splitList(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function asBool(v: string | null): boolean {
  return v === "1" || v === "true";
}

function asInt(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

/** Parse a URLSearchParams (or plain record) into a fully-defaulted JobFilters. */
export function parseJobFilters(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
): JobFilters {
  const sp =
    input instanceof URLSearchParams
      ? input
      : new URLSearchParams(
          Object.entries(input).flatMap(([k, val]) =>
            val == null
              ? []
              : Array.isArray(val)
                ? val.map((v) => [k, v] as [string, string])
                : [[k, val] as [string, string]],
          ),
        );

  const get = (k: string) => sp.get(k);

  const level = splitList(get(FILTER_KEYS.level)).filter((v): v is ExperienceLevel =>
    (EXPERIENCE_VALUES as string[]).includes(v),
  );
  const work = splitList(get(FILTER_KEYS.work)).filter((v): v is WorkType =>
    (WORKTYPE_VALUES as string[]).includes(v),
  );
  const sortRaw = get(FILTER_KEYS.sort) as SortKey | null;
  const sinceRaw = get(FILTER_KEYS.since) as DatePosted | null;

  const pageSize = asInt(get(FILTER_KEYS.pageSize)) ?? FILTER_DEFAULTS.pageSize;
  const page = asInt(get(FILTER_KEYS.page)) ?? FILTER_DEFAULTS.page;
  const fit = asInt(get(FILTER_KEYS.fit)) ?? FILTER_DEFAULTS.fit;

  return {
    q: get(FILTER_KEYS.q)?.trim() ?? "",
    level: level.length ? level : [],
    work,
    remote: asBool(get(FILTER_KEYS.remote)),
    state: splitList(get(FILTER_KEYS.state)).map((s) => s.toUpperCase()),
    src: splitList(get(FILTER_KEYS.src)),
    salaryMin: asInt(get(FILTER_KEYS.salaryMin)),
    includeNoSalary: get(FILTER_KEYS.includeNoSalary) == null
      ? FILTER_DEFAULTS.includeNoSalary
      : asBool(get(FILTER_KEYS.includeNoSalary)),
    relocate: asBool(get(FILTER_KEYS.relocate)),
    since: sinceRaw && SINCE_VALUES.includes(sinceRaw) ? sinceRaw : "any",
    fit: Math.max(0, Math.min(100, fit)),
    sort: sortRaw && SORT_VALUES.includes(sortRaw) ? sortRaw : "fit",
    page: Math.max(1, page),
    pageSize: Math.max(1, Math.min(MAX_PAGE_SIZE, pageSize)),
    savedOnly: asBool(get(FILTER_KEYS.savedOnly)),
    company: get(FILTER_KEYS.company)?.trim() ?? "",
    status: splitList(get(FILTER_KEYS.status)).filter((v): v is StatusFilter =>
      (STATUS_FILTER_VALUES as string[]).includes(v),
    ),
    fitBand: splitList(get(FILTER_KEYS.fitBand)).filter((v): v is FitBand =>
      (FIT_BAND_VALUES as string[]).includes(v),
    ),
    excludeKw: splitList(get(FILTER_KEYS.excludeKw)),
  };
}

/** Convert a `since` window into an ISO cutoff timestamp (or null for "any"). */
export function sinceToCutoffISO(since: DatePosted): string | null {
  const days: Record<DatePosted, number | null> = {
    "24h": 1,
    "3d": 3,
    "7d": 7,
    "14d": 14,
    "30d": 30,
    any: null,
  };
  const d = days[since];
  if (d == null) return null;
  return new Date(Date.now() - d * 86_400_000).toISOString();
}

/** Count how many filters are active (for the "N filters" chip). */
export function activeFilterCount(f: JobFilters): number {
  let n = 0;
  if (f.q) n++;
  if (f.level.length) n++;
  if (f.work.length) n++;
  if (f.remote) n++;
  if (f.state.length) n++;
  if (f.src.length) n++;
  if (f.salaryMin != null) n++;
  if (f.relocate) n++;
  if (f.since !== "any") n++;
  if (f.fit > 0) n++;
  if (f.company) n++;
  if (f.status.length) n++;
  if (f.fitBand.length) n++;
  if (f.excludeKw.length) n++;
  return n;
}
