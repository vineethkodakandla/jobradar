"""Greenhouse public job-board ATS source.

Endpoint:  https://boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true
``content=true`` is MANDATORY (spec §4) — without it descriptions are empty.
Iterates the board tokens listed under ``greenhouse:`` in ``companies.yml``.

Resilience: a dead/404/empty token logs a warning and is SKIPPED — it never
fails the run (spec §4).
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from ..base import RawJob

log = logging.getLogger("jobradar.sources.greenhouse")

BOARD_URL = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"
TIMEOUT = 20
USER_AGENT = "JobRadar/1.0 (+https://github.com/jobradar)"


class GreenhouseSource:
    slug = "greenhouse"

    def __init__(
        self, board_tokens: list[str], session: Optional[requests.Session] = None
    ) -> None:
        self.board_tokens = board_tokens or []
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        jobs: list[RawJob] = []
        ok_boards = 0
        for token in self.board_tokens:
            board_jobs = self._fetch_board(token)
            if board_jobs is None:           # dead token — skip, never fail
                continue
            ok_boards += 1
            jobs.extend(board_jobs)
        log.info("Greenhouse: %d jobs from %d/%d boards.",
                 len(jobs), ok_boards, len(self.board_tokens))
        return jobs

    def _fetch_board(self, token: str) -> Optional[list[RawJob]]:
        url = BOARD_URL.format(token=token)
        params = {"content": "true"}            # MANDATORY
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        try:
            resp = self._session.get(url, params=params, headers=headers, timeout=TIMEOUT)
            if resp.status_code == 404:
                log.warning("Greenhouse board %r -> 404 (dead token, skipping).", token)
                return None
            if resp.status_code != 200:
                log.warning("Greenhouse board %r -> HTTP %d (skipping).", token, resp.status_code)
                return None
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("Greenhouse board %r failed (skipping): %s", token, exc)
            return None

        out: list[RawJob] = []
        for item in data.get("jobs", []) or []:
            raw = self._to_raw_job(token, item)
            if raw is not None:
                out.append(raw)
        return out

    @staticmethod
    def _to_raw_job(token: str, item: dict) -> Optional[RawJob]:
        try:
            gh_id = item.get("id")
            if gh_id is None:
                return None
            ext_id = f"{token}:{gh_id}"
            title = (item.get("title") or "").strip()
            apply_url = (item.get("absolute_url") or "").strip()
            if not title or not apply_url:
                return None

            location_raw = (item.get("location") or {}).get("name")
            # company name: prefer board token's pretty company if present
            company = None
            meta = item.get("company_name") or item.get("metadata")
            if isinstance(item.get("company_name"), str):
                company = item.get("company_name")
            if not company:
                company = token.replace("-", " ").title()

            is_remote = bool(location_raw and "remote" in location_raw.lower())

            return RawJob(
                source_slug="greenhouse",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=company,
                description=item.get("content"),   # HTML when content=true
                description_is_html=True,
                location_raw=location_raw,
                is_remote=is_remote,
                posted_at=item.get("updated_at") or item.get("first_published"),
                raw=item,
            )
        except Exception as exc:
            log.debug("Greenhouse record parse error for %r: %s", token, exc)
            return None
