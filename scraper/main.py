"""JobRadar scraper orchestrator.

Runs HOURLY from GitHub Actions (cron is irregular/best-effort). Responsibilities:
  1. Write a ``scrape_runs`` heartbeat row FIRST (keep-alive — anti-pause).
  2. Dedup guard only: skip the body if a 'success' run finished < RECENT_SUCCESS
     _MINUTES ago (manual/dispatch always run). The rate-sensitive sources
     (Adzuna/Remotive/RemoteOK) additionally run only every COURTESY_INTERVAL
     _HOURS of elapsed time; the ATS boards + The Muse run every scrape.
  3. Per-source fetch -> normalize -> upsert, with source failures isolated and
     the Adzuna call budget enforced (per-run + monthly, recorded in adzuna_calls).
  4. Deactivate stale rows for SUCCEEDED sources only.
  5. Fit: embed profile (if changed/missing) + new/changed jobs, score, upsert
     job_fit. If the profile changed, re-score ALL active jobs via stored
     vectors (numpy cosine, no job re-embedding).
  6. Finalize scrape_runs; on exception mark 'failed' + exit non-zero.
  7. DB hygiene: hard-delete jobs inactive > 30 days.

Runnable both as ``python -m scraper.main`` (package, relative imports) and as
``python scraper/main.py`` (the sys.path shim below makes the package importable).
"""

from __future__ import annotations

import logging
import os
import re
import sys
import traceback
from dataclasses import dataclass, field
from datetime import datetime, time as dtime, timezone
from typing import Any, Optional

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - py<3.9 fallback (not expected on 3.12)
    from backports.zoneinfo import ZoneInfo  # type: ignore

# --- dual-mode import shim ----------------------------------------------------
# Allow `python scraper/main.py` (no package context) as well as
# `python -m scraper.main` (package context with relative imports).
if __package__ in (None, ""):
    _here = os.path.dirname(os.path.abspath(__file__))
    _repo_root = os.path.dirname(_here)
    if _repo_root not in sys.path:
        sys.path.insert(0, _repo_root)
    from scraper import db, fit, normalize  # type: ignore
    from scraper.sources.adzuna import AdzunaSource  # type: ignore
    from scraper.sources.themuse import TheMuseSource  # type: ignore
    from scraper.sources.remotive import RemotiveSource  # type: ignore
    from scraper.sources.remoteok import RemoteOKSource  # type: ignore
    from scraper.sources.ats.greenhouse import GreenhouseSource  # type: ignore
    from scraper.sources.ats.lever import LeverSource  # type: ignore
    from scraper.sources.ats.ashby import AshbySource  # type: ignore
    from scraper.sources.ats.smartrecruiters import SmartRecruitersSource  # type: ignore
    from scraper.fit import Profile  # type: ignore
else:
    from . import db, fit, normalize
    from .sources.adzuna import AdzunaSource
    from .sources.themuse import TheMuseSource
    from .sources.remotive import RemotiveSource
    from .sources.remoteok import RemoteOKSource
    from .sources.ats.greenhouse import GreenhouseSource
    from .sources.ats.lever import LeverSource
    from .sources.ats.ashby import AshbySource
    from .sources.ats.smartrecruiters import SmartRecruitersSource
    from .fit import Profile

import yaml

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(name)s | %(message)s",
)
log = logging.getLogger("jobradar.main")

EASTERN = ZoneInfo("America/New_York")
WINDOW_START = dtime(5, 45)
WINDOW_END = dtime(6, 55)
# We scrape hourly (cron), so there is no daily time-of-day window. This dedup
# only stops a duplicate cron fire from re-running within the hour (must be < 60
# so back-to-back hourly runs are NOT skipped); manual/dispatch always run.
RECENT_SUCCESS_MINUTES = 45
COMPANIES_YML = os.path.join(os.path.dirname(os.path.abspath(__file__)), "companies.yml")

