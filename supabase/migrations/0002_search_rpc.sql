-- ============================================================================
-- search_jobs: the one query behind GET /api/jobs. Joins jobs -> fit/saved/
-- application for the owner, applies all filters, sorts (fit/posted/salary/
-- company), paginates, and returns each row as the client-facing JobWithFit
-- jsonb plus a window total. Runs with the caller's RLS (not security definer),
-- so the caller can only ever read their own fit/saved/application rows.
-- ============================================================================

create or replace function search_jobs(p_owner uuid, f jsonb)
returns table (item jsonb, total bigint)
language sql
stable
as $$
  with base as (
    select
      (to_jsonb(j) - 'embedding' - 'raw')
        || jsonb_build_object(
             'source_slug', s.slug,
             'source_name', s.display_name,
             'fit', case when jf.job_id is null then null else to_jsonb(jf) end,
             'is_saved', (sv.owner_id is not null),
             'application_status', app.status
           ) as item,
      jf.score                              as fit_score,
      coalesce(j.salary_max, j.salary_min)  as salary_sort,
      j.company                             as company_sort,
      j.posted_at                           as posted_sort,
      j.id                                  as id_sort,
      count(*) over()                       as total
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
  )
  select item, total
  from base
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
-- The app reads via the service-role client (behind the access-code gate),
-- passing p_owner explicitly, so service_role needs execute too.
grant execute on function search_jobs(uuid, jsonb) to service_role;
