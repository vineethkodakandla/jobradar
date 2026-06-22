"""Supabase data-access layer (service-role client).

All DB writes go through here so the column contract in
``supabase/migrations/0001_init.sql`` lives in one place. The service-role key
bypasses RLS, so jobs / job_fit / scrape_runs are written with no write policy.
``job_fit.owner_id`` is stamped explicitly with ``OWNER_USER_ID`` (the service
role has no ``auth.uid()``).

pgvector values are sent as the string literal '[v1,v2,...]' (see fit.py
``vector_to_pg_literal``) which supabase-py serializes correctly for the
``vector`` column.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from supabase import Client, create_client

log = logging.getLogger("jobradar.db")

# Columns we refresh on conflict (mutable fields + bookkeeping). first_seen_at
# and external identity are intentionally NOT updated.
_JOB_MUTABLE_COLUMNS = (
    "title", "company", "description", "apply_url", "location_raw", "city",
    "state", "country", "is_remote", "work_type", "salary_min", "salary_max",
    "salary_currency", "salary_period", "salary_is_estimated", "experience_level",
    "years_min", "years_max", "tags", "posted_at", "raw",
)


def make_client(url: str, service_role_key: str) -> Client:
    """Create a service-role supabase-py v2 client."""
    return create_client(url, service_role_key)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- sources -----------------------------------------------------------------

def load_source_map(client: Client) -> dict[str, dict[str, Any]]:
    """slug -> {id, enabled, kind} for every row in ``sources``."""
    resp = client.table("sources").select("id,slug,kind,enabled").execute()
    out: dict[str, dict[str, Any]] = {}
    for row in resp.data or []:
        out[row["slug"]] = row
    return out


def touch_source_run(client: Client, source_ids: list[int]) -> None:
    """Stamp ``last_run_at`` on the sources that ran this cycle."""
    if not source_ids:
        return
    try:
        (
            client.table("sources")
            .update({"last_run_at": _now_iso()})
            .in_("id", source_ids)
            .execute()
        )
    except Exception as exc:
        log.warning("Failed to stamp sources.last_run_at: %s", exc)


# --- scrape_runs (heartbeat + lifecycle) -------------------------------------

def start_run(client: Client, trigger: str, status: str = "running") -> int:
    """Insert the heartbeat ``scrape_runs`` row first; return its id.

    This is the keep-alive write — it must happen on EVERY invocation, including
    a guarded skip (call with status='skipped') so the DB is never starved.
    """
    payload: dict[str, Any] = {
        "status": status,
        "trigger": trigger,
        "started_at": _now_iso(),
    }
    if status in ("skipped", "success", "failed", "partial"):
        payload["finished_at"] = _now_iso()
    resp = client.table("scrape_runs").insert(payload).execute()
    run_id = resp.data[0]["id"]
    log.info("scrape_runs heartbeat row %d written (status=%s, trigger=%s).",
             run_id, status, trigger)
    return run_id


def finish_run(
    client: Client,
    run_id: int,
    *,
    status: str,
    jobs_seen: int = 0,
    jobs_upserted: int = 0,
    jobs_deactivated: int = 0,
    fits_scored: int = 0,
    adzuna_calls: int = 0,
    per_source: Optional[dict[str, Any]] = None,
    error_text: Optional[str] = None,
) -> None:
    """Finalize the run row with counters + status."""
    payload: dict[str, Any] = {
        "status": status,
        "finished_at": _now_iso(),
        "jobs_seen": jobs_seen,
        "jobs_upserted": jobs_upserted,
        "jobs_deactivated": jobs_deactivated,
        "fits_scored": fits_scored,
        "adzuna_calls": adzuna_calls,
        "per_source": per_source or {},
        "error_text": error_text,
    }
    client.table("scrape_runs").update(payload).eq("id", run_id).execute()
    log.info("scrape_runs row %d finalized (status=%s).", run_id, status)


def success_run_exists_today(client: Client, day_start_utc: datetime) -> bool:
    """Is there already a 'success' run since the start of today (ET, passed in
    as a UTC instant)? Used to skip duplicate same-day work (spec §6)."""
    resp = (
        client.table("scrape_runs")
        .select("id")
        .eq("status", "success")
        .gte("started_at", day_start_utc.isoformat())
        .limit(1)
        .execute()
    )
    return bool(resp.data)


# --- jobs upsert -------------------------------------------------------------

def upsert_jobs(
    client: Client,
    normalized_jobs: list[dict[str, Any]],
    source_map: dict[str, dict[str, Any]],
    run_started_at: datetime,
) -> tuple[list[dict[str, Any]], int]:
    """Upsert normalized jobs ON CONFLICT (source_id, external_id).

    Resolves ``source_slug`` -> ``source_id``, sets last_seen_at/is_active, and
    returns (rows_with_ids, upserted_count). The returned rows include the DB
    ``id`` and ``embedding`` so fit.py can decide which jobs are new/changed.
    """
    if not normalized_jobs:
        return [], 0

    now = _now_iso()
    payloads: list[dict[str, Any]] = []
    for job in normalized_jobs:
        slug = job.get("source_slug")
        src = source_map.get(slug)
        if not src:
            log.warning("No source row for slug %r — skipping its jobs.", slug)
            continue
        row = {k: v for k, v in job.items() if k != "source_slug"}
        row["source_id"] = src["id"]
        row["last_seen_at"] = now
        row["is_active"] = True
        payloads.append(row)

    if not payloads:
        return [], 0

    # supabase-py upsert with the (source_id, external_id) unique constraint.
    # Chunk to keep request bodies sane (raw jsonb can be large).
    upserted: list[dict[str, Any]] = []
    CHUNK = 200
    for i in range(0, len(payloads), CHUNK):
        chunk = payloads[i : i + CHUNK]
        resp = (
            client.table("jobs")
            .upsert(
                chunk,
                on_conflict="source_id,external_id",
                returning="representation",
            )
            .execute()
        )
        upserted.extend(resp.data or [])

    log.info("Upserted %d job rows.", len(upserted))
    return upserted, len(upserted)


def deactivate_stale_jobs(
    client: Client,
    succeeded_source_ids: list[int],
    run_started_at: datetime,
) -> int:
    """is_active=false WHERE source_id = ANY(succeeded) AND last_seen_at < run_start.

    Only sources that SUCCEEDED are passed in — a single source failure must not
    mass-deactivate (spec §6).
    """
    if not succeeded_source_ids:
        return 0
    resp = (
        client.table("jobs")
        .update({"is_active": False})
        .in_("source_id", succeeded_source_ids)
        .lt("last_seen_at", run_started_at.isoformat())
        .eq("is_active", True)
        .execute()
    )
    n = len(resp.data or [])
    log.info("Deactivated %d stale jobs.", n)
    return n


def purge_old_inactive_jobs(client: Client, older_than_days: int = 30) -> int:
    """Hard-delete jobs inactive for > N days (DB hygiene, spec §6/§7)."""
    cutoff = datetime.now(timezone.utc).timestamp() - older_than_days * 86400
    cutoff_iso = datetime.fromtimestamp(cutoff, tz=timezone.utc).isoformat()
    resp = (
        client.table("jobs")
        .delete()
        .eq("is_active", False)
        .lt("last_seen_at", cutoff_iso)
        .execute()
    )
    n = len(resp.data or [])
    if n:
        log.info("Hard-deleted %d jobs inactive > %d days.", n, older_than_days)
    return n


def update_job_embedding(client: Client, job_id: int, vector_literal: str) -> None:
    """Write a single job's embedding (pgvector text literal)."""
    client.table("jobs").update({"embedding": vector_literal}).eq("id", job_id).execute()


