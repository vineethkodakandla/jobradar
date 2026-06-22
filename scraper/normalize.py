"""RawJob -> normalized ``jobs`` row dict.

Everything here maps onto the exact column contract in
``supabase/migrations/0001_init.sql`` (the ``jobs`` table) and the
``experience_level`` / ``work_type`` enums. Pure functions, no I/O — so the
unit tests in ``tests/test_normalize.py`` can exercise salary/experience/dedupe
without a network or a DB.

Key rules (from spec §4/§5):
  * HTML-strip descriptions to plain text at ingest, cap to 8 KB.
  * Salary -> annual USD (hourly x2080, monthly x12), sanity-bound $20k-$1M.
  * Experience: prefer structured; else regex MIN years + a title classifier
    where senior/staff/principal/lead ALWAYS beats a low year number.
  * dedupe_hash = sha256(lower(normalize(company)|normalize(title)|
                         normalize(city+state-or-remote))).
"""

from __future__ import annotations

import hashlib
import logging
import re
from html import unescape
from html.parser import HTMLParser
from typing import Any, Optional

from .sources.base import RawJob

log = logging.getLogger("jobradar.normalize")

# --- constants ---------------------------------------------------------------

DESCRIPTION_CAP_BYTES = 8 * 1024          # 8 KB cap on description (spec §6)
HOURS_PER_YEAR = 2080                     # 40h * 52w
MONTHS_PER_YEAR = 12
SALARY_FLOOR = 20_000                     # annual USD sanity bound
SALARY_CEILING = 1_000_000

# experience_level enum values that actually exist in Postgres. The scorer uses
# richer internal bands ('1-3yr', '3-5yr'); those map down to these for storage.
EXPERIENCE_ENUM = {"intern", "new_grad", "entry", "mid", "senior", "lead", "unknown"}
WORK_TYPE_ENUM = {"remote", "hybrid", "onsite", "unknown"}

# Company-suffix noise stripped before hashing (spec §4 dedup normalize rule).
_COMPANY_SUFFIX_RE = re.compile(
    r"\b(?:inc|inc\.|llc|l\.l\.c\.|ltd|ltd\.|limited|corp|corp\.|"
    r"corporation|co|co\.|gmbh|plc|s\.a\.|s\.a|pvt|pte|holdings|group)\b",
    re.IGNORECASE,
)
_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")

# Years-of-experience: "(N)+ years", "N-M years", "N+ yrs". Take MIN years.
_YEARS_RE = re.compile(
    r"(\d{1,2})\s*\+?\s*(?:-\s*(\d{1,2}))?\s*(?:\+)?\s*(?:years?|yrs?)\b",
    re.IGNORECASE,
)

# Title classifier keyword groups (most senior first — first match wins).
_TITLE_SENIOR = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|architect|distinguished|head\s+of|"
    r"director|vp|manager)\b",
    re.IGNORECASE,
)
_TITLE_INTERN = re.compile(r"\b(intern|internship|co-?op|trainee)\b", re.IGNORECASE)
_TITLE_NEWGRAD = re.compile(
    r"\b(new\s*grad|new-?grad|entry[\s-]*level|early\s*career|associate|"
    r"junior|jr\.?|grad(?:uate)?\s+(?:engineer|program|role))\b",
    re.IGNORECASE,
)
_TITLE_MID = re.compile(r"\b(mid[\s-]*level|\bii\b|\b2\b|intermediate)\b", re.IGNORECASE)

# Free-text salary patterns (fallback when no structured numbers).
#   $120k - $150k   /   $120,000 to $150,000   /   $60/hr   /   $150k
_SALARY_RANGE_K_RE = re.compile(
    r"\$?\s*(\d{2,3})\s*[kK]\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3})\s*[kK]"
)
_SALARY_RANGE_FULL_RE = re.compile(
    r"\$\s*(\d{2,3}(?:,\d{3})+)\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3}(?:,\d{3})+)"
)
_SALARY_HOURLY_RE = re.compile(
    r"\$\s*(\d{2,3}(?:\.\d{1,2})?)\s*(?:/|\s*per\s*)\s*(?:hr|hour)", re.IGNORECASE
)
_SALARY_SINGLE_K_RE = re.compile(r"\$\s*(\d{2,3})\s*[kK]\b")
_SALARY_SINGLE_FULL_RE = re.compile(r"\$\s*(\d{2,3}(?:,\d{3})+)")

