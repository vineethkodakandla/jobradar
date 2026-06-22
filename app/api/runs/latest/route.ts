import { requireOwner } from "@/lib/auth-helpers";

/** Latest scrape run for the "synced HH:MM ET / N new today" status strip. */
export async function GET() {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase } = auth.ctx;

  const { data, error } = await supabase
    .from("scrape_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? null);
}
