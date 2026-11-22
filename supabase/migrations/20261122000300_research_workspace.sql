begin;

create table public.market_research (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 3 and 80 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  summary text not null check (char_length(summary) between 1 and 2000),
  content jsonb not null check (
    jsonb_typeof(content) = 'object'
    and content ?& array['signals', 'scenarios', 'limitations', 'references']
    and jsonb_typeof(content->'signals') = 'array'
    and jsonb_typeof(content->'scenarios') = 'array'
    and jsonb_typeof(content->'limitations') = 'array'
    and jsonb_typeof(content->'references') = 'array'
    and (not (content ? 'measurements') or jsonb_typeof(content->'measurements') = 'array')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index market_research_recent on public.market_research (updated_at desc, id);
alter table public.market_research enable row level security;
revoke all on public.market_research from public, anon, authenticated, service_role;
grant select on public.market_research to authenticated;
grant select, insert, update on public.market_research to service_role;
create policy dashboard_members_read on public.market_research
  for select to authenticated using ((select intelligence_private.dashboard_role()) is not null);

create function public.save_market_research(p_entry jsonb, p_actor text) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text := p_entry->>'slug';
  v_saved boolean;
begin
  insert into public.market_research as research (slug, title, summary, content)
  values (v_slug, p_entry->>'title', p_entry->>'summary', p_entry->'content')
  on conflict (slug) do update
    set title = excluded.title, summary = excluded.summary, content = excluded.content, updated_at = now()
    where (research.title, research.summary, research.content)
      is distinct from (excluded.title, excluded.summary, excluded.content)
  returning id into v_id;

  v_saved := found;
  if v_saved then
    insert into public.audit_logs (actor, action, resource_type, resource_id)
    values (p_actor, 'market_research.saved', 'market_research', v_id);
  else
    select id into strict v_id from public.market_research where slug = v_slug;
  end if;
  return jsonb_build_object('research_id', v_id, 'slug', v_slug, 'changed', v_saved);
end
$$;

create function public.get_workspace_analytics(p_days integer default 14) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with period as (
    select (now() at time zone 'Asia/Kolkata')::date as last_day,
      greatest(1, least(coalesce(p_days, 14), 30)) as days
  ), bounds as (
    select last_day, last_day - (days - 1) as first_day from period
  ), saved as (
    select (s.first_seen_at at time zone 'Asia/Kolkata')::date as day, s.primary_domain_id
    from public.stories s cross join bounds b
    where s.first_seen_at >= (b.first_day::timestamp at time zone 'Asia/Kolkata')
      and s.first_seen_at < ((b.last_day + 1)::timestamp at time zone 'Asia/Kolkata')
  ), daily_counts as (
    select day, count(*)::integer as count from saved group by day
  ), daily_series as (
    select b.first_day + series.day_offset as date, coalesce(c.count, 0) as count
    from bounds b cross join lateral generate_series(0, b.last_day - b.first_day) as series(day_offset)
    left join daily_counts c on c.day = b.first_day + series.day_offset
  ), domain_counts as (
    select d.code, d.name, count(*)::integer as count
    from saved s join public.domains d on d.id = s.primary_domain_id
    group by d.code, d.name
  )
  select jsonb_build_object(
    'daily', coalesce((select jsonb_agg(d order by d.date) from daily_series d), '[]'::jsonb),
    'domains', coalesce((select jsonb_agg(d order by d.count desc, d.code) from domain_counts d), '[]'::jsonb)
  )
$$;

create index stories_keyword_search on public.stories
  using gin (to_tsvector('pg_catalog.english'::regconfig, title || ' ' || summary));

create function public.search_intelligence(
  p_query text default '', p_domains text[] default '{}', p_start date default null,
  p_end date default null, p_limit integer default 10
) returns table (
  story_id uuid, title text, summary text, canonical_url text, published_at timestamptz,
  first_seen_at timestamptz, primary_domain text, source_count integer
)
language sql stable security invoker set search_path = ''
as $$
  with query as (
    select websearch_to_tsquery('pg_catalog.english'::regconfig, coalesce(p_query, '')) as terms
  )
  select s.id, s.title, s.summary, s.canonical_url, s.original_published_at, s.first_seen_at,
    d.code, (select count(*)::integer from public.story_sources ss where ss.story_id = s.id)
  from public.stories s
  join public.domains d on d.id = s.primary_domain_id
  cross join query q
  where (coalesce(btrim(p_query), '') = '' or to_tsvector('pg_catalog.english'::regconfig, s.title || ' ' || s.summary) @@ q.terms)
    and (coalesce(cardinality(p_domains), 0) = 0 or exists (
      select 1 from public.story_domains sd join public.domains matched on matched.id = sd.domain_id
      where sd.story_id = s.id and matched.code = any(p_domains)
    ))
    and (p_start is null or coalesce(s.original_published_at, s.first_seen_at) >= (p_start::timestamp at time zone 'Asia/Kolkata'))
    and (p_end is null or coalesce(s.original_published_at, s.first_seen_at) < ((p_end + 1)::timestamp at time zone 'Asia/Kolkata'))
  order by ts_rank(to_tsvector('pg_catalog.english'::regconfig, s.title || ' ' || s.summary), q.terms) desc,
    s.first_seen_at desc, s.id
  limit greatest(1, least(coalesce(p_limit, 10), 25))
$$;

revoke all on function public.save_market_research(jsonb, text),
  public.get_workspace_analytics(integer), public.search_intelligence(text, text[], date, date, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.save_market_research(jsonb, text) to service_role;
grant execute on function public.get_workspace_analytics(integer), public.search_intelligence(text, text[], date, date, integer)
  to authenticated, service_role;

commit;