# US state name -> abbreviation, for pulling a 2-letter state out of free text.
_US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ",
    "new mexico": "NM", "new york": "NY", "north carolina": "NC",
    "north dakota": "ND", "ohio": "OH", "oklahoma": "OK", "oregon": "OR",
    "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY",
    "district of columbia": "DC", "washington dc": "DC", "washington, dc": "DC",
}
_STATE_ABBRS = set(_US_STATES.values())

_US_COUNTRY_TOKENS = {
    "us", "usa", "u.s.", "u.s.a.", "united states", "united states of america",
    "america",
}

# Whole-word tokens that mark a posting as NOT in the US (countries / regions /
# major non-US cities). Used by ``is_us_job``. A present US state overrides this
# (handles "London, KY" etc.). Kept broad but conservative to avoid dropping US
# jobs (e.g. "indiana" is safe — \bindia\b won't match inside it).
_NON_US_TOKENS = {
    # countries / regions
    "canada", "united kingdom", "uk", "england", "scotland", "wales", "ireland",
    "france", "germany", "deutschland", "spain", "italy", "netherlands",
    "switzerland", "sweden", "norway", "denmark", "finland", "poland",
    "portugal", "austria", "belgium", "czechia", "czech republic", "romania",
    "greece", "india", "singapore", "japan", "china", "hong kong", "taiwan",
    "korea", "australia", "new zealand", "brazil", "argentina", "mexico",
    "colombia", "chile", "peru", "israel", "turkey", "egypt", "south africa",
    "nigeria", "kenya", "uae", "united arab emirates", "qatar", "saudi arabia",
    "emea", "apac", "latam", "europe", "european union", "asia", "africa",
    "philippines", "indonesia", "vietnam", "thailand", "malaysia", "pakistan",
    "bangladesh", "ukraine", "lithuania", "estonia", "latvia", "hungary",
    "bulgaria", "serbia", "croatia", "slovakia", "slovenia", "luxembourg",
    "iceland", "cyprus", "malta", "ontario", "quebec", "british columbia",
    "alberta", "manitoba", "nova scotia",
    # major non-US cities
    "toronto", "montreal", "vancouver", "ottawa", "calgary", "edmonton",
    "london", "manchester", "edinburgh", "paris", "lyon", "berlin", "munich",
    "hamburg", "frankfurt", "cologne", "amsterdam", "rotterdam", "dublin",
    "madrid", "barcelona", "valencia", "lisbon", "porto", "zurich", "geneva",
    "stockholm", "oslo", "copenhagen", "helsinki", "warsaw", "krakow", "prague",
    "vienna", "brussels", "milan", "rome", "athens", "bucharest", "budapest",
    "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "pune", "chennai",
    "kolkata", "gurgaon", "gurugram", "noida", "tokyo", "osaka", "kyoto",
    "beijing", "shanghai", "shenzhen", "guangzhou", "seoul", "sydney",
    "melbourne", "brisbane", "perth", "auckland", "wellington", "sao paulo",
    "rio de janeiro", "buenos aires", "santiago", "bogota", "lima",
    "mexico city", "guadalajara", "tel aviv", "jerusalem", "dubai", "abu dhabi",
    "doha", "riyadh", "cairo", "lagos", "nairobi", "cape town", "johannesburg",
    "istanbul", "bangkok", "jakarta", "manila", "kuala lumpur", "ho chi minh",
}


def is_us_job(nj: dict[str, Any]) -> bool:
    """Heuristic US-only filter (spec: owner wants USA jobs only).

    A present US state => US; an explicit non-US country or a non-US token in the
    location => non-US; otherwise assume US (a bare "Remote" or unrecognized city
    is kept). Tokens are matched as whole words so US look-alikes survive
    (e.g. "Indiana" is not matched by "india").
    """
    blob = " ".join(
        x for x in (nj.get("location_raw"), nj.get("city"), nj.get("country")) if x
    ).lower()
    # Canada is the main false positive: "City, ON, CA" mis-parses the "CA"
    # country code as California, so check Canadian provinces / "canada" BEFORE
    # the US-state shortcut. (No US state collides with a province abbreviation.)
    if blob and (
        re.search(r"\bcanada\b", blob)
        or re.search(r",\s*(?:on|qc|bc|ab|mb|sk|ns|nb|nl|pe|nt|yt|nu)\b", blob)
    ):
        return False
    state = (nj.get("state") or "").upper()
    if state in _STATE_ABBRS:
        return True
    country = (nj.get("country") or "").upper()
    if country and country not in (
        "US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA", "AMERICA",
    ):
        return False
    if not blob:
        return True
    for tok in _NON_US_TOKENS:
        if re.search(r"\b" + re.escape(tok) + r"\b", blob):
            return False
    return True


