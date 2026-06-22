import { requireOwner } from "@/lib/auth-helpers";
import type { AppStatus } from "@/lib/types";

const PATCHABLE = [
  "status",
  "notes",
  "next_action",
  "next_action_at",
  "applied_at",
  "position",
] as const;

/** Update an application. Body: any subset of the patchable fields. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  for (const key of PATCHABLE) {
    if (key in body) update[key] = body[key];
  }

  // Auto-stamp applied_at the first time it reaches "applied".
  if (body.status === ("applied" as AppStatus) && !("applied_at" in body)) {
    update.applied_at = new Date().toISOString();
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "no fields" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("applications")
    .update(update)
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** Remove an application from the tracker. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const id = Number((await params).id);
  if (!Number.isFinite(id)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }

  const { error } = await supabase
    .from("applications")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
