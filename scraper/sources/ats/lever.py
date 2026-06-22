"""Lever public postings ATS source.

Endpoint:  https://api.lever.co/v0/postings/{handle}?mode=json
``mode=json`` is MANDATORY (spec §4). Lever gives full plain-text descriptions
and a clean ``workplaceType`` (remote/hybrid/onsite). Iterates the handles under
``lever:`` in ``companies.yml``.

Resilience: a dead/404/empty handle logs a warning and is SKIPPED.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from ..base import RawJob

log = logging.getLogger("jobradar.sources.lever")

POSTINGS_URL = "https://api.lever.co/v0/postings/{handle}"
TIMEOUT = 20
USER_AGENT = "JobRadar/1.0 (+https://github.com/jobradar)"


class LeverSource:
    slug = "lever"

    def __init__(
        self, handles: list[str], session: Optional[requests.Session] = None
    ) -> None:
        self.handles = handles or []
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        jobs: list[RawJob] = []
        ok = 0
        for handle in self.handles:
            board = self._fetch_board(handle)
            if board is None:
                continue
            ok += 1
            jobs.extend(board)
        log.info("Lever: %d jobs from %d/%d handles.", len(jobs), ok, len(self.handles))
        return jobs

    def _fetch_board(self, handle: str) -> Optional[list[RawJob]]:
        url = POSTINGS_URL.format(handle=handle)
        params = {"mode": "json"}               # MANDATORY
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        try:
            resp = self._session.get(url, params=params, headers=headers, timeout=TIMEOUT)
            if resp.status_code == 404:
                log.warning("Lever handle %r -> 404 (dead handle, skipping).", handle)
                return None
            if resp.status_code != 200:
                log.warning("Lever handle %r -> HTTP %d (skipping).", handle, resp.status_code)
                return None
            data = resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.warning("Lever handle %r failed (skipping): %s", handle, exc)
            return None

        if not isinstance(data, list):
            log.warning("Lever handle %r returned non-list — skipping.", handle)
            return None

        out: list[RawJob] = []
        for item in data:
            raw = self._to_raw_job(handle, item)
            if raw is not None:
                out.append(raw)
        return out

    @staticmethod
    def _to_raw_job(handle: str, item: dict) -> Optional[RawJob]:
        try:
            lever_id = item.get("id")
            if not lever_id:
                return None
            ext_id = f"{handle}:{lever_id}"
            title = (item.get("text") or "").strip()
            apply_url = (item.get("hostedUrl") or item.get("applyUrl") or "").strip()
            if not title or not apply_url:
                return None

            categories = item.get("categories") or {}
            location_raw = categories.get("location")
            team = categories.get("team")
            commitment = categories.get("commitment")
            workplace = (item.get("workplaceType") or "").lower() or None

            # Lever description: prefer plain text, fall back to HTML.
            description = item.get("descriptionPlain") or item.get("description")
            is_html = not item.get("descriptionPlain")

            tags = [t for t in (team, commitment) if t]

            is_remote = workplace == "remote" or bool(
                location_raw and "remote" in location_raw.lower()
            )

            return RawJob(
                source_slug="lever",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=handle.replace("-", " ").title(),
                description=description,
                description_is_html=is_html,
                location_raw=location_raw,
                is_remote=is_remote,
                work_type=workplace,
                employment_type="INTERN" if (commitment and "intern" in commitment.lower()) else None,
                tags=tags,
                posted_at=_epoch_ms_to_iso(item.get("createdAt")),
                raw=item,
            )
        except Exception as exc:
            log.debug("Lever record parse error for %r: %s", handle, exc)
            return None


def _epoch_ms_to_iso(value: Optional[int]) -> Optional[str]:
    """Lever createdAt is epoch milliseconds. Return an ISO 8601 UTC string."""
    if not value:
        return None
    try:
        from datetime import datetime, timezone
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat()
    except Exception:
        return None