def bulk_write_job_embeddings(client: Client, rows: list[dict[str, Any]]) -> int:
    """Batch-write embeddings via one upsert per chunk (not one UPDATE per job).

    Each row must already carry its identity columns + the ``embedding`` pgvector
    literal. Conflicts on the existing (source_id, external_id) unique key and
    updates only the embedding-bearing slim payload. The previous per-row UPDATE
    loop did thousands of sequential round-trips and blew the Actions time budget.
    NB: ``id`` is GENERATED ALWAYS, so it is intentionally omitted from the payload.
    """
    slim = [
        {
            "source_id": r["source_id"],
            "external_id": r["external_id"],
            "dedupe_hash": r["dedupe_hash"],
            "title": r["title"],
            "apply_url": r["apply_url"],
            "embedding": r["embedding"],
        }
        for r in rows
        if r.get("embedding") and r.get("source_id") and r.get("external_id")
    ]
    if not slim:
        return 0
    n = 0
    CHUNK = 500
    for i in range(0, len(slim), CHUNK):
        chunk = slim[i : i + CHUNK]
        client.table("jobs").upsert(chunk, on_conflict="source_id,external_id").execute()
        n += len(chunk)
    log.info("Bulk-wrote %d job embeddings.", n)
    return n


def fetch_active_jobs_for_scoring(
    client: Client, columns: Optional[str] = None
) -> list[dict[str, Any]]:
    """All active jobs with the fields the scorer needs (incl. stored embedding)."""
    cols = columns or (
        "id,title,description,tags,experience_level,years_min,work_type,"
        "is_remote,country,posted_at,embedding,dedupe_hash"
    )
    rows: list[dict[str, Any]] = []
    PAGE = 1000
    start = 0
    while True:
        resp = (
            client.table("jobs")
            .select(cols)
            .eq("is_active", True)
            .order("id")
            .range(start, start + PAGE - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        start += PAGE
    return rows


# --- skills_profile ----------------------------------------------------------

def fetch_profile(client: Client, owner_id: str) -> Optional[dict[str, Any]]:
    """Read the owner's ``skills_profile`` row (or None if not seeded yet)."""
    resp = (
        client.table("skills_profile")
        .select(
            "owner_id,skills,open_to_relocate,remote_only,resume_text,"
            "profile_hash,embedding"
        )
        .eq("owner_id", owner_id)
        .limit(1)
        .execute()
    )
    data = resp.data or []
    return data[0] if data else None


def update_profile_embedding(
    client: Client, owner_id: str, vector_literal: str, profile_hash: str
) -> None:
    """Persist the profile embedding + the hash it was computed for."""
    (
        client.table("skills_profile")
        .update({"embedding": vector_literal, "profile_hash": profile_hash})
        .eq("owner_id", owner_id)
        .execute()
    )


# --- job_fit -----------------------------------------------------------------

def upsert_job_fits(
    client: Client, fit_rows: list[dict[str, Any]]
) -> int:
    """Upsert ``job_fit`` rows ON CONFLICT (owner_id, job_id) (the PK)."""
    if not fit_rows:
        return 0
    total = 0
    CHUNK = 200
    for i in range(0, len(fit_rows), CHUNK):
        chunk = fit_rows[i : i + CHUNK]
        resp = (
            client.table("job_fit")
            .upsert(chunk, on_conflict="owner_id,job_id", returning="representation")
            .execute()
        )
        total += len(resp.data or [])
    log.info("Upserted %d job_fit rows.", total)
    return total
