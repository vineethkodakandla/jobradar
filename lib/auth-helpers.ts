import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminSupabase } from "./supabase/admin";
import { GATE_COOKIE, verifyToken } from "./gate";

export interface OwnerContext {
  /** Service-role client (RLS-bypassing). Always filter by `ownerId` explicitly. */
  supabase: SupabaseClient;
  /** The data owner (OWNER_USER_ID) — the uuid the scraper stamps rows with. */
  ownerId: string;
}

/**
 * Resolve whether the current request holds a valid access-code cookie. The
 * data owner is OWNER_USER_ID (a real auth.users uuid the scraper writes under).
 */
export async function getGateOwner(): Promise<{ ok: boolean; ownerId: string | null }> {
  const store = await cookies();
  const valid = await verifyToken(store.get(GATE_COOKIE)?.value);
  const ownerId = process.env.OWNER_USER_ID ?? null;
  // The cookie alone grants page ACCESS; OWNER_USER_ID is only needed to read
  // DATA (enforced in requireOwner). This lets the gate work before Supabase
  // is wired up — you get in, the dashboard just has no data yet.
  return { ok: Boolean(valid), ownerId };
}

/** API-route guard: returns the owner ctx, or a 401 Response when locked. */
export async function requireOwner(): Promise<
  { ok: true; ctx: OwnerContext } | { ok: false; response: Response }
> {
  const { ok, ownerId } = await getGateOwner();
  if (!ok || !ownerId) {
    return {
      ok: false,
      response: Response.json({ error: "locked" }, { status: 401 }),
    };
  }
  return { ok: true, ctx: { supabase: createAdminSupabase(), ownerId } };
}
