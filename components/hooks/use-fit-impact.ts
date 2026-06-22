"use client";

import { useQuery } from "@tanstack/react-query";
import type { JobsResponse } from "@/lib/types";
import { FILTER_DEFAULTS } from "@/lib/filters";
import { apiFetch } from "./fetcher";
import { filtersToSearchParams, queryKeys } from "./query-keys";

// ============================================================================
// "Jobs >= N fit: X" count for the skills FitImpactPanel. Reuses GET /api/jobs
// with fit=threshold, pageSize=1, and reads `total` from the envelope.
// ============================================================================

export function useFitImpactCount(threshold: number) {
  return useQuery<number, Error>({
    queryKey: queryKeys.fitImpact(threshold),
    queryFn: async () => {
      const sp = filtersToSearchParams(
        {
          ...FILTER_DEFAULTS,
          level: [],
          fit: threshold,
          pageSize: 1,
        },
        1,
      );
      const res = await apiFetch<JobsResponse>(`/api/jobs?${sp.toString()}`);
      return res.total;
    },
    staleTime: 30_000,
  });
}
