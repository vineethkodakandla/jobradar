-- ============================================================================
-- JobRadar initial schema. Run in the Supabase SQL Editor (or `supabase db push`).
-- ============================================================================

-- Extensions
create extension if not exists pgcrypto;
create extension if not exists vector;
create extension if not exists pg_trgm;

-- Enums
create type experience_level as enum ('intern','new_grad','entry','mid','senior','lead','unknown');
create type work_type        as enum ('remote','hybrid','onsite','unknown');
create type app_status       as enum ('saved','applied','phone_screen','interview','offer','rejected','withdrawn','ghosted');
create type run_status       as enum ('running','success','partial','failed','skipped');

-- SOURCES
create table sources (
  id            bigint generated always as identity primary key,
  slug          text not null unique,
  kind          text not null,                     -- 'aggregator' | 'ats'
  display_name  text not null,
  base_url      text,
  enabled       boolean not null default true,
  last_run_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- JOBS (written ONLY by scraper/service role)
create table jobs (
  id                bigint generated always as identity primary key,
  source_id         bigint not null references sources(id),
  external_id       text not null,
  dedupe_hash       text not null,
  title             text not null,
  company           text,
  description       text,
  apply_url         text not null,
  location_raw      text,
  city              text,
  state             text,
  country           text default 'US',
  is_remote         boolean not null default false,
  work_type         work_type not null default 'unknown',
  salary_min        integer,
  salary_max        integer,
  salary_currency   text default 'USD',
  salary_period     text,
  salary_is_estimated boolean not null default false,
  experience_level  experience_level not null default 'unknown',
  years_min         smallint,
  years_max         smallint,
  tags              text[] default '{}',
  posted_at         timestamptz,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  is_active         boolean not null default true,
  embedding         vector(384),
  raw               jsonb,
  constraint jobs_source_external_uq unique (source_id, external_id)
);

-- SKILLS_PROFILE (one row, single owner)
create table skills_profile (
  owner_id          uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  headline          text,
  summary           text,
  skills            jsonb not null default '[]',    -- [{skill,aliases[],weight,category}]
  target_roles      text[] not null default '{}',
  experience_level  experience_level not null default 'entry',
  years_experience  numeric(3,1) default 1.0,
  open_to_relocate  boolean not null default true,
  remote_only       boolean not null default false,
  preferred_locations text[] default '{}',
  min_salary        integer,
  resume_text       text,
  profile_hash      text,
  embedding         vector(384),
  updated_at        timestamptz not null default now()
);

-- SAVED_JOBS
create table saved_jobs (
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id     bigint not null references jobs(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  primary key (owner_id, job_id)
);

-- APPLICATIONS
create table applications (
  id             bigint generated always as identity primary key,
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id         bigint not null references jobs(id) on delete cascade,
  status         app_status not null default 'saved',
  applied_at     timestamptz,
  next_action    text,
  next_action_at timestamptz,
  notes          text,
  position       real,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, job_id)
);

-- JOB_FIT (computed by cron; keyed owner+job+profile_hash)
create table job_fit (
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  job_id        bigint not null references jobs(id) on delete cascade,
  profile_hash  text not null,
  score         smallint not null,                  -- 0..100
  band          text not null,                      -- Strong|Good|Stretch|Low
  rationale     text,
  rationale_llm text,
  matched_skills   text[] default '{}',
  missing_skills   text[] default '{}',
  components    jsonb,
  job_level     experience_level,
  gated         boolean not null default false,
  gate_reason   text,
  model         text not null default 'all-MiniLM-L6-v2',
  scored_at     timestamptz not null default now(),
  primary key (owner_id, job_id)
);

-- SCRAPE_RUNS (observability + idempotency + "last updated" + keep-alive heartbeat)
create table scrape_runs (
  id            bigint generated always as identity primary key,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        run_status not null default 'running',
  trigger       text not null default 'cron',
  jobs_seen     integer default 0,
  jobs_upserted integer default 0,
  jobs_deactivated integer default 0,
  fits_scored   integer default 0,
  adzuna_calls  integer default 0,
  per_source    jsonb,
  error_text    text
);

-- INDEXES
create index jobs_active_posted_idx on jobs (is_active, posted_at desc);
create index jobs_explevel_idx      on jobs (experience_level) where is_active;
create index jobs_worktype_idx      on jobs (work_type)        where is_active;
create index jobs_remote_idx        on jobs (is_remote)        where is_active;
create index jobs_state_idx         on jobs (state)            where is_active;
create index jobs_salary_idx        on jobs (salary_min, salary_max);
create index jobs_dedupe_idx        on jobs (dedupe_hash);
create index jobs_tags_gin          on jobs using gin (tags);
create index jobs_fts_gin           on jobs using gin (to_tsvector('english', coalesce(title,'')||' '||coalesce(description,'')));
create index jobs_trgm_idx          on jobs using gin ((coalesce(company,'')||' '||title) gin_trgm_ops);
-- NOTE: no ivfflat index on jobs.embedding. The fit re-score does a full
-- `1 - (embedding <=> :profile_vec)` pass over all active jobs (a full scan,
-- not a KNN ORDER BY), so ivfflat buys nothing and just costs build memory on
-- the free tier. Add an ivfflat/hnsw index only if/when a KNN ORDER BY query
-- is introduced, tuned to lists ~ sqrt(rows).
create index applications_owner_idx on applications (owner_id, status);
create index job_fit_owner_score_idx on job_fit (owner_id, score desc);

-- updated_at trigger
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger applications_touch before update on applications
  for each row execute function touch_updated_at();

-- RLS
alter table sources        enable row level security;
alter table jobs           enable row level security;
alter table skills_profile enable row level security;
alter table saved_jobs     enable row level security;
alter table applications   enable row level security;
alter table job_fit        enable row level security;
alter table scrape_runs    enable row level security;

create policy jobs_read    on jobs        for select to authenticated using (true);
create policy sources_read on sources     for select to authenticated using (true);
create policy runs_read    on scrape_runs for select to authenticated using (true);

create policy profile_owner on skills_profile for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy saved_owner   on saved_jobs    for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy apps_owner    on applications  for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy fit_owner     on job_fit       for all to authenticated
  using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- The service-role key (used by the scraper) bypasses RLS, so jobs / job_fit /
-- scrape_runs are written with no INSERT policy needed. job_fit.owner_id is
-- stamped explicitly with OWNER_USER_ID (service role has no auth.uid()).
