"use client";

import * as React from "react";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import type { ExperienceLevel, WorkType } from "@/lib/types";
import {
  FILTER_DEFAULTS,
  FILTER_KEYS,
  type DatePosted,
  type JobFilters,
  type SortKey,
} from "@/lib/filters";

// ============================================================================
// Binds the entire JobFilters object to the URL via nuqs, using the canonical
// FILTER_KEYS so the querystring is shareable/bookmarkable and matches what
// GET /api/jobs parses with parseJobFilters. Lists use comma separators;
// booleans serialize to "1"/"0" via a custom boolean parser to match the
// backend's asBool (which accepts "1"/"true").
// ============================================================================

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

// Boolean parser (nuqs serializes true/false; backend asBool accepts "true").
const boolParser = parseAsBoolean.withDefault(false);

/** nuqs parser map keyed by the exact FILTER_KEYS query-param names. */
function buildParsers() {
  return {
    [FILTER_KEYS.q]: parseAsString.withDefault(FILTER_DEFAULTS.q),
    [FILTER_KEYS.level]: parseAsArrayOf(
      parseAsStringEnum<ExperienceLevel>(EXPERIENCE_VALUES),
      ",",
    ).withDefault(FILTER_DEFAULTS.level),
    [FILTER_KEYS.work]: parseAsArrayOf(
      parseAsStringEnum<WorkType>(WORKTYPE_VALUES),
      ",",
    ).withDefault(FILTER_DEFAULTS.work),
    [FILTER_KEYS.remote]: boolParser,
    [FILTER_KEYS.state]: parseAsArrayOf(parseAsString, ",").withDefault(
      FILTER_DEFAULTS.state,
    ),
    [FILTER_KEYS.src]: parseAsArrayOf(parseAsString, ",").withDefault(
      FILTER_DEFAULTS.src,
    ),
    [FILTER_KEYS.salaryMin]: parseAsInteger,
    [FILTER_KEYS.includeNoSalary]: parseAsBoolean.withDefault(
      FILTER_DEFAULTS.includeNoSalary,
    ),
    [FILTER_KEYS.relocate]: boolParser,
    [FILTER_KEYS.since]: parseAsStringEnum<DatePosted>(SINCE_VALUES).withDefault(
      FILTER_DEFAULTS.since,
    ),
    [FILTER_KEYS.fit]: parseAsInteger.withDefault(FILTER_DEFAULTS.fit),
    [FILTER_KEYS.sort]: parseAsStringEnum<SortKey>(SORT_VALUES).withDefault(
      FILTER_DEFAULTS.sort,
    ),
  };
}

export interface UseJobFiltersResult {
  filters: JobFilters;
  set: (patch: Partial<JobFilters>) => void;
  reset: () => void;
}

/**
 * @param savedOnly  when true, forces savedOnly=true in the resulting filters
 *                   (used by the /saved page; not URL-bound there).
 */
export function useJobFilters(savedOnly = false): UseJobFiltersResult {
  const parsers = React.useMemo(buildParsers, []);
  const [raw, setRaw] = useQueryStates(parsers, {
    history: "replace",
    clearOnDefault: true,
  });

  const filters: JobFilters = React.useMemo(
    () => ({
      q: raw[FILTER_KEYS.q] || "",
      level: raw[FILTER_KEYS.level] ?? [],
      work: raw[FILTER_KEYS.work] ?? [],
      remote: raw[FILTER_KEYS.remote] ?? false,
      state: (raw[FILTER_KEYS.state] ?? []).map((s) => s.toUpperCase()),
      src: raw[FILTER_KEYS.src] ?? [],
      salaryMin: raw[FILTER_KEYS.salaryMin] ?? null,
      includeNoSalary:
        raw[FILTER_KEYS.includeNoSalary] ?? FILTER_DEFAULTS.includeNoSalary,
      relocate: raw[FILTER_KEYS.relocate] ?? false,
      since: raw[FILTER_KEYS.since] ?? "any",
      fit: raw[FILTER_KEYS.fit] ?? FILTER_DEFAULTS.fit,
      sort: raw[FILTER_KEYS.sort] ?? FILTER_DEFAULTS.sort,
      page: FILTER_DEFAULTS.page,
      pageSize: FILTER_DEFAULTS.pageSize,
      savedOnly,
    }),
    [raw, savedOnly],
  );

  const set = React.useCallback(
    (patch: Partial<JobFilters>) => {
      const next: Record<string, unknown> = {};
      if ("q" in patch) next[FILTER_KEYS.q] = patch.q || null;
      if ("level" in patch)
        next[FILTER_KEYS.level] = patch.level?.length ? patch.level : null;
      if ("work" in patch)
        next[FILTER_KEYS.work] = patch.work?.length ? patch.work : null;
      if ("remote" in patch) next[FILTER_KEYS.remote] = patch.remote || null;
      if ("state" in patch)
        next[FILTER_KEYS.state] = patch.state?.length ? patch.state : null;
      if ("src" in patch)
        next[FILTER_KEYS.src] = patch.src?.length ? patch.src : null;
      if ("salaryMin" in patch)
        next[FILTER_KEYS.salaryMin] = patch.salaryMin ?? null;
      if ("includeNoSalary" in patch)
        next[FILTER_KEYS.includeNoSalary] = patch.includeNoSalary;
      if ("relocate" in patch)
        next[FILTER_KEYS.relocate] = patch.relocate || null;
      if ("since" in patch)
        next[FILTER_KEYS.since] =
          patch.since && patch.since !== "any" ? patch.since : null;
      if ("fit" in patch)
        next[FILTER_KEYS.fit] = patch.fit ? patch.fit : null;
      if ("sort" in patch) next[FILTER_KEYS.sort] = patch.sort ?? null;
      void setRaw(next as never);
    },
    [setRaw],
  );

  const reset = React.useCallback(() => {
    void setRaw({
      [FILTER_KEYS.q]: null,
      [FILTER_KEYS.level]: null,
      [FILTER_KEYS.work]: null,
      [FILTER_KEYS.remote]: null,
      [FILTER_KEYS.state]: null,
      [FILTER_KEYS.src]: null,
      [FILTER_KEYS.salaryMin]: null,
      [FILTER_KEYS.includeNoSalary]: null,
      [FILTER_KEYS.relocate]: null,
      [FILTER_KEYS.since]: null,
      [FILTER_KEYS.fit]: null,
      [FILTER_KEYS.sort]: null,
    } as never);
  }, [setRaw]);

  return { filters, set, reset };
}