# ATS boards (greenhouse/lever/ashby) return EVERY role at a company (sales,
# marketing, ops, ...). The owner only wants tech roles, so filter ATS titles to
# engineering / ML / AI / data / SWE / FDE. Aggregators are already query-scoped
# to these roles, so they are left unfiltered.
_ATS_SLUGS = {"greenhouse", "lever", "ashby", "smartrecruiters"}
_TECH_TITLE_RE = re.compile(
    r"(engineer|engineering|developer|software|\bswe\b|\bsde\b|programmer|"
    r"architect|machine learning|\bml\b|artificial intelligence|\bai\b|"
    r"data scien|data engineer|scientist|backend|back[- ]end|frontend|"
    r"front[- ]end|full[- ]?stack|platform|infrastructure|devops|mlops|"
    r"\bsre\b|site reliability|applied scien|research|forward deployed|\bfde\b|"
    r"\bnlp\b|\bllm\b|deep learning|computer vision|robotics|firmware|embedded|"
    r"technical staff|analytics)",
    re.I,
)


def is_tech_title(title: str) -> bool:
    return bool(_TECH_TITLE_RE.search(title or ""))


# --- environment -------------------------------------------------------------

@dataclass
class Env:
    supabase_url: str
    supabase_key: str
    owner_user_id: str
    adzuna_app_id: Optional[str]
    adzuna_app_key: Optional[str]
    anthropic_api_key: Optional[str]
    use_llm_rationale: bool
    trigger: str  # 'cron' | 'manual' | 'dispatch'

    @classmethod
    def load(cls) -> "Env":
        url = os.environ.get("SUPABASE_URL", "").strip()
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        owner = os.environ.get("OWNER_USER_ID", "").strip()
        # Missing Supabase creds (or owner) -> hard error at startup (spec).
        missing = [n for n, v in
                   (("SUPABASE_URL", url), ("SUPABASE_SERVICE_ROLE_KEY", key),
                    ("OWNER_USER_ID", owner)) if not v]
        if missing:
            raise SystemExit(
                "FATAL: missing required env var(s): " + ", ".join(missing)
            )
        use_llm = os.environ.get("USE_LLM_RATIONALE", "false").strip().lower() in (
            "1", "true", "yes", "on"
        )
        return cls(
            supabase_url=url,
            supabase_key=key,
            owner_user_id=owner,
            adzuna_app_id=os.environ.get("ADZUNA_APP_ID", "").strip() or None,
            adzuna_app_key=os.environ.get("ADZUNA_APP_KEY", "").strip() or None,
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", "").strip() or None,
            use_llm_rationale=use_llm,
            trigger=(os.environ.get("SCRAPE_TRIGGER", "cron").strip().lower() or "cron"),
        )


# --- DST / day guards --------------------------------------------------------

def in_scrape_window(now_eastern: datetime) -> bool:
    return WINDOW_START <= now_eastern.time() <= WINDOW_END


def eastern_day_start_utc(now_eastern: datetime) -> datetime:
    """Midnight (start of today) in Eastern, expressed as a UTC instant."""
    midnight_et = now_eastern.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_et.astimezone(timezone.utc)


# --- source assembly ---------------------------------------------------------

