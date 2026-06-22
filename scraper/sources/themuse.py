"""The Muse aggregator source.

No key required (an optional ``api_key`` raises rate limits). The Muse provides
**structured seniority** via ``levels[].name`` (powers the early-career filter)
and full HTML descriptions, but no salary. We query the relevant SWE/AI/ML
categories and a couple of pages each.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from .base import RawJob

log = logging.getLogger("jobradar.sources.themuse")

API_URL = "https://www.themuse.com/api/public/jobs"
TIMEOUT = 20
MAX_PAGES = 4
CATEGORIES = [
    "Software Engineering",
    "Data Science",
    "Data and Analytics",
]


class TheMuseSource:
    slug = "themuse"

    def __init__(
        self,
        api_key: Optional[str] = None,
        max_pages: int = MAX_PAGES,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.api_key = api_key
        self.max_pages = max_pages
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        jobs: list[RawJob] = []
        seen: set[str] = set()
        for page in range(self.max_pages):
            params = {
                "page": page,
                "category": CATEGORIES,
                "location": "United States",  # broad US filter; remote rows still come through
            }
            if self.api_key:
                params["api_key"] = self.api_key
            try:
                resp = self._session.get(API_URL, params=params, timeout=TIMEOUT)
                if resp.status_code != 200:
                    log.warning("The Muse page %d -> HTTP %d", page, resp.status_code)
                    break
                data = resp.json()
            except (requests.RequestException, ValueError) as exc:
                log.warning("The Muse page %d failed: %s", page, exc)
                break

            results = data.get("results", []) or []
            if not results:
                break
            for item in results:
                raw = self._to_raw_job(item)
                if raw is None or raw.external_id in seen:
                    continue
                seen.add(raw.external_id)
                jobs.append(raw)

            if page >= (data.get("page_count", page) - 1):
                break

        log.info("The Muse: %d jobs.", len(jobs))
        return jobs

    @staticmethod
    def _to_raw_job(item: dict) -> Optional[RawJob]:
        try:
            ext_id = str(item.get("id") or "").strip()
            title = (item.get("name") or "").strip()
            refs = item.get("refs") or {}
            apply_url = (refs.get("landing_page") or "").strip()
            if not ext_id or not title or not apply_url:
                return None

            company = (item.get("company") or {}).get("name")

            locations = item.get("locations") or []
            loc_names = [l.get("name") for l in locations if l.get("name")]
            primary_loc = loc_names[0] if loc_names else None
            is_remote = any("remote" in (n or "").lower() for n in loc_names) or \
                any("flexible" in (n or "").lower() for n in loc_names)

            levels = item.get("levels") or []
            level_name = levels[0].get("name") if levels else None

            categories = item.get("categories") or []
            tags = [c.get("name") for c in categories if c.get("name")]

            return RawJob(
                source_slug="themuse",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=company,
                description=item.get("contents"),  # HTML
                description_is_html=True,
                location_raw=primary_loc,
                is_remote=is_remote,
                experience_hint=level_name,
                tags=tags,
                posted_at=item.get("publication_date"),
                raw=item,
            )
        except Exception as exc:
            log.debug("The Muse record parse error: %s", exc)
            return None
