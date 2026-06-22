# JobRadar

A private, single-owner, LinkedIn-style job board for one early-career AI/ML engineer. It scrapes **free** job APIs + company ATS boards once daily, normalizes and de-duplicates listings into Supabase Postgres, computes a **$0** local-embedding "fit score + rationale" against your editable skills profile, and serves a fast three-pane dashboard (filter rail / job list / detail) with saved jobs, an application-status tracker, and a link out to your portfolio.

Designed to run entirely inside free tiers: **Vercel Hobby** (UI), **Supabase free** (Postgres/Auth/pgvector), **GitHub Actions free minutes** (the daily Python scraper), and free API tiers. No paid call sits on any critical path.

---

## Architecture

```
┌────────────────────┐     reads (RLS, owner)      ┌──────────────────────┐
│  Next.js 15 (Vercel)│ ──────────────────────────▶ │  Supabase Postgres   │
│  App Router + RSC   │ ◀────────────────────────── │  (jobs, fit, saved,  │
│  three-pane UI      │     access-code gate        │   applications, runs)│
└─────────┬──────────┘                              └──────────▲───────────┘
          │ POST /api/refresh                                  │ upserts
          │ (repository_dispatch)                              │ (service role)
          ▼                                                    │
┌────────────────────────────────────────────────────┐        │
│  GitHub Actions cron (Python)                       │ ───────┘
│  scrape → normalize → dedupe → embed → fit-score    │
│  daily 05:45–06:55 ET (two-cron DST guard)          │
└────────────────────────────────────────────────────┘
```

The Next.js app **only ever reads** precomputed data — no scraping, embedding, or LLM inference happens in a Vercel function. All heavy work lives in the GitHub Action.

```
app/                Next.js App Router
  (app)/            code-gated dashboard (feed, jobs, saved, tracker, skills, settings)
  api/              route handlers (jobs, saved, applications, profile, refresh, runs, gate)
  auth/             signout (clears the access cookie)
  login/            the access-code gate page
components/         UI (app shell, feed, tracker, skills, ui primitives)
lib/                shared contracts: types, fit, filters, utils, time, supabase clients
scraper/            Python: the daily ingest + fit-scoring job (NOT built by Vercel)
supabase/           migrations (0001 schema, 0002 search RPC) + seed
.github/workflows/  scrape.yml (the daily cron)
```

---

## Setup runbook

> Times are **America/New_York (Eastern)**. Everything below stays on free tiers.

1. **Install + scaffold locally**
   ```bash
   npm install
   cp .env.example .env.local   # fill in as you create resources below
   ```

2. **Create a Supabase project** (free, region near US East — e.g. `us-east-1`). Save the DB password; copy the Project URL, `anon` key, and `service_role` key.

3. **Apply the schema** in the Supabase SQL Editor, in order:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_search_rpc.sql`
   Then run the **sources** block of `supabase/seed.sql` (leave the `skills_profile` insert for step 10).

4. **Get free API creds:** an Adzuna `app_id` + `app_key` from <https://developer.adzuna.com>. (The Muse / Remotive / RemoteOK / Greenhouse / Lever / Ashby need no key.)

5. **Build the scraper** — already in `scraper/`. Curate `scraper/companies.yml` (the ATS board tokens) to companies you care about; it ships with known-good public ones so the first run isn't empty.

6. **Push to GitHub** (private repo recommended — keeps `companies.yml` + logs private; the free 2,000 Actions min/mo applies to private repos).

7. **Add GitHub Actions secrets** (Repo → Settings → Secrets and variables → Actions):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`. Optional: secret `ANTHROPIC_API_KEY` + variable `USE_LLM_RATIONALE=true` (leave unset for the $0 default).

8. **Smoke-test the scraper:** Actions → `daily-scrape` → Run workflow. Confirm `jobs`, `scrape_runs`, and `job_fit` populate and that a dead ATS token logs-and-skips. Fix any source errors before wiring the UI.

9. **Run the app:** `npm run dev` → <http://localhost:3000>. You'll hit the access-code gate; enter `ACCESS_CODE` (default `280902`) to get in.

