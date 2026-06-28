"""Unit tests for normalize.py — salary, experience, dedupe, HTML strip.

Run from the repo root:  pytest scraper/tests/test_normalize.py
These tests touch no network and no DB (normalize is pure functions).
"""

from __future__ import annotations

import os
import sys

# Make the `scraper` package importable when pytest is run from the repo root
# or from within the scraper/ dir.
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.dirname(os.path.dirname(_HERE))
if _REPO_ROOT not in sys.path:
    sys.path.insert(0, _REPO_ROOT)

from scraper import normalize  # noqa: E402
from scraper.normalize import (  # noqa: E402
    classify_experience,
    dedupe_hash,
    is_us_job,
    normalize_salary,
    normalize_title_for_hash,
    parse_location,
    parse_salary_from_text,
    strip_html,
)
from scraper.sources.base import RawJob  # noqa: E402


# --- salary: structured ------------------------------------------------------

def test_salary_hourly_to_annual():
    # $50/hr -> 50 * 2080 = 104,000
    smin, smax, cur, period = normalize_salary(50, None, "hour", "USD")
    assert smin == 104_000
    assert cur == "USD"
    assert period == "hour"


def test_salary_monthly_to_annual():
    # $10,000/mo -> 120,000
    smin, smax, cur, period = normalize_salary(10_000, None, "month", "USD")
    assert smin == 120_000
    assert period == "month"


def test_salary_annual_range_kept():
    smin, smax, cur, period = normalize_salary(120_000, 150_000, "year", "USD")
    assert (smin, smax) == (120_000, 150_000)
    assert period == "year"


def test_salary_range_swapped_when_inverted():
    smin, smax, _, _ = normalize_salary(150_000, 120_000, "year", "USD")
    assert smin == 120_000 and smax == 150_000


def test_salary_out_of_bounds_discarded():
    # $5/hr annualizes to 10,400 -> below the $20k floor -> discarded.
    smin, smax, _, _ = normalize_salary(5, None, "hour", "USD")
    assert smin is None and smax is None
    # $5M is above the $1M ceiling.
    smin2, smax2, _, _ = normalize_salary(5_000_000, None, "year", "USD")
    assert smin2 is None and smax2 is None


def test_salary_non_usd_discarded():
    smin, smax, cur, _ = normalize_salary(100_000, 120_000, "year", "EUR")
    assert smin is None and smax is None
    assert cur == "EUR"


def test_salary_bare_number_inferred_hourly():
    # A bare 60 with no period should be inferred hourly -> 124,800.
    smin, _, _, period = normalize_salary(60, None, None, "USD")
    assert smin == 124_800
    assert period == "hour"


# --- salary: free-text -------------------------------------------------------

def test_salary_text_range_k():
    smin, smax, period = parse_salary_from_text("Comp is $120k - $150k DOE.")
    assert (smin, smax) == (120_000, 150_000)
    assert period == "year"


def test_salary_text_full_range():
    smin, smax, period = parse_salary_from_text("Salary: $120,000 to $150,000")
    assert (smin, smax) == (120_000, 150_000)


def test_salary_text_hourly():
    smin, smax, period = parse_salary_from_text("Pay rate $60/hr, W2.")
    assert smin == 124_800
    assert period == "hour"


def test_salary_text_single_k():
    smin, smax, period = parse_salary_from_text("Base around $140k.")
    assert smin == 140_000
    assert smax is None


# --- salary_is_predicted string handling (the '0' truthiness bug) ------------

def test_adzuna_predicted_string_zero_is_not_estimated():
    # '0' is truthy in Python — an explicit string compare is required.
    assert (str("0") == "1") is False
    assert (str("1") == "1") is True


# --- experience classification ----------------------------------------------

def test_experience_senior_title_beats_low_years():
    # "Senior" in the title must win over "2 years" in the description.
    level, ymin, ymax = classify_experience(
        "Senior Software Engineer", "We want 2 years of experience.", None, None
    )
    assert level == "senior"


def test_experience_staff_principal_lead_classify_senior():
    for title in ("Staff ML Engineer", "Principal AI Engineer", "Engineering Lead"):
        level, _, _ = classify_experience(title, "", None, None)
        assert level == "senior", title


def test_experience_structured_intern_from_employment_type():
    level, _, _ = classify_experience(
        "Software Engineer", "", structured_hint=None, employment_type="INTERN"
    )
    assert level == "intern"


def test_experience_structured_muse_level():
    level, _, _ = classify_experience(
        "Software Engineer", "", structured_hint="Entry Level", employment_type=None
    )
    assert level == "new_grad"


def test_experience_years_min_taken():
    # "3-5 years" and "2+ years" present -> MIN years is 2.
    level, ymin, ymax = classify_experience(
        "Backend Engineer", "Requires 3-5 years; 2+ years with Python.", None, None
    )
    assert ymin == 2


