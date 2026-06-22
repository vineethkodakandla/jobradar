"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RefreshResponse } from "@/lib/types";
import { ApiError, apiFetch } from "./fetcher";
import { queryKeys } from "./query-keys";

// ============================================================================
// POST /api/refresh -> RefreshResponse {ok, remaining_today, message?}
// Triggers the scraper via repository_dispatch. 429 when over the 10/day cap.
// ============================================================================

export function useRefresh() {
  const qc = useQueryClient();
  return useMutation<RefreshResponse, Error, void>({
    mutationFn: async () =>
      apiFetch<RefreshResponse>("/api/refresh", { method: "POST" }),
    onSuccess: (data) => {
      const remain = data.remaining_today;
      toast.success("Scrape queued", {
        description:
          data.message ??
          `${remain} manual refresh${remain === 1 ? "" : "es"} left today.`,
      });
      qc.invalidateQueries({ queryKey: queryKeys.latestRun() });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 429) {
        const body =
          err.body && typeof err.body === "object"
            ? (err.body as Partial<RefreshResponse>)
            : null;
        const remaining = Number(body?.remaining_today ?? 0);
        toast.error("Refresh blocked", {
          // Surfaces "limit reached (10/day)" or "wait a minute" from the API.
          description:
            body?.message ??
            `${remaining} manual refresh${remaining === 1 ? "" : "es"} left today.`,
        });
        return;
      }
      toast.error("Couldn't trigger a refresh.", {
        description: err.message,
      });
    },
  });
}