10. **Create the data-owner user + seed the profile:** the access code is how you log in, but the data still needs an owner uuid that exists in `auth.users` (foreign keys). Supabase → Authentication → **Add user** (any email; you never log in with it), copy its UUID into `OWNER_USER_ID` (Vercel **and** GitHub secrets). In `supabase/seed.sql`, replace the placeholder UUID in the `skills_profile` insert with that UUID and run it (the `default auth.uid()` is NULL in the SQL Editor, so `owner_id` MUST be passed explicitly).

11. **Deploy to Vercel:** import the repo, add the env vars below (including `ACCESS_CODE` + `GATE_SECRET`), deploy, note the prod URL. (`.vercelignore` keeps `scraper/`, `supabase/`, `.github/` out of the build.)

12. **Unlock it:** open the prod URL → the gate appears → enter your `ACCESS_CODE`. No Supabase email/redirect template needed — the code is the only login. (Change the code any time by updating `ACCESS_CODE` and redeploying.)

13. **Wire the Refresh button:** create a fine-grained PAT (`GH_DISPATCH_TOKEN`) scoped to this repo with **Actions: read/write**, set `GH_DISPATCH_TOKEN` + `GH_REPO=you/jobradar` in Vercel, redeploy. Click **Refresh** → a new Action run should trigger and the daily manual-refresh counter (10/day) should tick down.

14. **Confirm the daily cron** lands the next morning in the 05:45–06:55 ET window; the "synced HH:MM ET" strip reflects it, and a guarded/skip day still writes a `scrape_runs` heartbeat (so Supabase never auto-pauses).

15. *(Optional, NOT $0)* set `ANTHROPIC_API_KEY` + `USE_LLM_RATIONALE=true` for nicer Claude-Haiku rationales on the top ~15 jobs/day (~$0.42/mo).

---

## Environment variables

| Where | Vars |
|---|---|
| **Vercel Project Env** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), `ACCESS_CODE`, `GATE_SECRET`, `OWNER_USER_ID`, `GH_DISPATCH_TOKEN`, `GH_REPO`, `NEXT_PUBLIC_PORTFOLIO_URL` |
| **GitHub Actions secrets** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, *(opt)* `ANTHROPIC_API_KEY` + var `USE_LLM_RATIONALE` |

`SUPABASE_SERVICE_ROLE_KEY` is server-only — never `NEXT_PUBLIC_`-prefixed, never imported into a client component.

---

## Commands

```bash
npm run dev         # local dev server
npm run build       # production build (also a full type-check)
npm run typecheck   # tsc --noEmit
```

Scraper (from repo root, with the GitHub-Actions env vars set locally):
```bash
pip install -r scraper/requirements.txt
SCRAPE_TRIGGER=dispatch python -m scraper.main   # 'dispatch' skips the time-guard
```

---

## Implementation notes / intentional deviations from the spec

- **Feed lives at `/`** (inside the `(app)` route group) rather than a separate `app/page.tsx` redirect — Next route groups don't change the URL, so a root `page.tsx` + `(app)/page.tsx` would both resolve to `/` and conflict. Unauthenticated users hitting `/` are redirected to `/login` by middleware + the `(app)` layout guard.
- **`GET /api/jobs` is backed by the `search_jobs` Postgres function** (`0002_search_rpc.sql`) because sort-by-fit needs the jobs↔job_fit join at the DB layer. It returns each row as the client `JobWithFit` shape plus a window `total`, and runs with the caller's RLS (not `security definer`).
- **Server-action twins were folded into the API routes** — the UI mutates via `fetch` to `/api/*`, so a parallel `app/actions/*` layer would be dead code.
- **`embedding` / `raw` columns are never sent to the client** (stripped in the RPC and via `JOB_PUBLIC_COLUMNS`).

## Do NOT

- No LinkedIn/Indeed (or any anti-bot/ToS-protected) HTML scraping — aggregator APIs + public ATS JSON only.
- No paid call on a critical path — the LLM rationale stays OFF by default.
- No scraping/embedding/fit-scoring in Vercel functions, and no Vercel Cron for the scrape — heavy work lives in GitHub Actions.
- No public exposure of saved/tracker/fit/resume data — single owner only. The server-side access-code gate (signed http-only cookie) is the boundary; data is only served when a valid gate cookie is present, and the code is never shipped to the browser.
- No `SUPABASE_SERVICE_ROLE_KEY` in the browser; never `NEXT_PUBLIC_`-prefix it.
