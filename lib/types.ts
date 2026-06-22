// ============================================================================
// Shared domain + API contract types. The single source of truth that the
// Next.js backend (API routes / server actions) and the React UI both import.
// Mirrors the Postgres schema in supabase/migrations/0001_init.sql.
// ============================================================================

export type ExperienceLevel =
  | "intern"
  | "new_grad"
  | "entry"
  | "mid"
  | "senior"
  | "lead"
  | "unknown";

export type WorkType = "remote" | "hybrid" | "onsite" | "unknown";

export type AppStatus =
  | "saved"
  | "applied"
  | "phone_screen"
  | "interview"
  | "offer"
  | "rejected"
  | "withdrawn"
  | "ghosted";

export type RunStatus = "running" | "success" | "partial" | "failed" | "skipped";

export type FitBand = "Strong" | "Good" | "Stretch" | "Low";

export interface Source {
  id: number;
  slug: string;
  kind: "aggregator" | "ats";
  display_name: string;
  base_url: string | null;
  enabled: boolean;
  last_run_at: string | null;
  created_at: string;
}

/** A normalized job posting (jobs table). `embedding` + `raw` are not sent to the client. */
export interface Job {
  id: number;
  source_id: number;
  external_id: string;
  dedupe_hash: string;
  title: string;
  company: string | null;
  description: string | null;
  apply_url: string;
  location_raw: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  is_remote: boolean;
  work_type: WorkType;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  salary_is_estimated: boolean;
  experience_level: ExperienceLevel;
  years_min: number | null;
  years_max: number | null;
  tags: string[];
  posted_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  is_active: boolean;
}

export interface JobFitComponents {
  semantic_sim: number;
  skill_overlap: number;
  experience_match: number;
  location_worktype: number;
  recency: number;
  must_cov: number;
  nice_cov: number;
  fit_raw: number;
}

export interface JobFit {
  owner_id: string;
  job_id: number;
  profile_hash: string;
  score: number; // 0..100
  band: FitBand;
  rationale: string | null;
  rationale_llm: string | null;
  matched_skills: string[];
  missing_skills: string[];
  components: JobFitComponents | null;
  job_level: ExperienceLevel | null;
  gated: boolean;
  gate_reason: string | null;
  model: string;
  scored_at: string;
}

/** The shape returned by GET /api/jobs items and GET /api/jobs/[id]. */
export interface JobWithFit extends Job {
  source_slug: string | null;
  source_name: string | null;
  fit: JobFit | null;
  is_saved: boolean;
  application_status: AppStatus | null;
}

export interface ProfileSkill {
  skill: string;
  aliases: string[];
  weight: number; // 0..1
  category: string;
}

export interface SkillsProfile {
  owner_id: string;
  headline: string | null;
  summary: string | null;
  skills: ProfileSkill[];
  target_roles: string[];
  experience_level: ExperienceLevel;
  years_experience: number | null;
  open_to_relocate: boolean;
  remote_only: boolean;
  preferred_locations: string[];
  min_salary: number | null;
  resume_text: string | null;
  profile_hash: string | null;
  updated_at: string;
}

export interface SavedJob {
  owner_id: string;
  job_id: number;
  note: string | null;
  created_at: string;
}

export interface Application {
  id: number;
  owner_id: string;
  job_id: number;
  status: AppStatus;
  applied_at: string | null;
  next_action: string | null;
  next_action_at: string | null;
  notes: string | null;
  position: number | null;
  created_at: string;
  updated_at: string;
}

/** An application row joined to its job for the tracker board. */
export interface ApplicationWithJob extends Application {
  job: JobWithFit;
}

export interface ScrapeRun {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: RunStatus;
  trigger: string;
  jobs_seen: number | null;
  jobs_upserted: number | null;
  jobs_deactivated: number | null;
  fits_scored: number | null;
  adzuna_calls: number | null;
  per_source: Record<string, unknown> | null;
  error_text: string | null;
}

// --- API response envelopes --------------------------------------------------

export interface JobsResponse {
  items: JobWithFit[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RefreshResponse {
  ok: boolean;
  remaining_today: number;
  message?: string;
}

export const APP_STATUSES: AppStatus[] = [
  "saved",
  "applied",
  "phone_screen",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "ghosted",
];

/** Columns selected from `jobs` for client payloads (excludes embedding/raw). */
export const JOB_PUBLIC_COLUMNS =
  "id,source_id,external_id,dedupe_hash,title,company,description,apply_url," +
  "location_raw,city,state,country,is_remote,work_type,salary_min,salary_max," +
  "salary_currency,salary_period,salary_is_estimated,experience_level,years_min," +
  "years_max,tags,posted_at,first_seen_at,last_seen_at,is_active";
