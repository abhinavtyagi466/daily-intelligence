begin;

alter table public.stories
  add column ai_profile jsonb check (
    ai_profile is null or (
      jsonb_typeof(ai_profile) = 'object' and ai_profile ? 'kind'
      and ai_profile->>'kind' in ('trend', 'technology', 'job', 'paper')
      and (ai_profile->>'kind' <> 'job' or coalesce(jsonb_typeof(ai_profile->'job') = 'object', false))
    )
  ),
  add column intelligence_kind text generated always as (coalesce(
    ai_profile->>'kind',
    case when canonical_url ~* '^https://([a-z0-9-]+[.])*arxiv[.]org/(abs|pdf|html)/' then 'paper' else 'development' end
  )) stored,
  add column intelligence_search tsvector generated always as (to_tsvector(
    'pg_catalog.english'::regconfig,
    title || ' ' || summary || ' ' ||
    coalesce(ai_profile->>'topics', '') || ' ' ||
    coalesce(ai_profile->'job'->>'company', '') || ' ' ||
    coalesce(ai_profile->'job'->>'location', '') || ' ' ||
    coalesce(ai_profile->'job'->>'skills', '') || ' ' ||
    coalesce(ai_profile->'job'->>'requirements', '')
  )) stored;

update public.stories s
set ai_profile = '{"kind":"paper"}'
where exists (select 1 from public.research_papers p where p.story_id = s.id);

create index stories_kind_recency on public.stories (intelligence_kind, first_seen_at desc, id);
create index stories_intelligence_search on public.stories using gin (intelligence_search);

create function intelligence_private.classify_indexed_paper() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  update public.stories set ai_profile = '{"kind":"paper"}'
  where id = new.story_id and ai_profile is null;
  return new;
end
$$;
create trigger classify_indexed_paper after insert or update on public.research_papers
  for each row execute function intelligence_private.classify_indexed_paper();
revoke all on function intelligence_private.classify_indexed_paper() from public, anon, authenticated;

create function public.upsert_ai_story(p_story jsonb, p_actor text, p_key text) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- Include the profile in the existing deduplication and idempotency checks.
  v_result := public.upsert_intelligence_story(p_story, p_actor, p_key, null);
  if not (v_result->>'replayed')::boolean then
    update public.stories set ai_profile = p_story->'ai_profile'
    where id = (v_result->>'story_id')::uuid;
  end if;
  return v_result;
end
$$;

create function public.search_ai_intelligence(
  p_query text, p_domains text[], p_start date, p_end date, p_limit integer, p_kind text
) returns table (
  story_id uuid, title text, summary text, canonical_url text, published_at timestamptz,
  first_seen_at timestamptz, primary_domain text, source_count integer, kind text
)
language sql stable security invoker set search_path = ''
as $$
  with search as (
    select websearch_to_tsquery('pg_catalog.english'::regconfig, coalesce(p_query, '')) as terms
  )
  select s.id, s.title, s.summary, s.canonical_url, s.original_published_at, s.first_seen_at,
    d.code, (select count(*)::integer from public.story_sources ss where ss.story_id = s.id), s.intelligence_kind
  from public.stories s
  join public.domains d on d.id = s.primary_domain_id
  cross join search q
  where (coalesce(btrim(p_query), '') = '' or s.intelligence_search @@ q.terms)
    and (p_kind is null or s.intelligence_kind = p_kind)
    and (p_kind is distinct from 'job' or coalesce(s.ai_profile->'job'->>'status', '') <> 'closed')
    and (coalesce(cardinality(p_domains), 0) = 0 or exists (
      select 1 from public.story_domains sd join public.domains matched on matched.id = sd.domain_id
      where sd.story_id = s.id and matched.code = any(p_domains)
    ))
    and (p_start is null or coalesce(s.original_published_at, s.first_seen_at) >= (p_start::timestamp at time zone 'Asia/Kolkata'))
    and (p_end is null or coalesce(s.original_published_at, s.first_seen_at) < ((p_end + 1)::timestamp at time zone 'Asia/Kolkata'))
  order by ts_rank(s.intelligence_search, q.terms) desc,
    coalesce(s.original_published_at, s.first_seen_at) desc, s.id
  limit greatest(1, least(coalesce(p_limit, 10), 25))
$$;

create function public.get_ai_workspace_snapshot(p_days integer default 14) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with tracked as (
    select s.intelligence_kind as kind, s.ai_profile, s.first_seen_at
    from public.stories s
    where s.intelligence_kind <> 'development'
      and (s.intelligence_kind <> 'job' or coalesce(s.ai_profile->'job'->>'status', '') <> 'closed')
  ), counts as (
    select kind, count(*)::integer as count from tracked group by kind
  ), skills as (
    select lower(btrim(skill)) as keyword, min(btrim(skill)) as name, count(*)::integer as count
    from tracked t
    cross join lateral (
      select distinct on (lower(btrim(value))) value as skill
      from jsonb_array_elements_text(coalesce(t.ai_profile->'job'->'skills', '[]'::jsonb))
      where btrim(value) <> ''
      order by lower(btrim(value)), value
    ) as job_skills
    where t.kind = 'job' and t.first_seen_at >=
      ((((now() at time zone 'Asia/Kolkata')::date - (greatest(1, least(coalesce(p_days, 14), 30)) - 1))::timestamp)
      at time zone 'Asia/Kolkata')
    group by lower(btrim(skill))
    order by count desc, keyword
    limit 8
  )
  select jsonb_build_object(
    'counts', coalesce((select jsonb_object_agg(kind, count) from counts), '{}'::jsonb),
    'skills', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', count) order by count desc, keyword) from skills), '[]'::jsonb)
  )
$$;

revoke all on function public.upsert_ai_story(jsonb, text, text),
  public.search_ai_intelligence(text, text[], date, date, integer, text),
  public.get_ai_workspace_snapshot(integer) from public, anon, authenticated, service_role;
grant execute on function public.upsert_ai_story(jsonb, text, text) to service_role;
grant execute on function public.search_ai_intelligence(text, text[], date, date, integer, text),
  public.get_ai_workspace_snapshot(integer) to authenticated, service_role;

commit;