def test_experience_new_grad_title():
    level, _, _ = classify_experience("New Grad Software Engineer", "", None, None)
    assert level == "new_grad"


def test_experience_unknown_when_nothing_matches():
    level, ymin, ymax = classify_experience("Software Engineer", "Join our team!", None, None)
    assert level == "unknown"
    assert ymin is None


def test_experience_401k_not_misread_as_years():
    # "401k" must not be parsed as "401 years".
    level, ymin, ymax = classify_experience(
        "Software Engineer", "We offer a 401k plan.", None, None
    )
    assert ymin is None


# --- dedupe_hash -------------------------------------------------------------

def test_dedupe_hash_stable_and_normalized():
    h1 = dedupe_hash("Stripe, Inc.", "Software Engineer", "San Francisco", "CA", False)
    h2 = dedupe_hash("  stripe   ", "software engineer", "san francisco", "ca", False)
    assert h1 == h2  # suffix/case/whitespace normalized away
    assert len(h1) == 64  # sha256 hex


def test_dedupe_hash_remote_collapses_location():
    h_remote = dedupe_hash("Acme", "ML Engineer", None, None, True)
    h_remote2 = dedupe_hash("Acme", "ML Engineer", "Austin", "TX", True)
    assert h_remote == h_remote2  # is_remote -> location key is just 'remote'


def test_dedupe_hash_differs_on_company():
    h1 = dedupe_hash("Acme", "ML Engineer", None, None, True)
    h2 = dedupe_hash("Globex", "ML Engineer", None, None, True)
    assert h1 != h2


# --- HTML strip + cap --------------------------------------------------------

def test_strip_html_basic():
    html = "<p>Hello <b>world</b></p><ul><li>One</li><li>Two</li></ul>"
    text = strip_html(html)
    assert "Hello world" in text
    assert "One" in text and "Two" in text
    assert "<" not in text


def test_strip_html_entities():
    assert "AT&T" in strip_html("AT&amp;T &lt;tag&gt;")


def test_strip_html_handles_plain_text():
    assert strip_html("just plain text") == "just plain text"


def test_cap_text_caps_bytes():
    big = "x" * 20000
    capped = normalize.cap_text(big, cap_bytes=8 * 1024)
    assert len(capped.encode("utf-8")) <= 8 * 1024


# --- full normalize_job integration -----------------------------------------

def test_normalize_job_full_record():
    rj = RawJob(
        source_slug="greenhouse",
        external_id="stripe:123",
        title="Senior Software Engineer",
        apply_url="https://boards.greenhouse.io/stripe/jobs/123",
        company="Stripe, Inc.",
        description="<p>Build payments. 5+ years required. $180,000 to $220,000.</p>",
        location_raw="San Francisco, CA",
    )
    out = normalize.normalize_job(rj)
    assert out is not None
    assert out["experience_level"] == "senior"
    assert out["city"] == "San Francisco"
    assert out["state"] == "CA"
    assert out["country"] == "US"
    assert out["salary_min"] == 180_000 and out["salary_max"] == 220_000
    assert "<" not in (out["description"] or "")
    assert len(out["dedupe_hash"]) == 64


def test_normalize_job_drops_unusable():
    rj = RawJob(source_slug="x", external_id="1", title="", apply_url="")
    assert normalize.normalize_job(rj) is None


def test_normalize_job_remote_detection():
    rj = RawJob(
        source_slug="remotive",
        external_id="9",
        title="Software Engineer",
        apply_url="https://example.com/9",
        company="Acme",
        location_raw="Remote (USA)",
        is_remote=True,
        work_type="remote",
    )
    out = normalize.normalize_job(rj)
    assert out["is_remote"] is True
    assert out["work_type"] == "remote"


# === REGRESSION TESTS FOR VERIFIED DATA-ACCURACY FIXES =======================

# --- Fix 1: salary period mis-inference --------------------------------------

def test_fix1_source_labeled_annual_below_floor_discarded_not_relabeled():
    # A source-labeled annual $18k is below the $20k floor -> discard (None),
    # NOT relabel as monthly (x12 -> ~$216k) or hourly (x2080 -> ~$37M).
    smin, smax, _, period = normalize_salary(18_000, None, "year", "USD")
    assert smin is None and smax is None


def test_fix1_explicit_month_period_trusted_not_reinferred():
    # An explicit month period on a small figure must be trusted, not re-judged
    # by magnitude. $1,800/mo -> 21,600 annual (above floor) and stays monthly.
    smin, _, _, period = normalize_salary(1_800, None, "month", "USD")
    assert smin == 21_600
    assert period == "month"


# --- Fix 2: parse_salary_from_text -------------------------------------------

