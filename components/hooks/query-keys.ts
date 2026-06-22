import type { JobFilters } from "@/lib/filters";
import { FILTER_KEYS } from "@/lib/filters";

// ============================================================================
// Shared querystring builder + TanStack Query key factory. Builds the exact
// FILTER_KEYS param string that GET /api/jobs parses with parseJobFilters.
// Lists are comma-joined; booleans are "1". Page is supplied per fetch.
// ============================================================================

/** Build a URLSearchParams from JobFilters using the canonical FILTER_KEYS. */
export function filtersToSearchParams(
  f: JobFilters,
  page: number,
): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set(FILTER_KEYS.q, f.q);
  if (f.level.length) sp.set(FILTER_KEYS.level, f.level.join(","));
  if (f.work.length) sp.set(FILTER_KEYS.work, f.work.join(","));
  if (f.remote) sp.set(FILTER_KEYS.remote, "1");
  if (f.state.length) sp.set(FILTER_KEYS.state, f.state.join(","));
  if (f.src.length) sp.set(FILTER_KEYS.src, f.src.join(","));
  if (f.salaryMin != null) sp.set(FILTER_KEYS.salaryMin, String(f.salaryMin));
  // includeNoSalary defaults true; only send when false (opt out).
  if (!f.includeNoSalary) sp.set(FILTER_KEYS.includeNoSalary, "0");
  if (f.relocate) sp.set(FILTER_KEYS.relocate, "1");
  if (f.since !== "any") sp.set(FILTER_KEYS.since, f.since);
  if (f.fit > 0) sp.set(FILTER_KEYS.fit, String(f.fit));
  sp.set(FILTER_KEYS.sort, f.sort);
  sp.set(FILTER_KEYS.pageSize, String(f.pageSize));
  if (f.savedOnly) sp.set(FILTER_KEYS.savedOnly, "1");
  sp.set(FILTER_KEYS.page, String(page));
  return sp;
}

/** A stable cache key fragment for a filter set (page-independent). */
export function filtersCacheKey(f: JobFilters): string {
  const sp = filtersToSearchParams(f, 1);
  sp.delete(FILTER_KEYS.page);
  sp.sort();
  return sp.toString();
}

export const queryKeys = {
  jobs: (f: JobFilters) => ["jobs", filtersCacheKey(f)] as const,
  job: (id: number | string) => ["job", String(id)] as const,
  applications: () => ["applications"] as const,
  profile: () => ["profile"] as const,
  latestRun: () => ["latest-run"] as const,
  fitImpact: (threshold: number) => ["fit-impact", threshold] as const,
};
