-- ============================================================================
-- search_jobs v2: adds four filters (company, application status, fit band,
-- exclude-keywords) AND read-time de-duplication. The dedupe_hash was computed
-- and indexed but never used to merge, so the same posting from Adzuna + an ATS
-- + The Muse showed 2-3x. We now collapse each dedupe_hash group to one
-- canonical row (preferring rows the owner already interacted with, then richer
-- data: has-salary > known-experience > ATS-over-aggregator > most recent).
-- Replaces the function from 0002. Apply after 0002.
-- ============================================================================

create or replace function search_jobs(p_owner uuid, f jsonb)
returns table (item jsonb, total bigint)
language sql
stable
as $$
  with filtered as (
    select
      (to_jsonb(j) - 'embedding' - 'raw')                        as job_json,
      j.dedupe_hash                                              as dedupe_hash,
      s.slug                                                     as source_slug,
      s.display_name                                             as source_name,
      case when jf.job_id is null then null else to_jsonb(jf) end as fit_json,
      jf.score                                                   as fit_score,
      (sv.owner_id is not null)                                  as is_saved,
      app.status                                                 as application_status,
      -- canonical-pick tiebreak inputs
      (app.status is not null)                                   as is_tracked,
      (sv.owner_id is not null)                                  as saved_rank,
      (j.salary_min is not null or j.salary_max is not null)     as has_salary,
      (j.experience_level <> 'unknown')                          as exp_known,
      (case when s.kind = 'ats' then 0 else 1 end)               as source_rank,
      -- sort inputs
      coalesce(j.salary_max, j.salary_min)                       as salary_sort,
      j.company                                                  as company_sort,
      j.posted_at                                                as posted_sort,
      j.id                                                       as id_sort
    from jobs j
    join sources s on s.id = j.source_id
    left join job_fit      jf on jf.job_id  = j.id and jf.owner_id  = p_owner
    left join saved_jobs   sv on sv.job_id  = j.id and sv.owner_id  = p_owner
    left join applications app on app.job_id = j.id and app.owner_id = p_owner
    where j.is_active
      and ( coalesce((f->>'savedOnly')::boolean, false) = false or sv.owner_id is not null )
      and ( coalesce(jsonb_array_length(f->'level'), 0) = 0
            or j.experience_level::text in (select jsonb_array_elements_text(f->'level')) )
      and ( coalesce(jsonb_array_length(f->'work'), 0) = 0
            or j.work_type::text in (select jsonb_array_elements_text(f->'work')) )
      and ( coalesce((f->>'remote')::boolean, false) = false or j.is_remote )
      and ( coalesce(jsonb_array_length(f->'state'), 0) = 0
            or j.state in (select jsonb_array_elements_text(f->'state')) )
      and ( coalesce(jsonb_array_length(f->'src'), 0) = 0
            or s.slug in (select jsonb_array_elements_text(f->'src')) )
      and ( (f->>'salaryMin') is null
            or coalesce(j.salary_max, j.salary_min) >= (f->>'salaryMin')::int
            or ( coalesce((f->>'includeNoSalary')::boolean, true)
                 and j.salary_min is null and j.salary_max is null ) )
      and ( (f->>'sinceCutoff') is null
            or j.posted_at >= (f->>'sinceCutoff')::timestamptz )
      and ( coalesce((f->>'fit')::int, 0) = 0
            or coalesce(jf.score, 0) >= (f->>'fit')::int )
      and ( coalesce(f->>'q', '') = ''
            or to_tsvector('english', coalesce(j.title,'') || ' ' || coalesce(j.description,''))
               @@ websearch_to_tsquery('english', f->>'q')
            or j.company ilike '%' || (f->>'q') || '%'
            or j.title   ilike '%' || (f->>'q') || '%' )
      -- NEW: company-name contains
      and ( coalesce(f->>'company', '') = ''
            or j.company ilike '%' || (f->>'company') || '%' )
      -- NEW: application status (the synthetic 'none' = not tracked yet)
      and ( coalesce(jsonb_array_length(f->'status'), 0) = 0
            or app.status::text in (select jsonb_array_elements_text(f->'status'))
            or ( app.status is null and (f->'status') ? 'none' ) )
      -- NEW: fit band
      and ( coalesce(jsonb_array_length(f->'fitBand'), 0) = 0
            or jf.band in (select jsonb_array_elements_text(f->'fitBand')) )
      -- NEW: exclude keywords (title or description)
      and ( coalesce(jsonb_array_length(f->'excludeKw'), 0) = 0
            or not exists (
              select 1 from jsonb_array_elements_text(f->'excludeKw') kw
              where j.title ilike '%' || kw || '%'
                 or coalesce(j.description, '') ilike '%' || kw || '%' ) )
  ),
  deduped as (
    select distinct on (dedupe_hash) *
    from filtered
    order by
      dedupe_hash,
      is_tracked desc,
      saved_rank desc,
      has_salary desc,
      exp_known desc,
      source_rank asc,
      posted_sort desc nulls last,
      id_sort desc
  ),
  counted as (
    select *, count(*) over() as total from deduped
  )
  select
    job_json || jsonb_build_object(
      'source_slug', source_slug,
      'source_name', source_name,
      'fit', fit_json,
      'is_saved', is_saved,
      'application_status', application_status
    ) as item,
    total
  from counted
  order by
    case when f->>'sort' = 'fit'     then fit_score    end desc nulls last,
    case when f->>'sort' = 'salary'  then salary_sort  end desc nulls last,
    case when f->>'sort' = 'company' then company_sort end asc  nulls last,
    posted_sort desc nulls last,
    id_sort desc
  offset coalesce((f->>'offset')::int, 0)
  limit  coalesce((f->>'limit')::int, 25)
$$;

grant execute on function search_jobs(uuid, jsonb) to authenticated;
grant execute on function search_jobs(uuid, jsonb) to service_role;
