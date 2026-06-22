"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type { SkillsProfile } from "@/lib/types";
import { apiFetch } from "./fetcher";
import { queryKeys } from "./query-keys";

// ============================================================================
// GET /api/profile -> SkillsProfile
// PUT /api/profile {partial} -> SkillsProfile
// ============================================================================

export function useProfile() {
  return useQuery<SkillsProfile, Error>({
    queryKey: queryKeys.profile(),
    queryFn: async () => apiFetch<SkillsProfile>("/api/profile"),
    staleTime: 60_000,
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation<
    SkillsProfile,
    Error,
    Partial<SkillsProfile>,
    { prev: SkillsProfile | undefined }
  >({
    mutationFn: async (partial) =>
      apiFetch<SkillsProfile>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(partial),
      }),
    onMutate: async (partial) => {
      await qc.cancelQueries({ queryKey: queryKeys.profile() });
      const prev = qc.getQueryData<SkillsProfile>(queryKeys.profile());
      if (prev) {
        qc.setQueryData<SkillsProfile>(queryKeys.profile(), {
          ...prev,
          ...partial,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.profile(), ctx.prev);
      toast.error("Couldn't save profile changes.");
    },
    onSuccess: (data) => {
      qc.setQueryData(queryKeys.profile(), data);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profile() });
    },
  });
}
