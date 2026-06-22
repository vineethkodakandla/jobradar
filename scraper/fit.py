"""Fit-scoring engine (spec §7).

$0 default pipeline: local ``sentence-transformers/all-MiniLM-L6-v2`` (384-dim)
embeddings + a 5-component heuristic scorer, all computed in the daily Action.
Jobs are embedded once; a profile edit triggers a numpy-only cosine re-score of
all active jobs (no job re-embedding).

Five components, each in [0,1]:
  semantic_sim (0.35), skill_overlap (0.30), experience_match (0.20),
  location_worktype (0.10), recency (0.05).

Hard gates (caps applied AFTER the weighted sum so a disqualifier can't be
averaged away):
  * location_worktype == 0.0 -> score = min(score, 20), band Low, gate 'onsite_outside_us'
  * must_cov == 0 AND job lists >= 3 must-haves -> min(score, 45), gate 'zero_must_have'
  * job_level == senior -> min(score, 74) ('reach', never Strong)

Bands (single source of truth, must match lib/fit.ts):
  Strong >= 78 · Good 62–77 · Stretch 45–61 · Low < 45.

Optional Claude Haiku rationale (OFF by default) lives in
``maybe_llm_rationale`` and is invoked only by main.py when the env flag is set.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np

log = logging.getLogger("jobradar.fit")

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
MODEL_LABEL = "all-MiniLM-L6-v2"      # stored in job_fit.model (matches schema default)
EMBED_DIM = 384

# Component weights (must match lib/fit.ts FIT_COMPONENT_WEIGHTS).
W_SEMANTIC = 0.35
W_SKILL = 0.30
W_EXPERIENCE = 0.20
W_LOCATION = 0.10
W_RECENCY = 0.05

# semantic_sim normalization window: sem = clamp((cos - 0.15)/(0.65 - 0.15),0,1)
SEM_LO = 0.15
SEM_HI = 0.65

# Band cutoffs — SINGLE SOURCE OF TRUTH (mirrors lib/fit.ts getFitTier).
BAND_STRONG = 78
BAND_GOOD = 62
BAND_STRETCH = 45

# A skill weight of >= this counts as a "must-have" (1.0 in the seed profile).
MUST_HAVE_THRESHOLD = 1.0
JOB_DESC_EMBED_CHARS = 1500           # first ~1500 chars of the description


def band_for(score: int) -> str:
    """Map a 0-100 score to a band. MUST match lib/fit.ts exactly."""
    if score >= BAND_STRONG:
        return "Strong"
    if score >= BAND_GOOD:
        return "Good"
    if score >= BAND_STRETCH:
        return "Stretch"
    return "Low"


# --- embeddings --------------------------------------------------------------

_MODEL = None  # lazily-loaded singleton SentenceTransformer


def get_model():
    """Load (once) and return the MiniLM model. Import is lazy so importing this
    module (e.g. for the unit tests) doesn't pull in torch."""
    global _MODEL
    if _MODEL is None:
        from sentence_transformers import SentenceTransformer
        log.info("Loading embedding model %s ...", MODEL_NAME)
        _MODEL = SentenceTransformer(MODEL_NAME)
    return _MODEL


def embed_texts(texts: list[str]) -> np.ndarray:
    """Embed a batch of texts, L2-normalized (normalize_embeddings=True).

    Returns an (n, 384) float32 array. Empty input -> empty (0, 384) array.
    """
    if not texts:
        return np.zeros((0, EMBED_DIM), dtype=np.float32)
    model = get_model()
    vecs = model.encode(
        texts,
        normalize_embeddings=True,     # MANDATORY on both job + profile sides
        convert_to_numpy=True,
        show_progress_bar=False,
        batch_size=32,
    )
    return np.asarray(vecs, dtype=np.float32)


def embed_one(text: str) -> np.ndarray:
    """Embed a single text -> (384,) L2-normalized float32 vector."""
    out = embed_texts([text or ""])
    return out[0] if len(out) else np.zeros(EMBED_DIM, dtype=np.float32)