# --- HTML stripping ----------------------------------------------------------

class _TextExtractor(HTMLParser):
    """Collapse HTML to readable plain text, keeping paragraph/list breaks."""

    _BLOCK = {
        "p", "br", "div", "li", "ul", "ol", "tr", "table", "section",
        "article", "h1", "h2", "h3", "h4", "h5", "h6", "header", "footer",
    }

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._parts: list[str] = []
        self._skip = 0  # depth inside <script>/<style>

    def handle_starttag(self, tag: str, attrs: Any) -> None:
        if tag in ("script", "style"):
            self._skip += 1
        elif tag == "li":
            self._parts.append("\n- ")
        elif tag in self._BLOCK:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in ("script", "style") and self._skip:
            self._skip -= 1
        elif tag in self._BLOCK:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._skip:
            self._parts.append(data)

    def text(self) -> str:
        return "".join(self._parts)


def strip_html(value: Optional[str]) -> str:
    """HTML -> tidy plain text. Safe on already-plain or ``None`` input."""
    if not value:
        return ""
    # Some sources (notably Greenhouse `content`) return HTML that is itself
    # entity-escaped — e.g. "&lt;div&gt;&lt;p&gt;...". Unescape that FIRST so the
    # parser sees real tags; otherwise convert_charrefs turns "&lt;" into a
    # literal "<" inside the text and the tags survive as visible characters.
    if "&lt;" in value or "&gt;" in value:
        value = unescape(value)
    if "<" not in value and "&" not in value:
        cleaned = value
    else:
        parser = _TextExtractor()
        try:
            parser.feed(value)
            parser.close()
            cleaned = parser.text()
        except Exception:  # malformed HTML — fall back to a crude tag strip
            cleaned = re.sub(r"<[^>]+>", " ", value)
        cleaned = unescape(cleaned)
    # collapse runs of blank lines / spaces, trim
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n[ \t]+", "\n", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def cap_text(value: str, cap_bytes: int = DESCRIPTION_CAP_BYTES) -> str:
    """Cap a string to ``cap_bytes`` UTF-8 bytes without splitting a codepoint."""
    if not value:
        return value
    encoded = value.encode("utf-8")
    if len(encoded) <= cap_bytes:
        return value
    return encoded[:cap_bytes].decode("utf-8", "ignore")


# --- text normalization for dedupe ------------------------------------------

def _norm_token(value: Optional[str]) -> str:
    """lowercase, drop punctuation, collapse whitespace, trim."""
    if not value:
        return ""
    text = value.lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()


def normalize_company(value: Optional[str]) -> str:
    """Normalize a company name: lowercased, suffix-stripped, whitespace-collapsed."""
    if not value:
        return ""
    text = value.lower()
    text = _COMPANY_SUFFIX_RE.sub(" ", text)
    text = _PUNCT_RE.sub(" ", text)
    text = _WS_RE.sub(" ", text)
    return text.strip()


def normalize_location_key(
    city: Optional[str], state: Optional[str], is_remote: bool
) -> str:
    """Reduce a location to 'remote' or 'city state' for the dedupe hash."""
    if is_remote:
        return "remote"
    parts = [p for p in (_norm_token(city), _norm_token(state)) if p]
    return " ".join(parts) if parts else "remote"


def dedupe_hash(
    company: Optional[str],
    title: Optional[str],
    city: Optional[str],
    state: Optional[str],
    is_remote: bool,
) -> str:
    """sha256(lower(normalize(company)|normalize(title)|normalize(loc))).

    The location segment reduces to 'remote' or 'city state'. Stable across
    re-runs and across sources for the same logical posting.
    """
    loc = normalize_location_key(city, state, is_remote)
    basis = "|".join((normalize_company(company), _norm_token(title), loc))
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


# --- location parsing --------------------------------------------------------

