"use client";

import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { JobsResponse, JobWithFit } from "@/lib/types";
import { apiFetch } from "./fetcher";

// ============================================================================
// POST /api/saved {job_id}  /  DELETE /api/saved?job_id=ID  -> {ok:true}
// Optimistic bookmark toggle across every cached jobs list + single job.
// ============================================================================

type ToggleVars = { jobId: number; nextSaved: boolean };

function patchSavedInCaches(
  qc: ReturnType<typeof useQueryClient>,
  jobId: number,
  isSaved: boolean,
) {
  // Patch every infinite jobs list.
  qc.setQueriesData<InfiniteData<JobsResponse>>(
    { queryKey: ["jobs"] },
    (old) => {
      if (!old) return old;
      return {
        ...old,
        pages: old.pages.map((page) => ({
          ...page,
          items: page.items.map((j) =>
            j.id === jobId ? { ...j, is_saved: isSaved } : j,
          ),
        })),
      };
    },
  );
  // Patch the single-job cache.
  qc.setQueriesData<JobWithFit>({ queryKey: ["job", String(jobId)] }, (old) =>
    old ? { ...old, is_saved: isSaved } : old,
  );
}

export function useToggleSaved() {
  const qc = useQueryClient();

  return useMutation<{ ok: true }, Error, ToggleVars, { prevSaved: boolean }>({
    mutationFn: async ({ jobId, nextSaved }) => {
      if (nextSaved) {
        return apiFetch<{ ok: true }>("/api/saved", {
          method: "POST",
          body: JSON.stringify({ job_id: jobId }),
        });
      }
      return apiFetch<{ ok: true }>(`/api/saved?job_id=${jobId}`, {
        method: "DELETE",
      });
    },
    onMutate: async ({ jobId, nextSaved }) => {
      await qc.cancelQueries({ queryKey: ["jobs"] });
      await qc.cancelQueries({ queryKey: ["job", String(jobId)] });
      patchSavedInCaches(qc, jobId, nextSaved);
      return { prevSaved: !nextSaved };
    },
    onError: (_err, { jobId, nextSaved }, ctx) => {
      // Roll back to the previous saved state.
      patchSavedInCaches(qc, jobId, ctx?.prevSaved ?? !nextSaved);
      toast.error("Couldn't update saved jobs. Try again.");
    },
    onSuccess: (_data, { nextSaved }) => {
      toast.success(nextSaved ? "Saved" : "Removed from saved");
    },
    onSettled: () => {
      // Saved-scoped lists may need a re-fetch (a job could drop out).
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}