def vector_to_pg_literal(vec: np.ndarray) -> str:
    """pgvector text literal for supabase-py inserts: '[v1,v2,...]'."""
    return "[" + ",".join(f"{float(x):.6f}" for x in np.asarray(vec).ravel()) + "]"


def pg_literal_to_vector(literal: Any) -> Optional[np.ndarray]:
    """Parse a stored pgvector value (string '[..]' or list) back to ndarray."""
    if literal is None:
        return None
    if isinstance(literal, (list, tuple)):
        return np.asarray(literal, dtype=np.float32)
    if isinstance(literal, str):
        s = literal.strip().lstrip("[").rstrip("]")
        if not s:
            return None
        try:
            return np.asarray([float(x) for x in s.split(",")], dtype=np.float32)
        except ValueError:
            return None
    return None


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity. With L2-normalized inputs this equals the dot product;
    we still divide by norms defensively in case a stored vector wasn't normed."""
    a = np.asarray(a, dtype=np.float32).ravel()
    b = np.asarray(b, dtype=np.float32).ravel()
    na = float(np.linalg.norm(a))
    nb = float(np.linalg.norm(b))
    if na == 0.0 or nb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


# --- profile / skill model ---------------------------------------------------

@dataclass
class ProfileSkill:
    skill: str
    aliases: list[str]
    weight: float
    category: str

    @property
    def is_must_have(self) -> bool:
        return self.weight >= MUST_HAVE_THRESHOLD


@dataclass
class Profile:
    """The owner's skills profile, parsed from the ``skills_profile`` row."""

    skills: list[ProfileSkill] = field(default_factory=list)
    open_to_relocate: bool = True
    remote_only: bool = False
    resume_text: str = ""
    profile_hash: str = ""

    @classmethod
    def from_row(cls, row: dict[str, Any]) -> "Profile":
        skills_raw = row.get("skills") or []
        skills: list[ProfileSkill] = []
        for s in skills_raw:
            try:
                skills.append(
                    ProfileSkill(
                        skill=str(s.get("skill", "")).strip(),
                        aliases=[str(a).strip() for a in (s.get("aliases") or [])],
                        weight=float(s.get("weight", 0.5)),
                        category=str(s.get("category", "")),
                    )
                )
            except (TypeError, ValueError):
                continue
        return cls(
            skills=[s for s in skills if s.skill],
            open_to_relocate=bool(row.get("open_to_relocate", True)),
            remote_only=bool(row.get("remote_only", False)),
            resume_text=row.get("resume_text") or "",
            profile_hash=row.get("profile_hash") or "",
        )

    def skill_terms(self) -> list[tuple[ProfileSkill, list[str]]]:
        """For each skill, the lowercased match terms (skill name + aliases)."""
        out = []
        for s in self.skills:
            terms = [s.skill.lower()] + [a.lower() for a in s.aliases if a]
            out.append((s, terms))
        return out

    def profile_embed_text(self) -> str:
        """Text fed to the profile embedding: resume + a skill summary line."""
        skill_line = ", ".join(s.skill for s in self.skills)
        parts = [self.resume_text or "", "Skills: " + skill_line if skill_line else ""]
        return "\n".join(p for p in parts if p).strip() or "AI/ML software engineer"


# --- skill matching ----------------------------------------------------------

def _word_present(term: str, haystack: str) -> bool:
    """Whole-word/phrase presence test (alias-aware, punctuation tolerant)."""
    if not term:
        return False
    # Build a boundary-aware regex; allow '.', '+', '/', '-' inside the term.
    escaped = re.escape(term)
    # \b doesn't behave for terms ending in '+' (e.g. 'c++'); use lookarounds.
    pattern = r"(?<![a-z0-9])" + escaped + r"(?![a-z0-9])"
    try:
        return re.search(pattern, haystack) is not None
    except re.error:
        return term in haystack


