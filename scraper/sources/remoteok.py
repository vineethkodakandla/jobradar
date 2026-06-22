"""RemoteOK JSON-feed source (remote roles, numeric salary + tags).

Best-effort courtesy endpoint — can 403/429 or change shape. TWO non-negotiable
quirks (spec §4):
  * send a **descriptive User-Agent** header, or RemoteOK blocks the request;
  * **DROP the first array element** — it is legal/metadata, not a job.
Carries numeric ``salary_min``/``salary_max`` (annual USD) and a ``tags`` list.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from .base import RawJob

log = logging.getLogger("jobradar.sources.remoteok")

API_URL = "https://remoteok.com/api"
TIMEOUT = 20
# A real, descriptive UA — RemoteOK 403s the default python-requests UA.
USER_AGENT = (
    "JobRadar/1.0 (+https://github.com/jobradar) single-user job aggregator; "
    "contact: vineethkodakandla@gmail.com"
)


class RemoteOKSource:
    slug = "remoteok"

    def __init__(self, session: Optional[requests.Session] = None) -> None:
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        try:
            resp = self._session.get(API_URL, headers=headers, timeout=TIMEOUT)
            if resp.status_code != 200:
                log.warning("RemoteOK -> HTTP %d (best-effort source, skipping).", resp.status_code)
                return []
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("RemoteOK failed (best-effort source, skipping): %s", exc)
            return []

        if not isinstance(data, list) or not data:
            log.warning("RemoteOK returned an unexpected shape — skipping.")
            return []

        # DROP the first element (legal metadata), per spec §4.
        records = data[1:]

        jobs: list[RawJob] = []
        seen: set[str] = set()
        for item in records:
            if not isinstance(item, dict):
                continue
            raw = self._to_raw_job(item)
            if raw is None or raw.external_id in seen:
                continue
            seen.add(raw.external_id)
            jobs.append(raw)

        log.info("RemoteOK: %d jobs (dropped legal header row).", len(jobs))
        return jobs

    @staticmethod
    def _to_raw_job(item: dict) -> Optional[RawJob]:
        try:
            ext_id = str(item.get("id") or item.get("slug") or "").strip()
            title = (item.get("position") or item.get("title") or "").strip()
            apply_url = (item.get("url") or item.get("apply_url") or "").strip()
            if not ext_id or not title or not apply_url:
                return None

            tags = [t for t in (item.get("tags") or []) if t]
            location_raw = item.get("location") or "Remote"

            # RemoteOK salary numbers are already annual USD when present (>0).
            smin = item.get("salary_min")
            smax = item.get("salary_max")
            smin = smin if isinstance(smin, (int, float)) and smin > 0 else None
            smax = smax if isinstance(smax, (int, float)) and smax > 0 else None

            return RawJob(
                source_slug="remoteok",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=item.get("company"),
                description=item.get("description"),  # HTML
                description_is_html=True,
                location_raw=location_raw,
                is_remote=True,
                work_type="remote",
                salary_min=smin,
                salary_max=smax,
                salary_currency="USD",
                salary_period="year",
                salary_is_estimated=False,
                tags=tags,
                posted_at=item.get("date"),
                raw=item,
            )
        except Exception as exc:
            log.debug("RemoteOK record parse error: %s", exc)
            return None
