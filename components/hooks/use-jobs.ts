"use client";

import {
  useInfiniteQuery,
  useQuery,
  type InfiniteData,
} from "@tanstack/react-query";
import type { JobsResponse, JobWithFit } from "@/lib/types";
import type { JobFilters } from "@/lib/filters";
import { apiFetch } from "./fetcher";
import { filtersToSearchParams, queryKeys } from "./query-keys";

// ============================================================================
// GET /api/jobs?<filters> -> JobsResponse {items, total, page, pageSize}
// Infinite query with page-number keyset pagination (increment `page`).
// ============================================================================

export function useJobs(filters: JobFilters) {
  return useInfiniteQuery<
    JobsResponse,
    Error,
    InfiniteData<JobsResponse>,
    ReturnType<typeof queryKeys.jobs>,
    number
  >({
    queryKey: queryKeys.jobs(filters),
    initialPageParam: 1,
    queryFn: async ({ pageParam }) => {
      const sp = filtersToSearchParams(filters, pageParam);
      return apiFetch<JobsResponse>(`/api/jobs?${sp.toString()}`);
    },
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    staleTime: 30_000,
  });
}

/** Flatten infinite-query pages into a single item array. */
export function flattenJobs(
  data: InfiniteData<JobsResponse> | undefined,
): JobWithFit[] {
  if (!data) return [];
  return data.pages.flatMap((p) => p.items);
}

export function totalJobs(
  data: InfiniteData<JobsResponse> | undefined,
): number {
  return data?.pages[0]?.total ?? 0;
}

// --- Single job detail ------------------------------------------------------

export function useJob(id: number | string | null) {
  return useQuery<JobWithFit, Error>({
    queryKey: queryKeys.job(id ?? ""),
    enabled: id != null && id !== "",
    queryFn: async () => apiFetch<JobWithFit>(`/api/jobs/${id}`),
    staleTime: 60_000,
  });
}
