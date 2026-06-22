import { requireOwner } from "@/lib/auth-helpers";
import {
  JOB_PUBLIC_COLUMNS,
  type ApplicationWithJob,
  type AppStatus,
  type JobFit,
  type JobWithFit,
} from "@/lib/types";

/** List the owner's applications joined to their jobs (tracker board). */
export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const { data: apps, error } = await supabase
    .from("applications")
    .select(`*, jobs(${JOB_PUBLIC_COLUMNS}, sources(slug, display_name))`)
    .eq("owner_id", ownerId)
    .order("position", { ascending: true, nullsFirst: false })
    .order("updated_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = (apps ?? []) as Record<string, unknown>[];
  const jobIds = rows
    .map((r) => (r.jobs as { id?: number } | null)?.id)
    .filter((x): x is number => typeof x === "number");

  const [{ data: fits }, { data: saves }] = await Promise.all([
    jobIds.length
      ? supabase
          .from("job_fit")
          .select("*")
          .eq("owner_id", ownerId)
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] as JobFit[] }),
    jobIds.length
      ? supabase
          .from("saved_jobs")
          .select("job_id")
          .eq("owner_id", ownerId)
          .in("job_id", jobIds)
      : Promise.resolve({ data: [] as { job_id: number }[] }),
  ]);

  const fitByJob = new Map<number, JobFit>(
    ((fits ?? []) as JobFit[]).map((fit) => [fit.job_id, fit]),
  );
  const savedSet = new Set<number>(
    ((saves ?? []) as { job_id: number }[]).map((s) => s.job_id),
  );

  const result: ApplicationWithJob[] = rows.map((r) => {
    const rawJob = r.jobs as Record<string, unknown> & { id: number };
    const source = rawJob.sources as
      | { slug: string; display_name: string }
      | null;
    const { sources: _s, ...jobCols } = rawJob;
    void _s;
    const job: JobWithFit = {
      ...(jobCols as unknown as JobWithFit),
      source_slug: source?.slug ?? null,
      source_name: source?.display_name ?? null,
      fit: fitByJob.get(rawJob.id) ?? null,
      is_saved: savedSet.has(rawJob.id),
      application_status: r.status as AppStatus,
    };
    return {
      id: r.id as number,
      owner_id: r.owner_id as string,
      job_id: r.job_id as number,
      status: r.status as AppStatus,
      applied_at: (r.applied_at as string | null) ?? null,
      next_action: (r.next_action as string | null) ?? null,
      next_action_at: (r.next_action_at as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      position: (r.position as number | null) ?? null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      job,
    };
  });

  return Response.json(result);
}

/** Create/track an application. Body: { job_id, status? } */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const body = await request.json().catch(() => ({}));
  const jobId = Number(body.job_id);
  const status: AppStatus = body.status ?? "saved";
  if (!Number.isFinite(jobId)) {
    return Response.json({ error: "job_id required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("applications")
    .upsert(
      {
        owner_id: ownerId,
        job_id: jobId,
        status,
        applied_at: status === "applied" ? new Date().toISOString() : null,
      },
      { onConflict: "owner_id,job_id" },
    )
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