def parse_location(
    location_raw: Optional[str],
    city_hint: Optional[str] = None,
    state_hint: Optional[str] = None,
    country_hint: Optional[str] = None,
) -> tuple[Optional[str], Optional[str], str, bool]:
    """Return (city, state, country, looks_remote) from messy location text.

    Honors explicit hints first; otherwise parses a "City, ST" / "City, State,
    Country" string. ``country`` defaults to 'US'.
    """
    raw = (location_raw or "").strip()
    low = raw.lower()
    looks_remote = bool(re.search(r"\bremote\b|\banywhere\b|\bworldwide\b", low))

    city = (city_hint or "").strip() or None
    state = (state_hint or "").strip() or None
    country = (country_hint or "").strip() or None

    # Normalize a full state name hint to its abbreviation.
    if state and state.lower() in _US_STATES:
        state = _US_STATES[state.lower()]
    elif state and len(state) == 2:
        state = state.upper()

    if (not city or not state) and raw:
        # split "City, ST" / "City, State, Country"
        segs = [s.strip() for s in re.split(r"[,/|]", raw) if s.strip()]
        segs = [s for s in segs if not re.fullmatch(r"(?i)remote|anywhere|worldwide", s)]
        if segs:
            if not city:
                city = segs[0] or None
            for seg in segs[1:]:
                seg_low = seg.lower()
                if seg_low in _US_COUNTRY_TOKENS:
                    country = country or "US"
                elif len(seg) == 2 and seg.upper() in _STATE_ABBRS and not state:
                    state = seg.upper()
                elif seg_low in _US_STATES and not state:
                    state = _US_STATES[seg_low]
                elif not country:
                    country = seg

    # country canonicalization
    if country:
        if country.lower() in _US_COUNTRY_TOKENS:
            country = "US"
        elif len(country) == 2:
            country = country.upper()
    else:
        country = "US"  # default per schema

    # A US state present implies US.
    if state in _STATE_ABBRS:
        country = "US"

    # Drop a city that is really just "remote".
    if city and re.fullmatch(r"(?i)remote|anywhere|worldwide", city):
        city = None

    return city, state, country, looks_remote


def resolve_work_type(
    work_type_hint: Optional[str], is_remote: bool, location_raw: Optional[str]
) -> str:
    """Map source hints to the work_type enum."""
    if work_type_hint:
        wt = work_type_hint.strip().lower()
        if wt in WORK_TYPE_ENUM:
            return wt
        if "remote" in wt:
            return "remote"
        if "hybrid" in wt:
            return "hybrid"
        if "onsite" in wt or "on-site" in wt or "in office" in wt or "in-office" in wt:
            return "onsite"
    low = (location_raw or "").lower()
    if is_remote or "remote" in low:
        return "remote"
    if "hybrid" in low:
        return "hybrid"
    return "unknown"


# --- salary parsing ----------------------------------------------------------

def _to_annual(amount: float, period: Optional[str]) -> Optional[float]:
    """Convert one figure to annual USD given its period."""
    if amount is None:
        return None
    p = (period or "").lower()
    if p in ("hour", "hourly", "hr"):
        annual = amount * HOURS_PER_YEAR
    elif p in ("month", "monthly", "mo"):
        annual = amount * MONTHS_PER_YEAR
    elif p in ("week", "weekly"):
        annual = amount * 52
    elif p in ("day", "daily"):
        annual = amount * 260
    else:  # year/annual/None -> already annual, BUT detect an hourly-looking number
        annual = amount
    return annual


def _infer_period(amount: float, declared: Optional[str]) -> str:
    """Pick a sensible period; a bare number under ~2000 is almost certainly hourly."""
    if declared:
        d = declared.lower()
        if d in ("hour", "hourly", "hr"):
            return "hour"
        if d in ("month", "monthly", "mo"):
            return "month"
        if d in ("week", "weekly"):
            return "week"
        if d in ("day", "daily"):
            return "day"
        if d in ("year", "yearly", "annual", "annually"):
            return "year"
    if amount < 2000:
        return "hour"
    if amount < 20000:
        return "month"
    return "year"


def normalize_salary(
    salary_min: Optional[float],
    salary_max: Optional[float],
    period: Optional[str],
    currency: Optional[str],
) -> tuple[Optional[int], Optional[int], Optional[str], Optional[str]]:
    """Normalize structured salary to annual USD ints, sanity-bounded.

    Returns (min_annual, max_annual, currency, original_period). Non-USD or
    out-of-bound values are discarded (return Nones) — we never guess FX.
    """
    cur = (currency or "USD").upper()
    if cur not in ("USD", "US$", "$", ""):
        return None, None, cur, period
    cur = "USD"

    vals = [v for v in (salary_min, salary_max) if v is not None and v > 0]
    if not vals:
        return None, None, cur, None

    eff_period = _infer_period(min(vals), period)
    out: list[Optional[int]] = []
    for v in (salary_min, salary_max):
        if v is None or v <= 0:
            out.append(None)
            continue
        annual = _to_annual(v, eff_period)
        if annual is None or annual < SALARY_FLOOR or annual > SALARY_CEILING:
            out.append(None)
        else:
            out.append(int(round(annual)))

    smin, smax = out[0], out[1]
    if smin and smax and smin > smax:
        smin, smax = smax, smin
    if smin is None and smax is None:
        return None, None, cur, None
    return smin, smax, cur, eff_period


