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
# TRUE individual-contributor seniority -> 'senior'.
_TITLE_SENIOR = re.compile(
    r"\b(senior|sr\.?|staff|principal|lead|architect|distinguished)\b",
    re.IGNORECASE,
)
# MANAGEMENT titles -> 'lead' (NOT 'senior'). These are people-management roles
# and must not be force-promoted past a structured intern/new_grad/entry hint.
_TITLE_MANAGEMENT = re.compile(
    r"\b(manager|director|vp|v\.p\.|head\s+of)\b",
    re.IGNORECASE,
)
_TITLE_INTERN = re.compile(r"\b(intern|internship|co-?op|trainee)\b", re.IGNORECASE)
_TITLE_NEWGRAD = re.compile(
    r"\b(new\s*grad|new-?grad|entry[\s-]*level|early\s*career|associate|"
    r"junior|jr\.?|grad(?:uate)?\s+(?:engineer|program|role))\b",
    re.IGNORECASE,
)
# Mid-level: an explicit "mid-level"/"intermediate", OR a level number ("II"/"2")
# but only in an engineering/technical context (so "Sales 2" isn't mis-mid'd).
_TITLE_MID_EXPLICIT = re.compile(r"\b(mid[\s-]*level|intermediate)\b", re.IGNORECASE)
_TITLE_MID_LEVELNUM = re.compile(r"\b(ii|2)\b", re.IGNORECASE)
_ENG_CONTEXT_RE = re.compile(
    r"\b(engineer|engineering|developer|swe|sde|programmer|scientist|architect)\b",
    re.IGNORECASE,
)

# Free-text salary patterns (fallback when no structured numbers).
#   $120k - $150k   /   $120,000 to $150,000   /   $60/hr   /   $150k
#   $8,000/month   /   $120,000 - 150k   (mixed full/k range)
_SALARY_RANGE_K_RE = re.compile(
    r"\$?\s*(\d{2,3})\s*[kK]\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3})\s*[kK]"
)
_SALARY_RANGE_FULL_RE = re.compile(
    r"\$\s*(\d{2,3}(?:,\d{3})+)\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3}(?:,\d{3})+)"
)
# Mixed range: a full number on one side and a k-number on the other, in either
# order — "$120,000 - 150k" or "$120k - 150,000".
_SALARY_RANGE_MIXED_RE = re.compile(
    r"\$\s*(\d{2,3}(?:,\d{3})+)\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3})\s*[kK]\b"
    r"|"
    r"\$\s*(\d{2,3})\s*[kK]\s*(?:-|–|—|to)\s*\$?\s*(\d{2,3}(?:,\d{3})+)"
)
_SALARY_HOURLY_RE = re.compile(
    r"\$\s*(\d{1,3}(?:\.\d{1,2})?)\s*(?:/|\s*per\s*)\s*(?:hr|hour)", re.IGNORECASE
)
_SALARY_MONTHLY_RE = re.compile(
    r"\$\s*(\d{1,3}(?:,\d{3})+|\d{3,6})\s*(?:/|\s*per\s*)\s*(?:mo|month)",
    re.IGNORECASE,
)
_SALARY_SINGLE_K_RE = re.compile(r"\$\s*(\d{2,3})\s*[kK]\b")
_SALARY_SINGLE_FULL_RE = re.compile(r"\$\s*(\d{2,3}(?:,\d{3})+)")
# A lone number (no "$", no "k") preceded by a period word, e.g.
# "annual salary of 150000" — only trusted with that leading cue.
_SALARY_LONE_WITH_WORD_RE = re.compile(
    r"\b(?:salary|compensation|comp|pay|base)\b[^.\d]{0,20}\$?\s*"
    r"(\d{2,3}(?:,\d{3})+)",
    re.IGNORECASE,
)
# "401" / "401(k)" guard: a money match whose digits are part of a 401(k)
# mention is a false positive.
_401_RE = re.compile(r"401\s*\(?\s*k", re.IGNORECASE)

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

# Canadian province abbreviations + "canada", for forcing country='CA'.
_CA_PROVINCE_ABBRS = {
    "on", "qc", "bc", "ab", "mb", "sk", "ns", "nb", "nl", "pe", "nt", "yt", "nu",
}
_CA_TOKENS = _CA_PROVINCE_ABBRS | {"canada"}

