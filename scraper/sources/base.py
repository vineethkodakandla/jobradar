"""Source protocol + the RawJob dataclass.

A ``Source`` is anything with a ``slug`` and a ``fetch() -> list[RawJob]``.
``fetch()`` MUST NOT raise on network/parse errors — it catches them, logs a
warning, and returns whatever it managed to collect (possibly empty). The
orchestrator decides success/failure per source from a flag the source sets.

``RawJob`` is the un-normalized hand-off shape. Every source maps its provider
payload onto these loosely-typed fields; ``normalize.py`` turns a ``RawJob`` into
the canonical ``jobs`` row dict that matches the Postgres column contract.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Optional, Protocol, runtime_checkable

log = logging.getLogger("jobradar.sources")


@dataclass
class RawJob:
    """A raw posting straight from a provider, before normalization.

    Only ``source_slug``, ``external_id``, ``title`` and ``apply_url`` are
    effectively required for a usable row; everything else is best-effort and
    may be ``None``. ``normalize.py`` is responsible for filling/parsing the
    canonical columns from these plus ``raw``.
    """

    source_slug: str
    external_id: str
    title: str
    apply_url: str

    company: Optional[str] = None
    description: Optional[str] = None          # may contain HTML; normalize strips it
    description_is_html: bool = True

    location_raw: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None              # ISO-ish or full name; normalize maps to 'US' etc.

    is_remote: Optional[bool] = None
    work_type: Optional[str] = None            # 'remote'|'hybrid'|'onsite' hint if the source knows

    # Structured salary, if the source provides it (already numeric). period is
    # one of 'year'|'month'|'hour' (or None). normalize converts to annual USD.
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    salary_currency: Optional[str] = None
    salary_period: Optional[str] = None
    salary_is_estimated: Optional[bool] = None

    # Structured experience hint (e.g. Muse levels[].name) if available.
    experience_hint: Optional[str] = None
    employment_type: Optional[str] = None      # e.g. 'INTERN', 'FULL_TIME'

    tags: list[str] = field(default_factory=list)
    posted_at: Optional[str] = None            # ISO 8601 string if known

    # The untouched provider payload, persisted to jobs.raw so heuristics can be
    # re-derived without re-scraping.
    raw: dict[str, Any] = field(default_factory=dict)


@runtime_checkable
class Source(Protocol):
    """Structural protocol every source class satisfies."""

    #: The sources.slug this source writes to (e.g. 'adzuna', 'greenhouse').
    slug: str

    def fetch(self) -> list[RawJob]:
        """Return raw postings. Must never raise; log + return [] on failure."""
        ...