def parse_salary_from_text(
    text: Optional[str],
) -> tuple[Optional[int], Optional[int], Optional[str]]:
    """Best-effort salary scrape from free text. Returns (min, max, period)."""
    if not text:
        return None, None, None
    snippet = text[:4000]

    m = _SALARY_RANGE_K_RE.search(snippet)
    if m:
        lo, hi = int(m.group(1)) * 1000, int(m.group(2)) * 1000
        smin, smax, _, _ = normalize_salary(lo, hi, "year", "USD")
        return smin, smax, "year"

    m = _SALARY_RANGE_FULL_RE.search(snippet)
    if m:
        lo = int(m.group(1).replace(",", ""))
        hi = int(m.group(2).replace(",", ""))
        smin, smax, _, _ = normalize_salary(lo, hi, "year", "USD")
        return smin, smax, "year"

    m = _SALARY_HOURLY_RE.search(snippet)
    if m:
        rate = float(m.group(1))
        smin, smax, _, _ = normalize_salary(rate, None, "hour", "USD")
        return smin, smax, "hour"

    m = _SALARY_SINGLE_K_RE.search(snippet)
    if m:
        val = int(m.group(1)) * 1000
        smin, smax, _, _ = normalize_salary(val, None, "year", "USD")
        return smin, smax, "year"

    m = _SALARY_SINGLE_FULL_RE.search(snippet)
    if m:
        val = int(m.group(1).replace(",", ""))
        smin, smax, _, _ = normalize_salary(val, None, "year", "USD")
        return smin, smax, "year"

    return None, None, None


# --- experience parsing ------------------------------------------------------

