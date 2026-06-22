"""Ashby public job-board ATS source (AI-native startup density).

Endpoint:  https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true
``includeCompensation=true`` is MANDATORY (spec §4). Ashby exposes an
``isRemote`` boolean and structured ``compensation`` tiers. Iterates the board
names under ``ashby:`` in ``companies.yml``.

Resilience: a dead/404/empty board logs a warning and is SKIPPED.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

import requests

from ..base import RawJob

log = logging.getLogger("jobradar.sources.ashby")

BOARD_URL = "https://api.ashbyhq.com/posting-api/job-board/{board}"
TIMEOUT = 20
USER_AGENT = "JobRadar/1.0 (+https://github.com/jobradar)"

_MONEY_RE = re.compile(r"\$?\s*(\d[\d,]*)(?:\s*[kK])?")


class AshbySource:
    slug = "ashby"

    def __init__(
        self, boards: list[str], session: Optional[requests.Session] = None
    ) -> None:
        self.boards = boards or []
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        jobs: list[RawJob] = []
        ok = 0
        for board in self.boards:
            board_jobs = self._fetch_board(board)
            if board_jobs is None:
                continue
            ok += 1
            jobs.extend(board_jobs)
        log.info("Ashby: %d jobs from %d/%d boards.", len(jobs), ok, len(self.boards))
        return jobs

    def _fetch_board(self, board: str) -> Optional[list[RawJob]]:
        url = BOARD_URL.format(board=board)
        params = {"includeCompensation": "true"}     # MANDATORY
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        try:
            resp = self._session.get(url, params=params, headers=headers, timeout=TIMEOUT)
            if resp.status_code == 404:
                log.warning("Ashby board %r -> 404 (dead board, skipping).", board)
                return None
            if resp.status_code != 200:
                log.warning("Ashby board %r -> HTTP %d (skipping).", board, resp.status_code)
                return None
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("Ashby board %r failed (skipping): %s", board, exc)
            return None

        out: list[RawJob] = []
        for item in data.get("jobs", []) or []:
            raw = self._to_raw_job(board, item)
            if raw is not None:
                out.append(raw)
        return out

    @classmethod
    def _to_raw_job(cls, board: str, item: dict) -> Optional[RawJob]:
        try:
            ashby_id = item.get("id")
            if not ashby_id:
                return None
            ext_id = f"{board}:{ashby_id}"
            title = (item.get("title") or "").strip()
            apply_url = (item.get("jobUrl") or item.get("applyUrl") or "").strip()
            if not title or not apply_url:
                return None

            is_remote = bool(item.get("isRemote"))
            location_raw = item.get("location")
            employment_type = item.get("employmentType")  # e.g. 'Intern','FullTime'

            smin, smax = cls._parse_compensation(item.get("compensation"))

            return RawJob(
                source_slug="ashby",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=item.get("organizationName") or board.replace("-", " ").title(),
                description=item.get("descriptionHtml") or item.get("descriptionPlain"),
                description_is_html=bool(item.get("descriptionHtml")),
                location_raw=location_raw,
                is_remote=is_remote,
                work_type="remote" if is_remote else None,
                salary_min=smin,
                salary_max=smax,
                salary_currency="USD",
                salary_period="year",
                salary_is_estimated=False,
                employment_type=employment_type,
                experience_hint=employment_type,
                posted_at=item.get("publishedAt") or item.get("updatedAt"),
                raw=item,
            )
        except Exception as exc:
            log.debug("Ashby record parse error for %r: %s", board, exc)
            return None

    @classmethod
    def _parse_compensation(cls, comp: Optional[dict]) -> tuple[Optional[float], Optional[float]]:
        """Pull a min/max annual USD salary out of Ashby's compensation tiers."""
        if not isinstance(comp, dict):
            return None, None
        tiers = comp.get("compensationTiers") or []
        best_min: Optional[float] = None
        best_max: Optional[float] = None
        for tier in tiers:
            components = tier.get("components") or []
            for comp_item in components:
                # Look for salary-type components with USD min/max values.
                comp_type = (comp_item.get("compensationType") or "").lower()
                if comp_type and comp_type not in ("salary", "base", ""):
                    continue
                currency = (comp_item.get("currencyCode") or "USD").upper()
                if currency not in ("USD", ""):
                    continue
                mn = comp_item.get("minValue")
                mx = comp_item.get("maxValue")
                for val, slot in ((mn, "min"), (mx, "max")):
                    if not isinstance(val, (int, float)) or val <= 0:
                        continue
                    if slot == "min" and (best_min is None or val < best_min):
                        best_min = float(val)
                    if slot == "max" and (best_max is None or val > best_max):
                        best_max = float(val)
        return best_min, best_max