# Genuine non-US country / region / province tokens. A whole-word hit here
# (with no overriding POSITIVE US signal) marks a posting as NOT in the US.
# NOTE: "georgia" was REMOVED — it is a US state (GA). India/indiana is safe
# (\bindia\b won't match inside "indiana").
_NON_US_COUNTRY_TOKENS = {
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
}

# Unambiguously non-US cities (no US city collides with these). A whole-word hit
# is decisive on its own.
_NON_US_CITIES = {
    "toronto", "montreal", "vancouver", "ottawa", "calgary", "edmonton",
    "edinburgh", "lyon", "berlin", "munich",
    "hamburg", "frankfurt", "cologne", "amsterdam", "rotterdam", "dublin",
    "madrid", "barcelona", "valencia", "lisbon", "porto", "zurich", "geneva",
    "stockholm", "oslo", "copenhagen", "helsinki", "warsaw", "krakow", "prague",
    "vienna", "brussels", "milan", "rome", "bucharest", "budapest",
    "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "pune", "chennai",
    "kolkata", "gurgaon", "gurugram", "noida", "tokyo", "osaka", "kyoto",
    "beijing", "shanghai", "shenzhen", "guangzhou", "seoul", "sydney",
    "melbourne", "brisbane", "perth", "auckland", "wellington", "sao paulo",
    "rio de janeiro", "buenos aires", "santiago", "bogota", "lima",
    "mexico city", "guadalajara", "tel aviv", "jerusalem", "dubai", "abu dhabi",
    "doha", "riyadh", "cairo", "lagos", "nairobi", "cape town", "johannesburg",
    "istanbul", "bangkok", "jakarta", "manila", "kuala lumpur", "ho chi minh",
}

# City names that ALSO name a US city (Manchester NH, Birmingham AL, Athens GA,
# Paris TX, London KY). These only count as non-US when a genuine non-US country
# token co-occurs in the same location blob.
_AMBIGUOUS_CITIES = {
    "london", "manchester", "paris", "athens", "birmingham",
}


def is_us_job(nj: dict[str, Any]) -> bool:
    """Heuristic US-only filter (spec: owner wants USA jobs only).

    POSITIVE US signal wins FIRST: a US state abbr/name, a US country token, or a
    ", US"/"United States" in location_raw => keep, regardless of any look-alike
    city token. Only after that do we scan for genuine non-US signals. Tokens are
    matched as whole words so US look-alikes survive (e.g. "Indiana" is not
    matched by "india"). An ambiguous city (Manchester/London/Paris/Athens/
    Birmingham) is non-US only when a real non-US country token co-occurs.
    """
    blob = " ".join(
        x for x in (nj.get("location_raw"), nj.get("city"), nj.get("country")) if x
    ).lower()
    location_raw = (nj.get("location_raw") or "")

    # --- POSITIVE US signals (win first) ------------------------------------
    state = (nj.get("state") or "").upper()
    if state in _STATE_ABBRS:
        return True
    country = (nj.get("country") or "").upper()
    if country in (
        "US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA", "AMERICA",
    ):
        return True
    if re.search(r",\s*us\b|united states", location_raw, re.IGNORECASE):
        return True
    # A US state name/abbr present anywhere in the blob is a positive signal.
    if blob:
        for name in _US_STATES:
            if re.search(r"\b" + re.escape(name) + r"\b", blob):
                return True
        for abbr in _STATE_ABBRS:
            if re.search(r",\s*" + abbr.lower() + r"\b", blob):
                return True

    # --- NEGATIVE signals (only reached when no positive US signal) ---------
    # A declared non-US country code/name discards immediately.
    if country and country not in (
        "US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA", "AMERICA", "",
    ):
        return False
    if not blob:
        return True

    # Canadian provinces: "City, ON" etc. (no US state collides with these).
    if re.search(r",\s*(?:on|qc|bc|ab|mb|sk|ns|nb|nl|pe|nt|yt|nu)\b", blob):
        return False

    has_country = any(
        re.search(r"\b" + re.escape(tok) + r"\b", blob)
        for tok in _NON_US_COUNTRY_TOKENS
    )
    if has_country:
        return False
    for tok in _NON_US_CITIES:
        if re.search(r"\b" + re.escape(tok) + r"\b", blob):
            return False
    # Ambiguous cities only count as non-US alongside a real country token
    # (handled above) — on their own they are kept as possible US cities.
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


