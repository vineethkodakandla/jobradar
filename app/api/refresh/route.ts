import { requireOwner } from "@/lib/auth-helpers";
import { startOfEasternDayUTC } from "@/lib/time";
import type { RefreshResponse } from "@/lib/types";

const MAX_MANUAL_PER_DAY = 24;
const MIN_GAP_MS = 60_000;

/**
 * Trigger the GitHub Actions scraper via repository_dispatch. Capped at
 * 10 manual runs/day (protects the free Actions-minutes budget) and ~1/min.
 * Counts today's (ET) manual scrape_runs rows as the usage signal.
 */
export async function POST() {
  const auth = await requireOwner();
  if (!auth.ok) return auth.response;
  const { supabase } = auth.ctx;

  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_REPO;
  if (!token || !repo) {
    return Response.json(
      { ok: false, remaining_today: 0, message: "Refresh not configured (GH_DISPATCH_TOKEN/GH_REPO)." } satisfies RefreshResponse,
      { status: 500 },
    );
  }

  const dayStart = startOfEasternDayUTC().toISOString();
  const { data: todays } = await supabase
    .from("scrape_runs")
    .select("started_at")
    .eq("trigger", "manual")
    .gte("started_at", dayStart)
    .order("started_at", { ascending: false });

  const count = todays?.length ?? 0;
  if (count >= MAX_MANUAL_PER_DAY) {
    return Response.json(
      { ok: false, remaining_today: 0, message: "Daily manual-refresh limit reached (24/day)." } satisfies RefreshResponse,
      { status: 429 },
    );
  }
  if (todays?.length) {
    const last = new Date(todays[0].started_at).getTime();
    if (Date.now() - last < MIN_GAP_MS) {
      return Response.json(
        { ok: false, remaining_today: MAX_MANUAL_PER_DAY - count, message: "Please wait a minute between refreshes." } satisfies RefreshResponse,
        { status: 429 },
      );
    }
  }

  const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "jobradar-app",
    },
    body: JSON.stringify({ event_type: "manual-scrape" }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return Response.json(
      { ok: false, remaining_today: MAX_MANUAL_PER_DAY - count, message: `GitHub dispatch failed (${res.status}). ${detail.slice(0, 140)}` } satisfies RefreshResponse,
      { status: 502 },
    );
  }

  return Response.json(
    { ok: true, remaining_today: MAX_MANUAL_PER_DAY - count - 1, message: "Scrape queued." } satisfies RefreshResponse,
  );
}
