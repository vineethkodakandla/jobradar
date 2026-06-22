# JobRadar scraper

The Python half of JobRadar. Once a day (GitHub Actions cron) it scrapes free
job APIs + public ATS boards, normalizes/de-dupes into Supabase Postgres, and
computes a $0 local-embedding fit score against the owner's skills profile. The
Next.js app only ever *reads* the precomputed data.

## What it does

1. Writes a `scrape_runs` heartbeat row first (keep-alive — prevents Supabase's
   7-day auto-pause). **Every** invocation writes one, even a guarded skip.
2. DST guard: real work runs only in **05:45–06:55 America/New_York** (manual /
   dispatch triggers skip the window). Also skips the body if a `success` run
   already exists for today (ET).
3. Fetches each source (Adzuna, The Muse, Remotive, RemoteOK, Greenhouse, Lever,
   Ashby), normalizes, and upserts `ON CONFLICT (source_id, external_id)`.
   Per-source failures are isolated; a dead ATS token logs a warning and is
   skipped.
4. Deactivates stale rows for **succeeded** sources only; hard-deletes jobs
   inactive > 30 days.
5. Embeds the profile (when changed/missing) + new jobs, scores fit (§7), and
   upserts `job_fit`. A profile change re-scores all active jobs via stored
   vectors (numpy cosine, no job re-embedding).

## Run locally

From the **repo root** (`jobradar/`):

```bash
pip install -r scraper/requirements.txt

# Required
export SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"   # server-only, NEVER in the browser
export OWNER_USER_ID="<owner-auth-uuid>"

# Adzuna (optional — missing keys just skips Adzuna with a warning)
export ADZUNA_APP_ID="<id>"
export ADZUNA_APP_KEY="<key>"

# Force a run outside the 05:45–06:55 ET window (skips the time guard):
export SCRAPE_TRIGGER="manual"

# Optional Claude Haiku rationale (OFF by default; not $0 when on):
# export ANTHROPIC_API_KEY="sk-ant-..."
# export USE_LLM_RATIONALE="true"

python -m scraper.main
# also works as:  python scraper/main.py
```

### Triggers (`SCRAPE_TRIGGER`)

| value      | window check | notes                                   |
|------------|--------------|-----------------------------------------|
| `cron`     | enforced     | default; the daily GitHub cron          |
| `manual`   | skipped      | always runs (workflow_dispatch)         |
| `dispatch` | skipped      | always runs (repository_dispatch)       |

## Environment variables

| var | required | purpose |
|---|---|---|
| `SUPABASE_URL` | yes (hard error if missing) | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes (hard error) | service-role key (bypasses RLS) |
| `OWNER_USER_ID` | yes (hard error) | stamps `job_fit.owner_id`, reads/writes `skills_profile` |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | no | missing → Adzuna skipped with a warning |
| `ANTHROPIC_API_KEY` | no | only used when `USE_LLM_RATIONALE=true` |
| `USE_LLM_RATIONALE` | no (default `false`) | enables Claude Haiku rationale (top ~15 jobs) |
| `SCRAPE_TRIGGER` | no (default `cron`) | `manual`/`dispatch` skip the time-window guard |

## Adding ATS boards

ATS boards are per-company. Edit `companies.yml` — a dict keyed by ATS kind
(`greenhouse` / `lever` / `ashby`) → list of board tokens/handles. Find a token
by opening a company's careers page → DevTools → Network → the XHR to
`boards-api.greenhouse.io` / `api.lever.co` / `api.ashbyhq.com`, and copy the
URL segment. A stale token is harmless (logged + skipped).

## Tests

Pure-function unit tests for salary / experience / dedupe / HTML parsing (no
network, no DB):

```bash
pytest scraper/tests/test_normalize.py
```

## Byte-compile check

```bash
python -m py_compile scraper/*.py scraper/sources/*.py scraper/sources/ats/*.py
```

## Notes / contract

- Band cutoffs (must match `lib/fit.ts`): **Strong ≥ 78 · Good 62–77 ·
  Stretch 45–61 · Low < 45**.
- Embeddings: `sentence-transformers/all-MiniLM-L6-v2` (384-dim),
  `normalize_embeddings=True` on both the job and profile sides.
- pgvector values are stored as the literal `'[v1,v2,...]'`.
- Upserts match the exact `jobs` / `job_fit` / `scrape_runs` / `skills_profile`
  columns in `supabase/migrations/0001_init.sql`.
```
