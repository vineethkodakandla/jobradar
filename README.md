<div align="center">

# 🛰️ JobRadar

**A private, AI-scored job board that scrapes the open web hourly and ranks every role against your résumé — built to run entirely on free tiers.**

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20pgvector-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![GitHub Actions](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)](.github/workflows/scrape.yml)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?logo=vercel)](https://vercel.com)

</div>

---

LinkedIn shows you everyone's jobs. **JobRadar shows you *yours*** — it pulls fresh postings from job APIs and company career boards every hour, computes a 0–100 **fit score + rationale** for each one against an editable skills profile using local sentence embeddings, and serves it all through a fast three-pane dashboard with saved jobs and an application tracker. No LLM API bill, no paid infrastructure — the whole pipeline lives inside Vercel Hobby + Supabase free + GitHub Actions.

<!-- Add a screenshot at docs/screenshot.png and uncomment the line below:
![JobRadar dashboard](docs/screenshot.png)
-->
> 📸 _Add `docs/screenshot.png` (the three-pane dashboard) to show it off here._

## ✨ Features

- **Hourly multi-source ingestion** — aggregator APIs (Adzuna, The Muse, Remotive, RemoteOK) **+** company ATS boards (Greenhouse, Lever, Ashby). No LinkedIn/Indeed scraping — public JSON only.
- **$0 semantic fit scoring** — a local `all-MiniLM-L6-v2` embedding of your résumé is cosine-matched against every job, blended with skill-overlap, experience-level, location, and recency signals into one 0–100 score with a plain-English rationale. No paid LLM on any critical path.
- **Smart, rate-aware scheduling** — ATS boards refresh every hour (where roles post first); rate-sensitive sources throttle to 4×/day; Adzuna's monthly free cap is enforced in code.
- **Three-pane dashboard** — filter rail / virtualized job list / detail pane, with URL-synced filters (role, experience, US location, work type, salary, fit threshold), an editable skills profile that re-scores on save, saved jobs, and a drag-and-drop application tracker.
- **Single-owner by design** — a server-side access-code gate (signed http-only cookie; the code never reaches the browser) + Postgres Row-Level Security. Your saved jobs and notes are never public.
- **Free-tier native** — the web app *only reads* precomputed data; all scraping, embedding, and scoring happen in a GitHub Actions cron, so Vercel functions stay fast and free.

## 🧠 How the fit score works

Each job is compared to your profile across five weighted signals (all computed locally, no LLM):

| Signal | Weight | Measures |
|---|---:|---|
| Semantic match | 35% | cosine(résumé embedding, job embedding) via MiniLM, rescaled |
| Skill overlap | 30% | alias-aware, weight-weighted match of your skills vs. the job |
| Experience match | 20% | intern/new-grad → 1.0 · mid → 0.55–1.0 · senior → 0.30 |
| Location / work-type | 10% | remote → 1.0 · US on-site/hybrid → 0.8 · on-site abroad → 0.0 |
| Recency | 5% | ≤3d → 1.0 … >30d → 0.2 |

```
fit = 100 × (0.35·semantic + 0.30·skills + 0.20·experience + 0.10·location + 0.05·recency)
```

Hard caps then apply for dealbreakers (on-site outside the US → ≤20; zero must-have skills → ≤45; senior role → ≤74). Bands: **Strong ≥78 · Good 62–77 · Stretch 45–61 · Low <45**. The exact band cutoffs live in one place (`lib/fit.ts`) shared by the UI and the Python scorer.

## 🏗️ Architecture

```
┌─────────────────────┐     reads (RLS + code gate)   ┌──────────────────────┐
│  Next.js 15 (Vercel) │ ────────────────────────────▶ │  Supabase Postgres   │
│  App Router · RSC    │ ◀──────────────────────────── │  jobs · job_fit ·    │
│  3-pane dashboard    │                               │  saved · apps · runs │
└──────────┬──────────┘                               │  (pgvector)          │
           │ POST /api/refresh                         └──────────▲───────────┘
           │ (repository_dispatch)                                │ upserts
           ▼                                                      │ (service role)
┌──────────────────────────────────────────────────────┐         │
│  GitHub Actions cron (Python) — HOURLY                │ ────────┘
│  scrape → normalize → dedupe → embed → fit-score      │
└──────────────────────────────────────────────────────┘
```

The two halves share **only** the Postgres schema — no runtime coupling. The web app never scrapes, embeds, or runs inference; the scraper never renders UI.

## 🧰 Tech stack

**Frontend** Next.js 15 (App Router, RSC, Server Actions) · TypeScript · Tailwind v4 · TanStack Query · nuqs (URL state) · dnd-kit · `@tanstack/react-virtual`
**Backend / data** Supabase (Postgres + Auth + **pgvector**) · Row-Level Security · a `search_jobs` SQL function for filtered, fit-sorted, paginated reads
**Scraper / ML** Python 3.12 · `sentence-transformers` (MiniLM, 384-dim) · `requests`/`beautifulsoup4` · `supabase-py`
**Infra** Vercel (web) · GitHub Actions (hourly cron, free unlimited minutes on a public repo)

## 📁 Project structure

```
app/
  (app)/            code-gated dashboard (feed, jobs, saved, tracker, skills, settings)
  api/              route handlers (jobs, saved, applications, profile, refresh, runs, gate)
  login/  auth/     access-code gate + signout
components/         UI — app shell, feed, tracker, skills, ui primitives
lib/                shared contracts: types, fit (band cutoffs), filters, supabase clients
scraper/            Python pipeline: sources/ · normalize · fit · db · main
supabase/           migrations (0001 schema, 0002 search RPC) + seed
.github/workflows/  scrape.yml (the hourly cron)
```

## 🚀 Run it yourself

> Single-user tool. Everything below stays on free tiers.

1. **Install:** `npm install` then `cp .env.example .env.local`.
2. **Supabase:** create a free project; run `supabase/migrations/0001_init.sql` + `0002_search_rpc.sql` + the `sources` block of `supabase/seed.sql` in the SQL Editor.
3. **API keys:** grab a free Adzuna `app_id` + `app_key` (the other sources need no key). Curate `scraper/companies.yml` with the ATS board tokens you care about.
4. **Owner + profile:** add a Supabase auth user (any email — you never log in with it), put its UUID in `OWNER_USER_ID`, and run the `skills_profile` seed with that UUID.
5. **Scraper CI:** push to GitHub, add the Actions secrets (below), and run the `daily-scrape` workflow once to populate data. A **public** repo gets unlimited Actions minutes (secrets stay encrypted).
6. **Deploy:** import to Vercel, add the env vars (below) including `ACCESS_CODE` + `GATE_SECRET`, deploy. Open the URL, enter your code, done.
7. **Refresh button** (optional): set `GH_DISPATCH_TOKEN` (a repo-scoped PAT with Actions r/w) + `GH_REPO` in Vercel to enable on-demand scrapes (up to 24/day).

```bash
npm run dev        # local web app
npm run build      # production build (full type-check)
SCRAPE_TRIGGER=dispatch python -m scraper.main   # run the scraper locally
```

### Environment variables

| Where | Vars |
|---|---|
| **Vercel** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ACCESS_CODE`, `GATE_SECRET`, `OWNER_USER_ID`, `GH_DISPATCH_TOKEN`, `GH_REPO`, `NEXT_PUBLIC_PORTFOLIO_URL` |
| **GitHub Actions** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`, `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |

`SUPABASE_SERVICE_ROLE_KEY` is server-only — never `NEXT_PUBLIC_`-prefixed.

## 🧩 Notable engineering decisions

- **All heavy compute is offloaded to CI.** Vercel functions can't load a transformer within their duration cap, so embedding + scoring run in the GitHub Action and the web app only reads precomputed rows — keeping requests fast and free.
- **Fit-sorted pagination needs a join,** so `GET /api/jobs` is backed by a single `search_jobs` Postgres function that joins jobs↔fit↔saved↔application for the owner, applies every filter, sorts, paginates, and returns a window count — running under the caller's RLS.
- **Hourly without rate-limit pain:** a `run_courtesy` gate runs the tolerant ATS boards every hour but throttles the courtesy endpoints (and Adzuna's monthly-capped API) to 4×/day.
- **Robust ingestion:** entity-escaped HTML is unescaped before stripping, salaries are normalized to annual USD, a heuristic US-only filter handles edge cases (e.g. `"Toronto, ON, CA"` ≠ California), and a dedupe hash collapses cross-source duplicates.

---

<div align="center">
<sub>Personal project · built to make an early-career AI/ML job hunt less of a slog.</sub>
</div>
