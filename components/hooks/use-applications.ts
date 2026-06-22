"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { Application, ApplicationWithJob, AppStatus } from "@/lib/types";
import { apiFetch } from "./fetcher";
import { queryKeys } from "./query-keys";

// ============================================================================
// GET  /api/applications            -> ApplicationWithJob[]
// POST /api/applications {job_id,status} -> Application
// PATCH /api/applications/:id {partial}  -> Application
// ============================================================================

export function useApplications() {
  return useQuery<ApplicationWithJob[], Error>({
    queryKey: queryKeys.applications(),
    queryFn: async () => apiFetch<ApplicationWithJob[]>("/api/applications"),
    staleTime: 15_000,
  });
}

export interface PatchApplicationInput {
  id: number;
  status?: AppStatus;
  notes?: string;
  next_action?: string | null;
  next_action_at?: string | null;
  applied_at?: string | null;
  position?: number | null;
}

/** PATCH an application with an optimistic board update. */
export function usePatchApplication() {
  const qc = useQueryClient();

  return useMutation<
    Application,
    Error,
    PatchApplicationInput,
    { prev: ApplicationWithJob[] | undefined }
  >({
    mutationFn: async ({ id, ...patch }) =>
      apiFetch<Application>(`/api/applications/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: queryKeys.applications() });
      const prev = qc.getQueryData<ApplicationWithJob[]>(
        queryKeys.applications(),
      );
      qc.setQueryData<ApplicationWithJob[]>(
        queryKeys.applications(),
        (old) =>
          old?.map((a) =>
            a.id === vars.id
              ? {
                  ...a,
                  ...("status" in vars && vars.status
                    ? { status: vars.status }
                    : {}),
                  ...("notes" in vars ? { notes: vars.notes ?? null } : {}),
                  ...("next_action" in vars
                    ? { next_action: vars.next_action ?? null }
                    : {}),
                  ...("next_action_at" in vars
                    ? { next_action_at: vars.next_action_at ?? null }
                    : {}),
                  ...("applied_at" in vars
                    ? { applied_at: vars.applied_at ?? null }
                    : {}),
                  ...("position" in vars
                    ? { position: vars.position ?? null }
                    : {}),
                }
              : a,
          ) ?? old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.applications(), ctx.prev);
      toast.error("Couldn't save the change. Reverted.");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.applications() });
    },
  });
}

/** Create (or upsert) an application row for a job at a given status. */
export function useCreateApplication() {
  const qc = useQueryClient();
  return useMutation<Application, Error, { job_id: number; status: AppStatus }>(
    {
      mutationFn: async (body) =>
        apiFetch<Application>("/api/applications", {
          method: "POST",
          body: JSON.stringify(body),
        }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: queryKeys.applications() });
        toast.success("Added to tracker");
      },
      onError: () => toast.error("Couldn't add to tracker."),
    },
  );
}
