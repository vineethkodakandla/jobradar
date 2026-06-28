"""SmartRecruiters public posting API ATS source (per-company, no auth).

Endpoints (no auth, US-filterable):
  LIST   -> https://api.smartrecruiters.com/v1/companies/{token}/postings?country=us&limit=100&offset={n}
  DETAIL -> https://api.smartrecruiters.com/v1/companies/{token}/postings/{id}

The LIST page carries only summary data — full descriptions live ONLY in the
DETAIL response (an N+1 fetch). ``limit`` is server-capped at 100, so we page by
``offset += 100`` until ``offset >= totalFound``. To keep the run fast we bound
the DETAIL fan-out per company (``MAX_DETAILS_PER_COMPANY``) and sleep briefly
between detail calls. Iterates the tokens under ``smartrecruiters:`` in
``companies.yml``.

Resilience: a dead/renamed token returns HTTP 200 with ``totalFound=0`` (NOT a
404) — that just logs a warning and is SKIPPED. EVERY network/parse call is
wrapped in try/except; ``fetch()`` never raises (spec §base).
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import requests

from ..base import RawJob

log = logging.getLogger("jobradar.sources.smartrecruiters")

LIST_URL = "https://api.smartrecruiters.com/v1/companies/{token}/postings"
DETAIL_URL = "https://api.smartrecruiters.com/v1/companies/{token}/postings/{id}"
TIMEOUT = 20
USER_AGENT = "JobRadar/1.0 (+https://github.com/jobradar)"

LIST_PAGE_SIZE = 100               # server-capped at 100
MAX_DETAILS_PER_COMPANY = 60       # bound the N+1 DETAIL fan-out per company
DETAIL_SLEEP_SECONDS = 0.1         # courtesy pause between DETAIL calls

# jobAd.sections.<key>.text fields concatenated into the description, in order.
_SECTION_KEYS = (
    "companyDescription",
    "jobDescription",
    "qualifications",
    "additionalInformation",
)

# typeOfEmployment.id/label -> canonical employment_type the normalizer expects.
_EMPLOYMENT_MAP = {
    "full-time": "FULL_TIME",
    "permanent": "FULL_TIME",
    "intern": "INTERN",
    "internship": "INTERN",
    "trainee": "INTERN",
    "contractor": "CONTRACT",
    "contract": "CONTRACT",
    "temporary": "CONTRACT",
    "part-time": "PART_TIME",
}


class SmartRecruitersSource:
    slug = "smartrecruiters"

    def __init__(
        self, tokens: list[str], session: Optional[requests.Session] = None
    ) -> None:
        self.tokens = tokens or []
        self._session = session or requests.Session()

    def fetch(self) -> list[RawJob]:
        jobs: list[RawJob] = []
        ok = 0
        for token in self.tokens:
            company_jobs = self._fetch_company(token)
            if company_jobs is None:          # dead/empty token — skip, never fail
                continue
            ok += 1
            jobs.extend(company_jobs)
        log.info("SmartRecruiters: %d jobs from %d/%d companies.",
                 len(jobs), ok, len(self.tokens))
        return jobs

    def _fetch_company(self, token: str) -> Optional[list[RawJob]]:
        """List + DETAIL-hydrate one company's postings. None => skip the token."""
        posting_ids = self._list_posting_ids(token)
        if posting_ids is None:               # list call failed entirely
            return None
        if not posting_ids:                   # dead/renamed token -> totalFound=0
            log.warning("SmartRecruiters %r -> 0 postings (dead/empty, skipping).", token)
            return None

        # Bound the N+1 DETAIL fan-out so the run stays fast.
        capped = posting_ids[:MAX_DETAILS_PER_COMPANY]
        if len(posting_ids) > len(capped):
            log.info("SmartRecruiters %r: capping DETAIL fetch %d -> %d.",
                     token, len(posting_ids), len(capped))

        out: list[RawJob] = []
        for i, pid in enumerate(capped):
            detail = self._fetch_detail(token, pid)
            if detail is None:
                continue
            raw = self._to_raw_job(token, detail)
            if raw is not None:
                out.append(raw)
            if i + 1 < len(capped):
                time.sleep(DETAIL_SLEEP_SECONDS)
        return out

    def _list_posting_ids(self, token: str) -> Optional[list[str]]:
        """Page the LIST endpoint, returning stable posting ids. None => failed."""
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        ids: list[str] = []
        offset = 0
        total_found: Optional[int] = None
        while True:
            params = {"country": "us", "limit": LIST_PAGE_SIZE, "offset": offset}
            url = LIST_URL.format(token=token)
            try:
                resp = self._session.get(
                    url, params=params, headers=headers, timeout=TIMEOUT
                )
                if resp.status_code != 200:
                    log.warning("SmartRecruiters %r list -> HTTP %d (skipping).",
                                token, resp.status_code)
                    return None
                data = resp.json()
            except (requests.RequestException, ValueError) as exc:
                log.warning("SmartRecruiters %r list failed (skipping): %s", token, exc)
                return None

            if total_found is None:
                try:
                    total_found = int(data.get("totalFound") or 0)
                except (TypeError, ValueError):
                    total_found = 0

            page = data.get("content") or []
            for item in page:
                pid = item.get("id")
                if pid is not None:
                    ids.append(str(pid))

            offset += LIST_PAGE_SIZE
            # Stop once we've paged past the reported total, ran out of rows, or
            # already collected enough to satisfy the per-company DETAIL cap.
            if (
                not page
                or offset >= (total_found or 0)
                or len(ids) >= MAX_DETAILS_PER_COMPANY
            ):
                break
        return ids

    def _fetch_detail(self, token: str, pid: str) -> Optional[dict]:
        """Fetch one posting's DETAIL JSON. None on any failure (never raises)."""
        url = DETAIL_URL.format(token=token, id=pid)
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        try:
            resp = self._session.get(url, headers=headers, timeout=TIMEOUT)
            if resp.status_code != 200:
                log.debug("SmartRecruiters %r detail %s -> HTTP %d (skipping).",
                          token, pid, resp.status_code)
                return None
            return resp.json()
        except (requests.RequestException, ValueError) as exc:
            log.debug("SmartRecruiters %r detail %s failed (skipping): %s",
                      token, pid, exc)
            return None

    @classmethod
    def _to_raw_job(cls, token: str, item: dict) -> Optional[RawJob]:
        try:
            sr_id = item.get("id")
            if sr_id is None:
                return None
            ext_id = str(sr_id)               # stable numeric id (NOT the slug)
            title = (item.get("name") or "").strip()
            apply_url = (item.get("applyUrl") or item.get("postingUrl") or "").strip()
            if not title or not apply_url:
                return None

            company = (item.get("company") or {}).get("name") or \
                token.replace("-", " ").title()

            description = cls._build_description(item)

            location = item.get("location") or {}
            location_raw = location.get("fullLocation")
            city = location.get("city")
            state = location.get("region")
            country = (location.get("country") or "us").upper()
            is_remote = bool(location.get("remote"))
            work_type = cls._work_type(location)

            experience_hint = (item.get("experienceLevel") or {}).get("label")
            employment_type = cls._employment_type(item.get("typeOfEmployment"))
            tags = cls._tags(item)

            return RawJob(
                source_slug="smartrecruiters",
                external_id=ext_id,
                title=title,
                apply_url=apply_url,
                company=company,
                description=description,
                description_is_html=True,
                location_raw=location_raw,
                city=city,
                state=state,
                country=country,
                is_remote=is_remote,
                work_type=work_type,
                # No structured salary field — normalize text-scrapes the body.
                salary_min=None,
                salary_max=None,
                experience_hint=experience_hint,
                employment_type=employment_type,
                tags=tags,
                posted_at=item.get("releasedDate"),
                raw=item,
            )
        except Exception as exc:
            log.debug("SmartRecruiters record parse error for %r: %s", token, exc)
            return None

    @staticmethod
    def _build_description(item: dict) -> Optional[str]:
        """Concat the jobAd.sections.*.text HTML blocks; None if all empty."""
        sections = (item.get("jobAd") or {}).get("sections") or {}
        parts: list[str] = []
        for key in _SECTION_KEYS:
            text = (sections.get(key) or {}).get("text")
            if text and text.strip():
                parts.append(text)
        return "\n".join(parts) if parts else None

    @staticmethod
    def _work_type(location: dict) -> Optional[str]:
        if location.get("remote"):
            return "remote"
        if location.get("hybrid"):
            return "hybrid"
        return "onsite"

    @staticmethod
    def _employment_type(type_of_employment: Optional[dict]) -> Optional[str]:
        if not isinstance(type_of_employment, dict):
            return None
        for raw in (type_of_employment.get("label"), type_of_employment.get("id")):
            if raw:
                mapped = _EMPLOYMENT_MAP.get(str(raw).strip().lower())
                if mapped:
                    return mapped
        return None

    @staticmethod
    def _tags(item: dict) -> list[str]:
        labels = [
            (item.get("function") or {}).get("label"),
            (item.get("department") or {}).get("label"),
            (item.get("industry") or {}).get("label"),
        ]
        return [lbl for lbl in labels if lbl]
