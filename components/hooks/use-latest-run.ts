"use client";

import { useQuery } from "@tanstack/react-query";
import type { ScrapeRun } from "@/lib/types";
import { apiFetch } from "./fetcher";
import { queryKeys } from "./query-keys";

// ============================================================================
// GET /api/runs/latest -> ScrapeRun | null
// Powers the "synced HH:MM ET / N new" strip. Render times in America/New_York.
// ============================================================================

export function useLatestRun() {
  return useQuery<ScrapeRun | null, Error>({
    queryKey: queryKeys.latestRun(),
    queryFn: async () => apiFetch<ScrapeRun | null>("/api/runs/latest"),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