def load_company_tokens() -> dict[str, list[str]]:
    try:
        with open(COMPANIES_YML, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
    except (OSError, yaml.YAMLError) as exc:
        log.warning("Could not read companies.yml (%s) — ATS sources empty.", exc)
        return {"greenhouse": [], "lever": [], "ashby": [], "smartrecruiters": []}
    return {
        "greenhouse": list(data.get("greenhouse") or []),
        "lever": list(data.get("lever") or []),
        "ashby": list(data.get("ashby") or []),
        "smartrecruiters": list(data.get("smartrecruiters") or []),
    }


# Adzuna allows 2,500 API calls/MONTH. Since we now scrape hourly, cap per-run
# usage AND only run the rate-sensitive sources every COURTESY_INTERVAL_HOURS.
ADZUNA_PER_RUN = 20
ADZUNA_MONTHLY_CAP = 2400
# Rate-sensitive sources (Adzuna/Remotive/RemoteOK) run at most once per this many
# hours of ELAPSED TIME (~4x/day) — keeps Adzuna under its monthly cap and avoids
# 403s from courtesy endpoints, regardless of how irregular GitHub's cron is.
COURTESY_INTERVAL_HOURS = 6


def build_sources(
    env: Env, tokens: dict[str, list[str]], adzuna_budget: int, run_courtesy: bool
) -> tuple[list[Any], Optional[AdzunaSource]]:
    """Instantiate the enabled sources. Returns (sources, adzuna_or_None).

    ``run_courtesy`` gates the rate-sensitive sources (Adzuna's monthly cap +
    Remotive/RemoteOK courtesy endpoints) so they run only a few times a day,
    while the company ATS boards + The Muse run on every (hourly) scrape.
    """
    sources: list[Any] = []
    adzuna: Optional[AdzunaSource] = None

    if env.adzuna_app_id and env.adzuna_app_key:
        if not run_courtesy:
            log.info("Adzuna throttled this run (courtesy cadence).")
        elif adzuna_budget > 0:
            adzuna = AdzunaSource(
                env.adzuna_app_id, env.adzuna_app_key, call_budget=adzuna_budget
            )
            sources.append(adzuna)
        else:
            log.warning("Adzuna monthly budget spent — skipping Adzuna this run.")
    else:
        log.warning("Adzuna keys missing — skipping Adzuna source (run continues).")

    sources.append(TheMuseSource())                      # API, tolerant — every run
    if run_courtesy:
        sources.append(RemotiveSource())                 # courtesy endpoint — throttled
        sources.append(RemoteOKSource())                 # courtesy endpoint — throttled
    else:
        log.info("Remotive/RemoteOK throttled this run (courtesy cadence).")
    sources.append(GreenhouseSource(tokens.get("greenhouse", [])))  # ATS — every run
    sources.append(LeverSource(tokens.get("lever", [])))            # ATS — every run
    sources.append(AshbySource(tokens.get("ashby", [])))           # ATS — every run
    sources.append(SmartRecruitersSource(tokens.get("smartrecruiters", [])))  # ATS — every run
    return sources, adzuna


# --- run state ---------------------------------------------------------------

@dataclass
class RunState:
    jobs_seen: int = 0
    jobs_upserted: int = 0
    jobs_deactivated: int = 0
    fits_scored: int = 0
    adzuna_calls: int = 0
    per_source: dict[str, Any] = field(default_factory=dict)
    succeeded_source_ids: list[int] = field(default_factory=list)


# --- main scrape body --------------------------------------------------------

def run_scrape(
    client, env: Env, run_started_at: datetime, run_courtesy: bool
) -> RunState:
    state = RunState()
    source_map = db.load_source_map(client)
    tokens = load_company_tokens()
    adzuna_used = 0
    try:
        adzuna_used = db.adzuna_calls_this_month(client)
    except Exception as exc:
        log.warning("Could not read monthly Adzuna usage (%s) — assuming 0.", exc)
    adzuna_budget = max(0, min(ADZUNA_PER_RUN, ADZUNA_MONTHLY_CAP - adzuna_used))
    sources, adzuna = build_sources(env, tokens, adzuna_budget, run_courtesy)

    all_normalized: list[dict[str, Any]] = []

    for source in sources:
        slug = source.slug
        src_row = source_map.get(slug)
        if not src_row:
            log.warning("Source slug %r not in sources table — skipping.", slug)
            state.per_source[slug] = {"status": "no_source_row", "count": 0}
            continue
        if not src_row.get("enabled", True):
            log.info("Source %r disabled — skipping.", slug)
            state.per_source[slug] = {"status": "disabled", "count": 0}
            continue

        try:
            raw_jobs = source.fetch()
            normalized = []
            for rj in raw_jobs:
                nj = normalize.normalize_job(rj)
                if nj is not None:
                    normalized.append(nj)
            # USA-only (all sources): drop clearly non-US postings.
            us_before = len(normalized)
            normalized = [nj for nj in normalized if normalize.is_us_job(nj)]
            if len(normalized) != us_before:
                log.info("Source %r: US filter %d -> %d.", slug, us_before, len(normalized))
            # ATS boards list every role at a company — keep only tech titles.
            if slug in _ATS_SLUGS:
                before = len(normalized)
                normalized = [nj for nj in normalized if is_tech_title(nj.get("title", ""))]
                log.info("Source %r: ATS title filter %d -> %d tech roles.",
                         slug, before, len(normalized))
            all_normalized.extend(normalized)
            state.jobs_seen += len(normalized)
            state.succeeded_source_ids.append(src_row["id"])
            state.per_source[slug] = {"status": "ok", "count": len(normalized)}
            log.info("Source %r: %d normalized jobs.", slug, len(normalized))
        except Exception as exc:  # isolate per-source failures (never abort run)
            log.warning("Source %r FAILED (isolated): %s", slug, exc)
            state.per_source[slug] = {"status": "error", "error": str(exc), "count": 0}

    if adzuna is not None:
        state.adzuna_calls = adzuna.calls_made

    # De-duplicate within this run on (source_slug, external_id) — last wins.
    deduped: dict[tuple[str, str], dict[str, Any]] = {}
    for nj in all_normalized:
        deduped[(nj["source_slug"], nj["external_id"])] = nj
    normalized_jobs = list(deduped.values())

    # Upsert
    upserted_rows, n_upserted = db.upsert_jobs(
        client, normalized_jobs, source_map, run_started_at
    )
    state.jobs_upserted = n_upserted

    # Stamp last_run_at on the sources that ran successfully.
    db.touch_source_run(client, state.succeeded_source_ids)

    # Deactivate stale rows for SUCCEEDED sources only.
    state.jobs_deactivated = db.deactivate_stale_jobs(
        client, state.succeeded_source_ids, run_started_at
    )

    # Fit scoring
    state.fits_scored = run_fit(client, env, upserted_rows)

    # DB hygiene (single place): hard-delete long-inactive jobs.
    db.purge_old_inactive_jobs(client, older_than_days=30)

    return state


# --- fit pipeline ------------------------------------------------------------

def run_fit(client, env: Env, upserted_rows: list[dict[str, Any]]) -> int:
    """Embed profile + new/changed jobs, score, upsert job_fit.

    Returns the number of job_fit rows written.
    """
    profile_row = db.fetch_profile(client, env.owner_user_id)
    if not profile_row:
        log.warning("No skills_profile row for owner — skipping fit scoring.")
        return 0

    profile = Profile.from_row(profile_row)

    # 1) Profile embedding: recompute if hash changed OR no embedding yet.
    new_profile_hash = _profile_hash(profile)
    stored_hash = profile_row.get("profile_hash") or ""
    stored_embedding = fit.pg_literal_to_vector(profile_row.get("embedding"))
    profile_changed = (stored_embedding is None) or (stored_hash != new_profile_hash)

    if profile_changed:
        log.info("Profile changed/missing embedding — re-embedding profile.")
        prof_vec = fit.embed_one(profile.profile_embed_text())
        db.update_profile_embedding(
            client, env.owner_user_id, fit.vector_to_pg_literal(prof_vec), new_profile_hash
        )
        profile.profile_hash = new_profile_hash
    else:
        prof_vec = stored_embedding
        profile.profile_hash = stored_hash

    # 2) Embed NEW/CHANGED jobs (those lacking an embedding among the upserts).
    jobs_needing_embed = [r for r in upserted_rows if not r.get("embedding")]
    if jobs_needing_embed:
        log.info("Embedding %d new/changed jobs.", len(jobs_needing_embed))
        texts = [
            fit.job_embed_text(r.get("title", ""), r.get("description", ""))
            for r in jobs_needing_embed
        ]
        vecs = fit.embed_texts(texts)
        for row, vec in zip(jobs_needing_embed, vecs):
            row["embedding"] = fit.vector_to_pg_literal(vec)  # scoring pass sees it
        # One upsert per chunk instead of one UPDATE per job (time-budget fix).
        db.bulk_write_job_embeddings(client, jobs_needing_embed)

    # 3) Decide scope: profile changed -> ALL active jobs; else just the upserts.
    if profile_changed:
        log.info("Profile changed -> re-scoring ALL active jobs (numpy cosine).")
        score_targets = db.fetch_active_jobs_for_scoring(client)
    else:
        # Score the jobs we just upserted (need their stored vectors back).
        score_targets = _reload_job_vectors(client, upserted_rows)

    fit_rows = score_all(profile, prof_vec, score_targets, env)
    return db.upsert_job_fits(client, fit_rows)


def _reload_job_vectors(client, upserted_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Reload full scorer fields (incl. embedding) for just the upserted jobs."""
    ids = [r["id"] for r in upserted_rows]
    if not ids:
        return []
    out: list[dict[str, Any]] = []
    CHUNK = 500
    cols = (
        "id,title,description,tags,experience_level,years_min,work_type,"
        "is_remote,country,posted_at,embedding"
    )
    for i in range(0, len(ids), CHUNK):
        chunk = ids[i : i + CHUNK]
        resp = client.table("jobs").select(cols).in_("id", chunk).execute()
        out.extend(resp.data or [])
    return out


def score_all(
    profile: Profile,
    prof_vec,
    jobs: list[dict[str, Any]],
    env: Env,
) -> list[dict[str, Any]]:
    """Score every job in ``jobs`` against the profile; build job_fit rows.

    Cosine uses the stored job embedding (numpy), equivalent to the SQL
    ``1 - (embedding <=> :profile_vec)`` but simpler. Jobs without a stored
    embedding fall back to cos=0 (semantic component -> 0).
    """
    import numpy as np

    rows: list[dict[str, Any]] = []
    results_cache: list[tuple[dict[str, Any], fit.FitResult]] = []

    for job in jobs:
        job_vec = fit.pg_literal_to_vector(job.get("embedding"))
        cos = fit.cosine(prof_vec, job_vec) if job_vec is not None else 0.0
        result = fit.score_job(profile, job, cos)
        results_cache.append((job, result))
        rows.append(
            {
                "owner_id": env.owner_user_id,
                "job_id": job["id"],
                "profile_hash": profile.profile_hash,
                "score": result.score,
                "band": result.band,
                "rationale": result.rationale,
                "rationale_llm": None,
                "matched_skills": result.matched_skills,
                "missing_skills": result.missing_skills,
                "components": result.components,
                "job_level": result.job_level,
                "gated": result.gated,
                "gate_reason": result.gate_reason,
                "model": fit.MODEL_LABEL,
            }
        )

    # Optional LLM rationale for the top ~15 Strong/Good jobs only.
    if env.use_llm_rationale and env.anthropic_api_key:
        _apply_llm_rationale(env, results_cache, rows)

    return rows


def _apply_llm_rationale(
    env: Env,
    results_cache: list[tuple[dict[str, Any], fit.FitResult]],
    rows: list[dict[str, Any]],
) -> None:
    """Rewrite rationale for the top ~15 Strong/Good jobs (OFF by default)."""
    candidates = [
        (job, res, idx)
        for idx, (job, res) in enumerate(results_cache)
        if res.band in ("Strong", "Good")
    ]
    candidates.sort(key=lambda t: t[1].score, reverse=True)
    top = candidates[:15]
    log.info("LLM rationale ON — rewriting %d top Strong/Good jobs.", len(top))
    for job, res, idx in top:
        text = fit.maybe_llm_rationale(env.anthropic_api_key, res, job.get("title", ""))
        if text:
            rows[idx]["rationale_llm"] = text


def _profile_hash(profile: Profile) -> str:
    """Deterministic hash over the inputs that affect scoring.

    The app recomputes profile_hash on PUT /api/profile too; here we recompute
    from the same scoring-relevant fields so a cron-side first run (or any
    drift) still triggers the right re-score.
    """
    import hashlib
    import json

    basis = json.dumps(
        {
            "skills": sorted(
                [
                    {"skill": s.skill, "aliases": sorted(s.aliases), "weight": s.weight}
                    for s in profile.skills
                ],
                key=lambda d: d["skill"].lower(),
            ),
            "resume_text": profile.resume_text or "",
            "open_to_relocate": profile.open_to_relocate,
            "remote_only": profile.remote_only,
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


# --- entrypoint --------------------------------------------------------------

def main() -> int:
    env = Env.load()
    client = db.make_client(env.supabase_url, env.supabase_key)

    is_manual = env.trigger in ("manual", "dispatch")

    # --- guard decision (heartbeat is written regardless) ---
    # Cron runs every interval; manual/dispatch always runs. The only skip is a
    # safety dedup: if a 'success' run finished very recently, a near-simultaneous
    # cron fire is a no-op (it still writes a keep-alive heartbeat).
    should_skip = False
    skip_reason = ""
    if not is_manual:
        try:
            if db.recent_success_within(client, minutes=RECENT_SUCCESS_MINUTES):
                should_skip = True
                skip_reason = f"a 'success' run finished < {RECENT_SUCCESS_MINUTES} min ago"
        except Exception as exc:
            log.warning("Could not check recent runs (%s) — proceeding.", exc)

    if should_skip:
        # MANDATORY keep-alive: still write a heartbeat row (status='skipped').
        log.info("Guarded skip: %s. Writing keep-alive heartbeat only.", skip_reason)
        try:
            db.start_run(client, trigger=env.trigger, status="skipped")
        except Exception as exc:
            log.error("Heartbeat write FAILED on skip path: %s", exc)
            return 1
        return 0

    # --- real run ---
    run_started_at = datetime.now(timezone.utc)
    # Rate-sensitive sources (Adzuna/Remotive/RemoteOK) run only after
    # COURTESY_INTERVAL_HOURS of ELAPSED TIME since they last ran (or always on a
    # manual trigger); the ATS boards + Muse run on every scrape. Time-based, not
    # UTC-hour-keyed, so GitHub's irregular cron can't strand them forever.
    if is_manual:
        run_courtesy = True
    else:
        try:
            run_courtesy = (
                db.hours_since_last_courtesy(client) >= COURTESY_INTERVAL_HOURS
            )
        except Exception as exc:
            log.warning("Courtesy check failed (%s) — including courtesy sources.", exc)
            run_courtesy = True
    log.info("run_courtesy=%s (rate-sensitive sources %s this run)",
             run_courtesy, "INCLUDED" if run_courtesy else "throttled")
    run_id = db.start_run(client, trigger=env.trigger, status="running")

    try:
        state = run_scrape(client, env, run_started_at, run_courtesy)
    except Exception as exc:
        err = f"{exc}\n{traceback.format_exc()}"
        log.error("Run FAILED: %s", err)
        try:
            db.finish_run(client, run_id, status="failed", error_text=err[:8000])
        except Exception as exc2:
            log.error("Failed to write failure status: %s", exc2)
        return 1

    # Determine final status: partial if any source errored.
    any_error = any(
        info.get("status") == "error" for info in state.per_source.values()
    )
    any_ok = bool(state.succeeded_source_ids)
    if not any_ok:
        status = "failed"
    elif any_error:
        status = "partial"
    else:
        status = "success"

    db.finish_run(
        client,
        run_id,
        status=status,
        jobs_seen=state.jobs_seen,
        jobs_upserted=state.jobs_upserted,
        jobs_deactivated=state.jobs_deactivated,
        fits_scored=state.fits_scored,
        adzuna_calls=state.adzuna_calls,
        per_source=state.per_source,
    )

    log.info(
        "Done: seen=%d upserted=%d deactivated=%d fits=%d adzuna_calls=%d status=%s",
        state.jobs_seen, state.jobs_upserted, state.jobs_deactivated,
        state.fits_scored, state.adzuna_calls, status,
    )
    # All-sources-failed is a failure (non-zero exit), but the heartbeat row
    # written in start_run already satisfies the keep-alive.
    return 0 if status != "failed" else 1


if __name__ == "__main__":
    sys.exit(main())