def match_skills(profile: Profile, job_text: str) -> dict[str, Any]:
    """Alias-aware, weight-weighted skill matching against the job text.

    Returns:
      matched: list[(ProfileSkill, hit_term)] in profile order
      matched_must / matched_nice counts + coverage figures
      must_cov, nice_cov, skill_overlap (per §7), and the job's must-have count.
    """
    hay = (job_text or "").lower()

    matched: list[ProfileSkill] = []
    for skill, terms in profile.skill_terms():
        if any(_word_present(t, hay) for t in terms):
            matched.append(skill)

    must_haves = [s for s in profile.skills if s.is_must_have]
    nice_haves = [s for s in profile.skills if not s.is_must_have]

    matched_must = [s for s in matched if s.is_must_have]
    matched_nice = [s for s in matched if not s.is_must_have]

    sum_must_w = sum(s.weight for s in must_haves)
    matched_must_w = sum(s.weight for s in matched_must)
    must_cov = (matched_must_w / sum_must_w) if sum_must_w > 0 else 0.0
    nice_cov = (len(matched_nice) / len(nice_haves)) if nice_haves else 0.0

    if profile.skills:
        skill_overlap = 0.75 * must_cov + 0.25 * nice_cov
    else:
        # No parsed skills -> keyword overlap floored at 0.5 (spec §7).
        skill_overlap = 0.5

    return {
        "matched": matched,
        "matched_must": matched_must,
        "matched_nice": matched_nice,
        "must_cov": must_cov,
        "nice_cov": nice_cov,
        "skill_overlap": float(skill_overlap),
        "n_must_haves": len(must_haves),
    }


# --- component scores --------------------------------------------------------

def semantic_component(cos: float) -> float:
    """clamp((cos - 0.15)/(0.65 - 0.15), 0, 1)."""
    sem = (cos - SEM_LO) / (SEM_HI - SEM_LO)
    return float(min(1.0, max(0.0, sem)))


def experience_component(job_level: Optional[str], years_min: Optional[int]) -> float:
    """Job experience level -> score (spec §7).

    intern/new_grad/'1-3yr'(mid with low years) -> 1.0; '3-5yr' -> 0.55;
    senior -> 0.30; unknown -> 0.70. The DB enum has no '1-3yr'/'3-5yr', so we
    derive those bands from (level + years_min).
    """
    lvl = (job_level or "unknown").lower()
    if lvl in ("intern", "new_grad", "entry"):
        return 1.0
    if lvl == "senior" or lvl == "lead":
        return 0.30
    if lvl == "mid":
        # split mid into early (1-3yr) vs later (3-5yr) using years_min
        if years_min is not None and years_min >= 3:
            return 0.55
        return 1.0
    # unknown
    return 0.70


def location_component(
    work_type: str, is_remote: bool, country: Optional[str], profile: Profile
) -> tuple[float, bool, Optional[str]]:
    """Returns (score, is_us_onsite_outside_flag, gate_reason_or_None).

    remote -> 1.0; US onsite/hybrid -> 0.8 (drop to 0.4 if relocate off);
    onsite outside US / not authorized -> 0.0 (triggers the hard gate).
    """
    is_us = (country or "US").upper() in ("US", "USA", "UNITED STATES")
    if is_remote or work_type == "remote":
        return 1.0, False, None
    if is_us:
        if profile.open_to_relocate:
            return 0.8, False, None
        return 0.4, False, None
    # onsite/hybrid outside the US -> disqualifier
    return 0.0, True, "onsite_outside_us"


def recency_component(posted_at: Optional[str]) -> float:
    """<=3d -> 1.0, <=7d -> 0.8, <=14d -> 0.6, <=30d -> 0.4, else 0.2."""
    if not posted_at:
        return 0.4  # unknown age -> mild penalty
    dt = _parse_dt(posted_at)
    if dt is None:
        return 0.4
    age_days = (datetime.now(timezone.utc) - dt).total_seconds() / 86400.0
    if age_days <= 3:
        return 1.0
    if age_days <= 7:
        return 0.8
    if age_days <= 14:
        return 0.6
    if age_days <= 30:
        return 0.4
    return 0.2


