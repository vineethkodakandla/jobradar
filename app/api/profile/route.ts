import { createHash } from "crypto";
import { requireOwner } from "@/lib/auth-helpers";
import type { SkillsProfile } from "@/lib/types";

const PUTABLE = [
  "headline",
  "summary",
  "skills",
  "target_roles",
  "experience_level",
  "years_experience",
  "open_to_relocate",
  "remote_only",
  "preferred_locations",
  "min_salary",
  "resume_text",
] as const;

/** Fields that actually change fit scoring -> drive profile_hash. */
function computeProfileHash(p: Record<string, unknown>): string {
  const material = JSON.stringify({
    skills: p.skills ?? [],
    resume_text: p.resume_text ?? "",
    experience_level: p.experience_level ?? "",
    years_experience: p.years_experience ?? null,
    open_to_relocate: p.open_to_relocate ?? null,
    remote_only: p.remote_only ?? null,
    preferred_locations: p.preferred_locations ?? [],
    min_salary: p.min_salary ?? null,
    target_roles: p.target_roles ?? [],
  });
  return createHash("sha256").update(material).digest("hex");
}

function defaultProfile(ownerId: string): SkillsProfile {
  return {
    owner_id: ownerId,
    headline: null,
    summary: null,
    skills: [],
    target_roles: [],
    experience_level: "entry",
    years_experience: 1,
    open_to_relocate: true,
    remote_only: false,
    preferred_locations: [],
    min_salary: null,
    resume_text: null,
    profile_hash: null,
    updated_at: new Date().toISOString(),
  };
}

export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const { data, error } = await supabase
    .from("skills_profile")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? defaultProfile(ownerId));
}

export async function PUT(request: Request) {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase, ownerId } = auth.ctx;

  const body = await request.json().catch(() => ({}));

  // Start from the existing row so the hash covers the full profile, not just
  // the patched fields.
  const { data: existing } = await supabase
    .from("skills_profile")
    .select("*")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const merged: Record<string, unknown> = { ...(existing ?? {}) };
  for (const key of PUTABLE) {
    if (key in body) merged[key] = body[key];
  }
  merged.owner_id = ownerId;
  merged.profile_hash = computeProfileHash(merged);
  merged.updated_at = new Date().toISOString();
  delete merged.embedding; // recomputed by the scraper on its next run

  const { data, error } = await supabase
    .from("skills_profile")
    .upsert(merged, { onConflict: "owner_id" })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