def _years_from_text(text: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Min/max years found in free text. Takes the MIN across all matches."""
    if not text:
        return None, None
    best_min: Optional[int] = None
    best_max: Optional[int] = None
    for m in _YEARS_RE.finditer(text[:6000]):
        lo = int(m.group(1))
        hi = int(m.group(2)) if m.group(2) else None
        if lo > 40:  # nonsense (e.g. "401k")
            continue
        if best_min is None or lo < best_min:
            best_min = lo
            best_max = hi if hi is not None else lo
    return best_min, best_max


def _level_from_years(years_min: Optional[int]) -> Optional[str]:
    """Map a minimum-years figure to the experience enum."""
    if years_min is None:
        return None
    if years_min <= 0:
        return "new_grad"
    if years_min <= 1:
        return "new_grad"
    if years_min <= 4:
        return "mid"
    return "senior"


def _level_from_structured(hint: Optional[str], employment_type: Optional[str]) -> Optional[str]:
    """Map a structured hint (e.g. Muse levels[].name) to the enum."""
    if employment_type and "intern" in employment_type.lower():
        return "intern"
    if not hint:
        return None
    h = hint.lower()
    if "intern" in h:
        return "intern"
    if "entry" in h or "new grad" in h or "new-grad" in h or "junior" in h:
        return "new_grad"
    if "senior" in h or "sr" in h or "experienced" in h or "lead" in h:
        return "senior"
    if "management" in h or "director" in h or "principal" in h or "staff" in h:
        return "lead"
    if "mid" in h or "associate" in h:
        return "mid"
    return None


def _level_from_title(title: Optional[str]) -> Optional[str]:
    """Title classifier. Senior/staff/principal/lead ALWAYS wins (checked first)."""
    if not title:
        return None
    if _TITLE_SENIOR.search(title):
        return "senior"
    if _TITLE_INTERN.search(title):
        return "intern"
    if _TITLE_NEWGRAD.search(title):
        return "new_grad"
    if _TITLE_MID.search(title):
        return "mid"
    return None


def classify_experience(
    title: Optional[str],
    description: Optional[str],
    structured_hint: Optional[str] = None,
    employment_type: Optional[str] = None,
) -> tuple[str, Optional[int], Optional[int]]:
    """Decide (experience_level enum, years_min, years_max).

    Priority (spec §4):
      1. structured hint (Muse levels / employment_type=INTERN);
      2. title classifier — but a senior/staff/principal/lead title ALWAYS
         overrides a low years number;
      3. years regex (MIN years) -> level.
    Returns 'unknown' when nothing matches.
    """
    years_min, years_max = _years_from_text(description)

    structured = _level_from_structured(structured_hint, employment_type)
    title_level = _level_from_title(title)

    # Senior title beats everything (spec: "Senior word always wins over a low
    # years number" — and also over a misleading structured 'entry' label).
    if title_level == "senior":
        return "senior", years_min, years_max

    if structured:
        return structured, years_min, years_max

    if title_level:
        return title_level, years_min, years_max

    years_level = _level_from_years(years_min)
    if years_level:
        return years_level, years_min, years_max

    return "unknown", years_min, years_max


# --- the full normalizer -----------------------------------------------------

def normalize_job(raw_job: RawJob) -> Optional[dict[str, Any]]:
    """Turn a ``RawJob`` into a canonical ``jobs`` row dict.

    Returns ``None`` for unusable postings (missing title or apply_url).
    The returned dict's keys are exactly ``jobs`` columns (minus the identity
    ``id`` and the embedding, which fit.py fills later). ``source_slug`` is
    carried along so db.py can resolve the FK ``source_id``.
    """
    title = (raw_job.title or "").strip()
    apply_url = (raw_job.apply_url or "").strip()
    if not title or not apply_url:
        log.debug("skip unusable raw job (title/url missing) from %s", raw_job.source_slug)
        return None

    # Always run the HTML stripper — it is a no-op on already-plain text and
    # protects against sources that mislabel description_is_html.
    description = cap_text(strip_html(raw_job.description))

    city, state, country, loc_remote = parse_location(
        raw_job.location_raw, raw_job.city, raw_job.state, raw_job.country
    )
    is_remote = bool(raw_job.is_remote) or loc_remote
    work_type = resolve_work_type(raw_job.work_type, is_remote, raw_job.location_raw)
    if work_type == "remote":
        is_remote = True

    # Salary: prefer structured numbers; fall back to text scrape.
    smin, smax, currency, period = normalize_salary(
        raw_job.salary_min, raw_job.salary_max, raw_job.salary_period, raw_job.salary_currency
    )
    salary_is_estimated = bool(raw_job.salary_is_estimated)
    if smin is None and smax is None:
        tmin, tmax, tperiod = parse_salary_from_text(description)
        if tmin is not None or tmax is not None:
            smin, smax, period = tmin, tmax, tperiod
            currency = "USD"
            salary_is_estimated = True  # text-scraped figures are estimates

    exp_level, years_min, years_max = classify_experience(
        title, description, raw_job.experience_hint, raw_job.employment_type
    )

    tags = [t.strip() for t in (raw_job.tags or []) if t and t.strip()]
    # de-dup tags, preserve order, lowercase
    seen: set[str] = set()
    norm_tags: list[str] = []
    for t in tags:
        key = t.lower()
        if key not in seen:
            seen.add(key)
            norm_tags.append(t)

    dhash = dedupe_hash(raw_job.company, title, city, state, is_remote)

    location_raw = (raw_job.location_raw or "").strip() or None
    if not location_raw:
        if is_remote:
            location_raw = "Remote"
        elif city or state:
            location_raw = ", ".join(p for p in (city, state) if p)

    return {
        "source_slug": raw_job.source_slug,          # resolved to source_id in db.py
        "external_id": str(raw_job.external_id),
        "dedupe_hash": dhash,
        "title": title,
        "company": (raw_job.company or "").strip() or None,
        "description": description or None,
        "apply_url": apply_url,
        "location_raw": location_raw,
        "city": city,
        "state": state,
        "country": country,
        "is_remote": is_remote,
        "work_type": work_type,
        "salary_min": smin,
        "salary_max": smax,
        "salary_currency": currency or "USD",
        "salary_period": period,
        "salary_is_estimated": salary_is_estimated,
        "experience_level": exp_level if exp_level in EXPERIENCE_ENUM else "unknown",
        "years_min": years_min,
        "years_max": years_max,
        "tags": norm_tags,
        "posted_at": raw_job.posted_at,
        "raw": raw_job.raw or {},
    }
