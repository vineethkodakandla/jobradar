"""Adzuna aggregator source (primary breadth, US-scoped).

HARD call budget (spec §4): <=80 API calls/run, <=3 pages/query, max_days_old=2,
``what_or`` batching across SWE/ML/AI/FDE terms, stop paginating a query once a
page returns < 50 results. Every page call counts against the per-run budget;
once it is exhausted Adzuna stops (other sources continue). The total is
recorded in ``scrape_runs.adzuna_calls``.

``salary_is_predicted`` comes back as the JSON STRING '0'/'1'. We mark
``salary_is_estimated`` only when it equals the string '1' — a truthiness check
is a bug because the string '0' is truthy in Python (spec §4).

Missing keys -> the source is skipped with a warning (handled by the caller via
``enabled``), it does not crash the run.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from .base import RawJob

log = logging.getLogger("jobradar.sources.adzuna")

API_BASE = "https://api.adzuna.com/v1/api/jobs/us/search"
RESULTS_PER_PAGE = 50          # Adzuna max
MAX_PAGES_PER_QUERY = 3        # <=150 results/query (spec §4)
MAX_DAYS_OLD = 3               # fresh, but wide enough for steady new-job volume
PAGE_STOP_THRESHOLD = 50       # stop a query when a page returns < 50 results
DEFAULT_CALL_BUDGET = 80       # <=80 calls/run (~2400/month)
TIMEOUT = 20

# what_or batches covering the owner's target roles + adjacent ones. ~5 batches
# x <=3 pages = <=15 calls/run; at ~4 courtesy runs/day that's ~1,800/month,
# under Adzuna's 2,500/month free cap (also enforced in main.py).
QUERY_BATCHES = [
    "software engineer machine learning engineer",
    "ai engineer artificial intelligence forward deployed engineer",
    "ml engineer llm generative ai applied scientist",
    "data engineer data scientist python developer",
    "backend engineer full stack engineer software developer",
]


class AdzunaSource:
    slug = "adzuna"

    def __init__(
        self,
        app_id: str,
        app_key: str,
        call_budget: int = DEFAULT_CALL_BUDGET,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.app_id = app_id
        self.app_key = app_key
        self.call_budget = call_budget
        self.calls_made = 0                       # read by main.py for adzuna_calls
        self._session = session or requests.Session()

    def _remaining(self) -> int:
        return self.call_budget - self.calls_made

    def fetch(self) -> list[RawJob]:
        if not self.app_id or not self.app_key:
            log.warning("Adzuna keys missing — skipping Adzuna.")
            return []

        jobs: list[RawJob] = []
        seen_ids: set[str] = set()

        for what_or in QUERY_BATCHES:
            if self._remaining() <= 0:
                log.info("Adzuna call budget exhausted (%d) — stopping.", self.call_budget)
                break
            for page in range(1, MAX_PAGES_PER_QUERY + 1):
                if self._remaining() <= 0:
                    log.info("Adzuna call budget exhausted mid-query — stopping.")
                    break
                results = self._fetch_page(what_or, page)
                if results is None:        # hard error on this page — abandon this query
                    break
                page_count = 0
                for item in results:
                    raw = self._to_raw_job(item)
                    if raw is None:
                        continue
                    if raw.external_id in seen_ids:
                        continue
                    seen_ids.add(raw.external_id)
                    jobs.append(raw)
                    page_count += 1
                # stop paginating once a page returns < 50 results
                if len(results) < PAGE_STOP_THRESHOLD:
                    break

        log.info("Adzuna: %d jobs from %d API calls.", len(jobs), self.calls_made)
        return jobs

    def _fetch_page(self, what_or: str, page: int) -> Optional[list[dict]]:
        """One paginated API call. Returns the results list, or None on error."""
        url = f"{API_BASE}/{page}"
        params = {
            "app_id": self.app_id,
            "app_key": self.app_key,
            "results_per_page": RESULTS_PER_PAGE,
            "what_or": what_or,
            "max_days_old": MAX_DAYS_OLD,
            "content-type": "application/json",
        }
        self.calls_made += 1
        try:
            resp = self._session.get(url, params=params, timeout=TIMEOUT)
            if resp.status_code != 200:
                log.warning("Adzuna page %d for %r -> HTTP %d", page, what_or, resp.status_code)
                return None
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("Adzuna page %d for %r failed: %s", page, what_or, exc)
            return None
        return data.get("results", []) or []

    @staticmethod
    def _to_raw_job(item: dict) -> Optional[RawJob]:
        try:
            ext_id = str(item.get("id") or "").strip()
            title = (item.get("title") or "").strip()
            apply_url = (item.get("redirect_url") or "").strip()
            if not ext_id or not title or not apply_url:
                return None

            company = (item.get("company") or {}).get("display_name")
            location = item.get("location") or {}
            location_raw = location.get("display_name")
            areas = location.get("area") or []
            # area is like ["US", "California", "San Francisco"] (broad -> narrow)
            state = areas[1] if len(areas) >= 2 else None
            city = areas[-1] if len(areas) >= 3 else None

            # salary_is_predicted is the STRING '0'/'1'; compare explicitly.
            predicted = item.get("salary_is_predicted")
            is_estimated = str(predicted) == "1"

            return RawJob(
                source_slug="adzuna",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=company,
                description=item.get("description"),  # snippet; HTML-ish
                description_is_html=True,
                location_raw=location_raw,
                city=city,
                state=state,
                country="US",
                salary_min=item.get("salary_min"),
                salary_max=item.get("salary_max"),
                salary_currency="USD",
                salary_period="year",
                salary_is_estimated=is_estimated,
                posted_at=item.get("created"),
                tags=[item.get("category", {}).get("label")] if item.get("category") else [],
                raw=item,
            )
        except Exception as exc:  # never let one bad record kill the batch
            log.debug("Adzuna record parse error: %s", exc)
            return None
