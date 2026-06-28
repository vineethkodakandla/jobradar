import { requireOwner } from "@/lib/auth-helpers";
import { parseJobFilters, sinceToCutoffISO } from "@/lib/filters";
import type { JobsResponse, JobWithFit } from "@/lib/types";

export async function GET(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const { searchParams } = new URL(request.url);
  const filters = parseJobFilters(searchParams);

  const f = {
    q: filters.q,
    level: filters.level,
    work: filters.work,
    remote: filters.remote,
    state: filters.state,
    src: filters.src,
    salaryMin: filters.salaryMin,
    includeNoSalary: filters.includeNoSalary,
    sinceCutoff: sinceToCutoffISO(filters.since),
    fit: filters.fit,
    sort: filters.sort,
    savedOnly: filters.savedOnly,
    company: filters.company,
    status: filters.status,
    fitBand: filters.fitBand,
    excludeKw: filters.excludeKw,
    offset: (filters.page - 1) * filters.pageSize,
    limit: filters.pageSize,
  };

  const { data, error } = await supabase.rpc("search_jobs", {
    p_owner: ownerId,
    f,
  });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as { item: JobWithFit; total: number }[];
  const body: JobsResponse = {
    items: rows.map((r) => r.item),
    total: rows.length ? Number(rows[0].total) : 0,
    page: filters.page,
    pageSize: filters.pageSize,
  };

  return Response.json(body);
}