def _parse_dt(value: str) -> Optional[datetime]:
    """Parse an ISO 8601 (possibly 'Z'-suffixed) timestamp to aware UTC."""
    if not value:
        return None
    s = value.strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        # try a couple of common fallbacks
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                dt = datetime.strptime(value[:19], fmt)
                break
            except ValueError:
                continue
        else:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# --- the scorer --------------------------------------------------------------

@dataclass
class FitResult:
    score: int
    band: str
    components: dict[str, float]
    matched_skills: list[str]
    missing_skills: list[str]
    rationale: str
    job_level: Optional[str]
    gated: bool
    gate_reason: Optional[str]
    must_cov: float


def score_job(
    profile: Profile,
    job: dict[str, Any],
    cos: float,
) -> FitResult:
    """Compute the full fit result for one job given its cosine to the profile.

    ``job`` is a dict with at least: title, description, experience_level,
    years_min, work_type, is_remote, country, posted_at, tags.
    ``cos`` is cosine(profile_vec, job_vec) (both L2-normalized).
    """
    title = job.get("title") or ""
    description = job.get("description") or ""
    tags = job.get("tags") or []
    job_text = "\n".join([title, " ".join(tags), description])

    sem = semantic_component(cos)

    sk = match_skills(profile, job_text)
    skill_overlap = sk["skill_overlap"]
    must_cov = sk["must_cov"]

    job_level = job.get("experience_level") or "unknown"
    years_min = job.get("years_min")
    exp = experience_component(job_level, years_min)

    loc, onsite_outside_us, loc_gate = location_component(
        job.get("work_type") or "unknown",
        bool(job.get("is_remote")),
        job.get("country"),
        profile,
    )

    rec = recency_component(job.get("posted_at"))

    fit_raw = (
        W_SEMANTIC * sem
        + W_SKILL * skill_overlap
        + W_EXPERIENCE * exp
        + W_LOCATION * loc
        + W_RECENCY * rec
    )
    score = int(round(100 * fit_raw))

    # --- hard gates (applied AFTER the sum) ---
    gated = False
    gate_reason: Optional[str] = None

    if onsite_outside_us:
        score = min(score, 20)
        gated = True
        gate_reason = "onsite_outside_us"

    # zero must-have coverage AND the job lists >=3 of the owner's must-haves.
    # We approximate "job listed >=3 must-haves" by the profile must-have count;
    # the cap only bites when the owner actually has >=3 must-have skills and
    # none were matched.
    if must_cov == 0 and sk["n_must_haves"] >= 3:
        if score > 45:
            score = 45
        gated = True
        gate_reason = gate_reason or "zero_must_have"

    if (job_level or "").lower() in ("senior", "lead"):
        if score > 74:
            score = 74
        gated = True
        gate_reason = gate_reason or "senior_cap"

    score = max(0, min(100, score))
    band = band_for(score)

    matched_names, missing_names = _matched_missing(profile, sk)
    rationale = build_rationale(
        score, band, sk, exp, loc, job_level, matched_names, bool(job.get("is_remote"))
    )

    components = {
        "semantic_sim": round(sem, 4),
        "skill_overlap": round(skill_overlap, 4),
        "experience_match": round(exp, 4),
        "location_worktype": round(loc, 4),
        "recency": round(rec, 4),
        "must_cov": round(must_cov, 4),
        "nice_cov": round(sk["nice_cov"], 4),
        "fit_raw": round(fit_raw, 4),
    }

    return FitResult(
        score=score,
        band=band,
        components=components,
        matched_skills=matched_names,
        missing_skills=missing_names,
        rationale=rationale,
        job_level=job_level,
        gated=gated,
        gate_reason=gate_reason,
        must_cov=must_cov,
    )


def _matched_missing(profile: Profile, sk: dict[str, Any]) -> tuple[list[str], list[str]]:
    """matched_skills (weight-desc, must-have-first, cap 8) +
    missing_skills (absent, must-have-first, cap 6)."""
    matched_set = {s.skill for s in sk["matched"]}

    def sort_key(s: ProfileSkill):
        return (-(1 if s.is_must_have else 0), -s.weight, s.skill.lower())

    matched_sorted = sorted(sk["matched"], key=sort_key)
    matched_names = [s.skill for s in matched_sorted][:8]

    missing = [s for s in profile.skills if s.skill not in matched_set]
    missing_sorted = sorted(missing, key=sort_key)
    missing_names = [s.skill for s in missing_sorted][:6]

    return matched_names, missing_names