# Title canonicalization for the dedupe hash (NOT for the human-facing title).
_TITLE_PAREN_RE = re.compile(r"\([^)]*\)|\[[^\]]*\]")     # "(Remote)" / "[Contract]"
_TITLE_TRAILING_LOC_RE = re.compile(
    r"\s[-–—]\s.+$",                                       # " - San Francisco"
)
_TITLE_TRAILING_ST_RE = re.compile(r",\s*[a-z]{2}\s*$", re.IGNORECASE)  # ", CA"
# Roman-numeral / level tokens: I/II/III/IV..., L4, Level 3, etc.
_TITLE_LEVEL_RE = re.compile(
    r"\b(?:i{1,3}|iv|v|vi{0,3}|ix|x|l\d{1,2}|level\s*\d{1,2})\b",
    re.IGNORECASE,
)
_TITLE_REQID_RE = re.compile(r"\b\d{6,}\b")               # 6+ digit req-ids
_TITLE_SR_RE = re.compile(r"\b(?:sr|snr)\b\.?", re.IGNORECASE)
_TITLE_JR_RE = re.compile(r"\bjr\b\.?", re.IGNORECASE)


def normalize_title_for_hash(title: Optional[str]) -> str:
    """Canonicalize a title for dedupe hashing ONLY.

    Maps sr/snr->senior, jr->junior; strips parenthetical/bracket suffixes, a
    trailing " - <location>" or ", <ST>", roman-numeral/level tokens, and 6+
    digit req-ids — so "Senior Software Engineer" and "Sr. Software Engineer
    (Remote)" collapse to the same basis. Does NOT change the stored title.
    """
    if not title:
        return ""
    text = title
    # Drop parenthetical/bracket suffixes first ("(Remote)", "[Contract]").
    text = _TITLE_PAREN_RE.sub(" ", text)
    # Strip a trailing req-id and ", ST" / " - location" tail.
    text = _TITLE_REQID_RE.sub(" ", text)
    text = _TITLE_TRAILING_ST_RE.sub(" ", text)
    text = _TITLE_TRAILING_LOC_RE.sub(" ", text)
    # sr/snr -> senior, jr -> junior (before punctuation strip eats the dots).
    text = _TITLE_SR_RE.sub("senior", text)
    text = _TITLE_JR_RE.sub("junior", text)
    # Drop roman-numeral / level tokens (II, III, L4, Level 3).
    text = _TITLE_LEVEL_RE.sub(" ", text)
    # Final token normalize: lowercase, depunctuate, collapse whitespace.
    return _norm_token(text)


def dedupe_hash(
    company: Optional[str],
    title: Optional[str],
    city: Optional[str],
    state: Optional[str],
    is_remote: bool,
) -> str:
    """sha256(lower(normalize(company)|normalize_title_for_hash(title)|loc)).

    The title segment is canonicalized (sr->senior, suffixes/levels/req-ids
    stripped) so trivially-different titles for the same role hash identically.
    The location segment reduces to 'remote' or 'city state'. Stable across
    re-runs and across sources for the same logical posting.
    """
    loc = normalize_location_key(city, state, is_remote)
    basis = "|".join(
        (normalize_company(company), normalize_title_for_hash(title), loc)
    )
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

        # Canadian province / "canada" anywhere => CA. Clear any mis-parsed
        # city/state (e.g. "ON" is not a US state; "Toronto, ON" is not a US row).
        seg_lows = {s.lower() for s in segs}
        if seg_lows & _CA_TOKENS:
            country = "CA"
            city = None
            state = None
            segs = []  # don't pull a city/state from a Canadian location

        if segs:
            # When the posting looks remote and the source gave no city hint, do
            # NOT treat the first segment as a city — "Remote, US" must not yield
            # city="Remote"-adjacent garbage, and "Remote - EMEA" must not set a
            # city. Country/state detection below still runs on every segment.
            seg_iter = segs
            if not city and not looks_remote:
                city = segs[0] or None
                seg_iter = segs[1:]
            for seg in seg_iter:
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

    # A US state present implies US (overrides a stray non-US country guess).
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


