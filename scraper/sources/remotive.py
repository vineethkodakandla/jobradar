"""Remotive aggregator source (remote-only, full descriptions).

Courtesy public endpoint — best-effort, NOT a contractual tier. STRICT limit:
**one daily call** (spec §4). We hit the software-dev category once and take the
whole payload. A 403/429/shape-change logs a warning and yields nothing rather
than failing the run.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from .base import RawJob

log = logging.getLogger("jobradar.sources.remotive")

API_URL = "https://remotive.com/api/remote-jobs"
TIMEOUT = 20
USER_AGENT = (
    "JobRadar/1.0 (single-user job aggregator; +https://github.com/jobradar)"
)


class RemotiveSource:
    slug = "remotive"

    def __init__(self, session: Optional[requests.Session] = None) -> None:
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        params = {"category": "software-dev"}
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        try:
            resp = self._session.get(
                API_URL, params=params, headers=headers, timeout=TIMEOUT
            )
            if resp.status_code != 200:
                log.warning("Remotive -> HTTP %d (best-effort source, skipping).", resp.status_code)
                return []
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("Remotive failed (best-effort source, skipping): %s", exc)
            return []

        jobs: list[RawJob] = []
        seen: set[str] = set()
        for item in data.get("jobs", []) or []:
            raw = self._to_raw_job(item)
            if raw is None or raw.external_id in seen:
                continue
            seen.add(raw.external_id)
            jobs.append(raw)

        log.info("Remotive: %d jobs (single daily call).", len(jobs))
        return jobs

    @staticmethod
    def _to_raw_job(item: dict) -> Optional[RawJob]:
        try:
            ext_id = str(item.get("id") or "").strip()
            title = (item.get("title") or "").strip()
            apply_url = (item.get("url") or "").strip()
            if not ext_id or not title or not apply_url:
                return None

            tags = [t for t in (item.get("tags") or []) if t]
            job_type = item.get("job_type")  # e.g. 'full_time'
            location_raw = item.get("candidate_required_location") or "Remote"

            return RawJob(
                source_slug="remotive",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=item.get("company_name"),
                description=item.get("description"),  # HTML
                description_is_html=True,
                location_raw=location_raw,
                is_remote=True,
                work_type="remote",
                experience_hint=item.get("job_type"),
                employment_type="INTERN" if job_type == "internship" else None,
                tags=tags,
                posted_at=item.get("publication_date"),
                raw=item,
            )
        except Exception as exc:
            log.debug("Remotive record parse error: %s", exc)
            return None