def build_rationale(
    score: int,
    band: str,
    sk: dict[str, Any],
    exp: float,
    loc: float,
    job_level: Optional[str],
    matched_names: list[str],
    is_remote: bool,
) -> str:
    """Deterministic templated rationale (spec §7). All slots from numbers/lists."""
    n_matched_must = len(sk["matched_must"])
    n_must = sk["n_must_haves"]

    lead = {
        "Strong": "Strong fit",
        "Good": "Good fit",
        "Stretch": "Stretch — a reach but possible",
        "Low": "Low fit",
    }.get(band, "Fit")

    parts = [f"{lead} ({score}/100)."]

    if n_must > 0:
        top = ", ".join(matched_names[:3]) if matched_names else "none yet"
        parts.append(
            f"{n_matched_must} of {n_must} core skills match"
            + (f" including {top}." if matched_names else ".")
        )
    elif matched_names:
        parts.append("Matches " + ", ".join(matched_names[:3]) + ".")

    if exp >= 1.0:
        parts.append("Experience level lines up (early-career).")
    elif exp <= 0.30:
        parts.append("Skews senior — a reach for an early-career profile.")
    elif exp <= 0.55:
        parts.append("Slightly above early-career experience.")

    if loc >= 1.0:
        parts.append("Remote-friendly.")
    elif loc == 0.0:
        parts.append("On-site outside the US — likely not viable.")
    elif loc >= 0.8:
        parts.append("US-based on-site/hybrid (open to relocation).")
    elif loc >= 0.4:
        parts.append("US on-site/hybrid (relocation off).")

    return " ".join(parts)


# --- optional Claude Haiku rationale (OFF by default) ------------------------

def maybe_llm_rationale(
    api_key: str,
    fit: FitResult,
    job_title: str,
) -> Optional[str]:
    """Rewrite the rationale for one job via claude-haiku-4-5.

    Input is the STRUCTURED breakdown ONLY (score/band/matched/missing/title) —
    never the resume or full JD (spec §7). Returns the rewritten prose, or None
    on any error (caller silently falls back to the deterministic template).
    """
    try:
        import anthropic
    except Exception as exc:
        log.warning("anthropic SDK unavailable, skipping LLM rationale: %s", exc)
        return None

    try:
        client = anthropic.Anthropic(api_key=api_key)
        breakdown = (
            f"Job title: {job_title}\n"
            f"Fit score: {fit.score}/100 (band {fit.band})\n"
            f"Matched skills: {', '.join(fit.matched_skills) or 'none'}\n"
            f"Missing skills: {', '.join(fit.missing_skills) or 'none'}\n"
            f"Components: {fit.components}\n"
        )
        msg = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=160,
            system=(
                "You write a crisp 1-2 sentence job-fit rationale for an "
                "early-career AI/ML engineer. Use only the structured breakdown "
                "provided. Be concrete and honest about gaps. No preamble."
            ),
            messages=[{"role": "user", "content": breakdown}],
        )
        text = "".join(
            block.text for block in msg.content if getattr(block, "type", None) == "text"
        ).strip()
        return text or None
    except Exception as exc:  # no credits, rate limit, network — silent fallback
        log.warning("LLM rationale failed (falling back to template): %s", exc)
        return None


def job_embed_text(title: str, description: str, skill_lines: str = "") -> str:
    """Text used to embed a job: title + first ~1500 chars of desc + skill lines."""
    desc = (description or "")[:JOB_DESC_EMBED_CHARS]
    parts = [title or ""]
    if skill_lines:
        parts.append(skill_lines)
    parts.append(desc)
    return "\n".join(p for p in parts if p).strip() or (title or "job")