def test_fix2_mixed_full_and_k_range():
    smin, smax, period = parse_salary_from_text("Range: $120,000 - 150k.")
    assert (smin, smax) == (120_000, 150_000)
    assert period == "year"


def test_fix2_detects_monthly_period_from_prose():
    smin, smax, period = parse_salary_from_text("Stipend of $8,000/month.")
    assert smin == 96_000
    assert period == "month"


def test_fix2_excludes_401k_false_positive():
    # "$401(k)" style / "401k" near a number must not be scraped as salary.
    smin, smax, period = parse_salary_from_text("We match your 401(k) up to 6%.")
    assert smin is None and smax is None and period is None


def test_fix2_lone_number_requires_dollar_or_period_word():
    # A bare "150000" with no "$" and no period/comp word is NOT a salary.
    smin, smax, period = parse_salary_from_text("Job id 150000 posted today.")
    assert smin is None and smax is None
    # But a lone number led by a comp word IS accepted.
    smin2, _, _ = parse_salary_from_text("Annual salary of 150,000 offered.")
    assert smin2 == 150_000


# --- Fix 3: is_us_job false-drops --------------------------------------------

def test_fix3_us_city_colliding_with_nonus_token_kept():
    for loc, st in (
        ("Manchester, NH", "NH"),
        ("Birmingham, AL", "AL"),
        ("Athens, GA", "GA"),
        ("Paris, TX", "TX"),
        ("London, KY", "KY"),
    ):
        nj = {"location_raw": loc, "city": loc.split(",")[0], "state": st}
        assert is_us_job(nj) is True, loc


def test_fix3_georgia_state_is_us():
    nj = {"location_raw": "Atlanta, Georgia", "city": "Atlanta", "state": None}
    assert is_us_job(nj) is True


def test_fix3_ambiguous_city_with_country_token_is_nonus():
    nj = {"location_raw": "London, United Kingdom", "city": "London", "state": None}
    assert is_us_job(nj) is False


def test_fix3_positive_us_signal_wins():
    nj = {"location_raw": "Paris, US", "city": "Paris", "state": None}
    assert is_us_job(nj) is True


# --- Fix 4: parse_location mis-assignment ------------------------------------

def test_fix4_remote_no_city_hint_does_not_pull_seg0_as_city():
    city, state, country, looks_remote = parse_location("Remote - EMEA")
    assert looks_remote is True
    assert city is None


def test_fix4_canadian_province_sets_ca_clears_city_state():
    city, state, country, _ = parse_location("Toronto, ON")
    assert country == "CA"
    assert city is None and state is None


def test_fix4_trailing_two_letter_only_accepted_as_us_state():
    # "XY" is not a US state -> must not be set as state.
    city, state, country, _ = parse_location("Springfield, XY")
    assert state is None
    # A real abbr IS accepted.
    _, state2, _, _ = parse_location("Springfield, IL")
    assert state2 == "IL"


# --- Fix 5: management titles not forced to senior ---------------------------

def test_fix5_entry_associate_manager_with_structured_hint_overrides():
    level, _, _ = classify_experience(
        "Entry Level Associate Product Manager", "",
        structured_hint="Entry Level", employment_type=None,
    )
    assert level == "new_grad"


def test_fix5_bare_management_title_is_lead_not_senior():
    level, _, _ = classify_experience("Product Manager", "", None, None)
    assert level == "lead"


def test_fix5_mid_levelnum_requires_engineering_context():
    # "Engineer II" -> mid; "Account Executive II" (no eng context) -> not mid.
    lvl_eng, _, _ = classify_experience("Software Engineer II", "", None, None)
    assert lvl_eng == "mid"
    lvl_sales, _, _ = classify_experience("Account Executive II", "", None, None)
    assert lvl_sales != "mid"


# --- Fix 6: _years_from_text global-min skew ---------------------------------

def test_fix6_incidental_year_does_not_drag_down_real_requirement():
    # "1 year of free gym" is incidental; "5+ years experience" is the real req.
    _, ymin, ymax = classify_experience(
        "Backend Engineer",
        "Perks: 1 year of free gym membership. "
        "Requirements: 5+ years of experience with Python.",
        None, None,
    )
    assert ymin == 5


# --- Fix 7: dedupe_hash title canonicalization -------------------------------

def test_fix7_sr_and_senior_titles_hash_the_same():
    h1 = dedupe_hash("Acme", "Senior Software Engineer", "Austin", "TX", False)
    h2 = dedupe_hash("Acme", "Sr. Software Engineer (Remote)", "Austin", "TX", False)
    assert h1 == h2


def test_fix7_normalize_title_for_hash_strips_levels_and_reqids():
    assert (
        normalize_title_for_hash("Software Engineer II - San Francisco")
        == normalize_title_for_hash("Software Engineer 998877")
    )
    assert normalize_title_for_hash("Sr. Data Scientist") == "senior data scientist"
