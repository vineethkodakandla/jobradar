import { requireOwner } from "@/lib/auth-helpers";
import { JOB_PUBLIC_COLUMNS, type JobWithFit, type JobFit } from "@/lib/types";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const jobId = Number((await params).id);
  if (!Number.isFinite(jobId)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }

  const [{ data: job, error }, { data: fit }, { data: saved }, { data: app }] =
    await Promise.all([
      supabase
        .from("jobs")
        .select(`${JOB_PUBLIC_COLUMNS}, sources(slug, display_name)`)
        .eq("id", jobId)
        .single(),
      supabase
        .from("job_fit")
        .select("*")
        .eq("job_id", jobId)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      supabase
        .from("saved_jobs")
        .select("owner_id")
        .eq("job_id", jobId)
        .eq("owner_id", ownerId)
        .maybeSingle(),
      supabase
        .from("applications")
        .select("status")
        .eq("job_id", jobId)
        .eq("owner_id", ownerId)
        .maybeSingle(),
    ]);

  if (error || !job) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const source = (job as Record<string, unknown>).sources as
    | { slug: string; display_name: string }
    | null;
  delete (job as Record<string, unknown>).sources;

  const result: JobWithFit = {
    ...(job as unknown as JobWithFit),
    source_slug: source?.slug ?? null,
    source_name: source?.display_name ?? null,
    fit: (fit as JobFit | null) ?? null,
    is_saved: Boolean(saved),
    application_status: app?.status ?? null,
  };

  return Response.json(result);
}
