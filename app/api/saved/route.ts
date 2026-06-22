import { requireOwner } from "@/lib/auth-helpers";

/** Save a job (idempotent). Body: { job_id: number, note?: string } */
export async function POST(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const body = await request.json().catch(() => ({}));
  const jobId = Number(body.job_id);
  if (!Number.isFinite(jobId)) {
    return Response.json({ error: "job_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("saved_jobs")
    .upsert(
      { owner_id: ownerId, job_id: jobId, note: body.note ?? null },
      { onConflict: "owner_id,job_id" },
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

/** Unsave a job. Query: ?job_id=number */
export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const jobId = Number(new URL(request.url).searchParams.get("job_id"));
  if (!Number.isFinite(jobId)) {
    return Response.json({ error: "job_id required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("saved_jobs")
    .delete()
    .eq("owner_id", ownerId)
    .eq("job_id", jobId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