def _canonical_period(declared: Optional[str]) -> Optional[str]:
    """Map a source-declared period string to a canonical token, or None."""
    if not declared:
        return None
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
    return None


def _infer_period(amount: float, declared: Optional[str]) -> str:
    """Pick a sensible period.

    If the source declared an explicit period, TRUST it — the magnitude
    heuristic only runs when the period is unknown/None. (A source-labeled
    annual value below the floor is handled as out-of-bounds in
    ``normalize_salary``, never silently relabeled as monthly/hourly.)
    """
    canon = _canonical_period(declared)
    if canon is not None:
        return canon
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


def _near_401(snippet: str, start: int) -> bool:
    """True if a 401(k) mention sits just before/after a match (false positive)."""
    lo = max(0, start - 6)
    window = snippet[lo : start + 12]
    return bool(_401_RE.search(window))


def parse_salary_from_text(
    text: Optional[str],
) -> tuple[Optional[int], Optional[int], Optional[str]]:
    """Best-effort salary scrape from free text. Returns (min, max, period).

    The returned period is DETECTED from the prose ('$60/hour' -> 'hour',
    '$8,000/month' -> 'month', otherwise 'year'). Matches adjacent to
    "401"/"401(k)" are skipped as false positives, and a lone bare number is
    only trusted when preceded by a "$" or a period/comp word.
    """
    if not text:
        return None, None, None
    snippet = text[:4000]

    # Explicit period in prose wins first so we don't mis-read an hourly/monthly
    # figure as annual.
    for m in _SALARY_HOURLY_RE.finditer(snippet):
        if _near_401(snippet, m.start(1)):
            continue
        rate = float(m.group(1))
        smin, smax, _, _ = normalize_salary(rate, None, "hour", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "hour"

    for m in _SALARY_MONTHLY_RE.finditer(snippet):
        if _near_401(snippet, m.start(1)):
            continue
        val = float(m.group(1).replace(",", ""))
        smin, smax, _, _ = normalize_salary(val, None, "month", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "month"

    # Mixed full/k range, e.g. "$120,000 - 150k" or "$120k - 150,000".
    for m in _SALARY_RANGE_MIXED_RE.finditer(snippet):
        if _near_401(snippet, m.start()):
            continue
        if m.group(1) is not None:       # full - k
            lo = int(m.group(1).replace(",", ""))
            hi = int(m.group(2)) * 1000
        else:                            # k - full
            lo = int(m.group(3)) * 1000
            hi = int(m.group(4).replace(",", ""))
        smin, smax, _, _ = normalize_salary(lo, hi, "year", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "year"

    for m in _SALARY_RANGE_K_RE.finditer(snippet):
        if _near_401(snippet, m.start()):
            continue
        lo, hi = int(m.group(1)) * 1000, int(m.group(2)) * 1000
        smin, smax, _, _ = normalize_salary(lo, hi, "year", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "year"

    for m in _SALARY_RANGE_FULL_RE.finditer(snippet):
        if _near_401(snippet, m.start()):
            continue
        lo = int(m.group(1).replace(",", ""))
        hi = int(m.group(2).replace(",", ""))
        smin, smax, _, _ = normalize_salary(lo, hi, "year", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "year"

    for m in _SALARY_SINGLE_K_RE.finditer(snippet):
        if _near_401(snippet, m.start()):
            continue
        val = int(m.group(1)) * 1000
        smin, smax, _, _ = normalize_salary(val, None, "year", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "year"

    for m in _SALARY_SINGLE_FULL_RE.finditer(snippet):
        if _near_401(snippet, m.start()):
            continue
        val = int(m.group(1).replace(",", ""))
        smin, smax, _, _ = normalize_salary(val, None, "year", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "year"

    # Lone number only when a period/comp word leads it (no "$" needed there).
    for m in _SALARY_LONE_WITH_WORD_RE.finditer(snippet):
        if _near_401(snippet, m.start(1)):
            continue
        val = int(m.group(1).replace(",", ""))
        smin, smax, _, _ = normalize_salary(val, None, "year", "USD")
        if smin is not None or smax is not None:
            return smin, smax, "year"

    return None, None, None


# --- experience parsing ------------------------------------------------------

# Cues that mark a "N years" mention as a real experience requirement (as
# opposed to "1 year of free gym"). A cue must sit within ~60 chars of the match.
_EXP_CUE_RE = re.compile(
    r"experience|required|require|at\s+least|minimum|min\.|yoe|years?\s+of\b",
    re.IGNORECASE,
)
# Section headers that begin the requirements/qualifications portion.
_REQ_SECTION_RE = re.compile(
    r"\b(requirements?|qualifications?|what\s+you'?ll\s+need|"
    r"who\s+you\s+are|minimum\s+qualifications?|basic\s+qualifications?)\b",
    re.IGNORECASE,
)


def _years_in_blob(blob: str) -> tuple[Optional[int], Optional[int]]:
    """MIN/MAX years in a blob, counting only experience-cued, sane matches."""
    best_min: Optional[int] = None
    best_max: Optional[int] = None
    for m in _YEARS_RE.finditer(blob):
        lo = int(m.group(1))
        hi = int(m.group(2)) if m.group(2) else None
        if lo > 40:  # nonsense (e.g. "401k" matched as "401 years")
            continue
        # 401k guard: a "401" immediately before the number is a benefits ref.
        pre = blob[max(0, m.start() - 6) : m.start()]
        if _401_RE.search(pre + m.group(0)[:4]):
            continue
        # Require an experience cue within ~60 chars on either side, so
        # "1 year of free gym membership" doesn't drag a real "5+ years" down.
        ctx = blob[max(0, m.start() - 60) : m.end() + 60]
        if not _EXP_CUE_RE.search(ctx):
            continue
        if best_min is None or lo < best_min:
            best_min = lo
            best_max = hi if hi is not None else lo
    return best_min, best_max


def _years_from_text(text: Optional[str]) -> tuple[Optional[int], Optional[int]]:
    """Min/max experience-years from free text.

    Counts a "N years" match only when an experience cue
    ("experience"/"required"/"at least"/"minimum"/"yoe"/"years of") sits within
    ~60 chars, so incidental numbers ("1 year of free gym") are ignored. The
    requirements/qualifications section, if found, is preferred over the rest.
    """
    if not text:
        return None, None
    snippet = text[:6000]

    # Prefer the requirements/qualifications portion when present.
    sec = _REQ_SECTION_RE.search(snippet)
    if sec:
        req_min, req_max = _years_in_blob(snippet[sec.start():])
        if req_min is not None:
            return req_min, req_max

    return _years_in_blob(snippet)


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
    """Title classifier.

    Returns one of 'senior' (true IC seniority), 'lead' (management),
    'intern', 'new_grad', 'mid', or None. TRUE seniority is checked before
    management so "Senior Engineering Manager" reads 'senior', but a bare
    management title ("Product Manager") reads 'lead', not 'senior'.
    """
    if not title:
        return None
    if _TITLE_SENIOR.search(title):
        return "senior"
    if _TITLE_INTERN.search(title):
        return "intern"
    if _TITLE_NEWGRAD.search(title):
        return "new_grad"
    if _TITLE_MANAGEMENT.search(title):
        return "lead"
    if _TITLE_MID_EXPLICIT.search(title):
        return "mid"
    if _TITLE_MID_LEVELNUM.search(title) and _ENG_CONTEXT_RE.search(title):
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

    # A TRUE senior title (senior/staff/principal/lead-IC/architect) beats
    # everything (spec: "Senior word always wins over a low years number" — and
    # over a misleading structured 'entry' label).
    if title_level == "senior":
        return "senior", years_min, years_max

    # A structured intern/new_grad/entry/etc. hint OVERRIDES a bare management
    # title ('lead'). Management is a people-leadership signal, not IC seniority,
    # so an explicit junior structured level must win.
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
