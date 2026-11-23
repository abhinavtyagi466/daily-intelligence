begin;

create index stories_intelligence_date on public.stories (intelligence_date desc, id);

create table public.story_connections (
  earlier_story_id uuid not null references public.stories(id) on delete cascade,
  later_story_id uuid not null references public.stories(id) on delete cascade,
  evidence_url text not null check (evidence_url ~ '^https://' and char_length(evidence_url) <= 2048),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  primary key (earlier_story_id, later_story_id),
  check (earlier_story_id <> later_story_id)
);
create index story_connections_later on public.story_connections (later_story_id);
alter table public.story_connections enable row level security;
revoke all on public.story_connections from public, anon, authenticated, service_role;
grant select on public.story_connections to authenticated;
grant select, insert, update on public.story_connections to service_role;
create policy dashboard_members_read on public.story_connections
  for select to authenticated using ((select intelligence_private.dashboard_role()) is not null);

create function public.save_story_connection(p_earlier uuid, p_later uuid, p_evidence_url text, p_reason text, p_actor text)
returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_changed boolean;
begin
  if not exists (
    select 1 from public.stories first_story cross join public.stories last_story
    where first_story.id = p_earlier and last_story.id = p_later and p_earlier <> p_later
      and first_story.intelligence_date <= last_story.intelligence_date
  ) then
    raise exception 'Use two saved stories in chronological order' using errcode = '22023';
  end if;

  insert into public.story_connections as connection (earlier_story_id, later_story_id, evidence_url, reason)
  values (p_earlier, p_later, p_evidence_url, p_reason)
  on conflict (earlier_story_id, later_story_id) do update
    set evidence_url = excluded.evidence_url, reason = excluded.reason
    where (connection.evidence_url, connection.reason) is distinct from (excluded.evidence_url, excluded.reason);
  v_changed := found;
  if v_changed then
    insert into public.audit_logs (actor, action, resource_type, resource_id, metadata)
    values (p_actor, 'story_connection.saved', 'story', p_later, jsonb_build_object('earlier_story_id', p_earlier));
  end if;

  return jsonb_build_object('earlier_story_id', p_earlier, 'later_story_id', p_later, 'changed', v_changed);
end
$$;

create function public.get_ai_patterns(p_days integer, p_include_connections boolean) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with settings as (
    select (now() at time zone 'Asia/Kolkata')::date as today,
      greatest(1, least(coalesce(p_days, 7), 30)) as days
  ), bounds as (
    select today, today - (days - 1) as current_start, today - (2 * days - 1) as previous_start
    from settings
  ), tracked as (
    select s.id, s.title, s.summary, s.canonical_url, s.intelligence_kind, s.intelligence_search,
      s.ai_profile, (s.intelligence_date at time zone 'Asia/Kolkata')::date as day,
      s.intelligence_date >= (b.current_start::timestamp at time zone 'Asia/Kolkata') as is_current
    from public.stories s cross join bounds b
    where s.intelligence_date >= (b.previous_start::timestamp at time zone 'Asia/Kolkata')
      and s.intelligence_date < ((b.today + 1)::timestamp at time zone 'Asia/Kolkata')
      and (
        s.intelligence_kind in ('trend', 'technology', 'paper')
        or (s.intelligence_kind = 'development' and exists (
          select 1 from public.story_domains sd join public.domains d on d.id = sd.domain_id
          where sd.story_id = s.id and d.code = 'ai-ml'
        ))
      )
  ), topics(label, query, aliases) as (
    values
      ('AI agents', '"agentic AI" OR "AI agent" OR "multi-agent" OR "tool calling" OR "model context protocol" OR MCP',
        array['agents', 'agentic ai', 'ai agents', 'mcp', 'tool calling']),
      ('Inference and serving', 'inference OR "LLM serving" OR "KV cache" OR speculative decoding OR quantization',
        array['inference', 'inference optimization', 'llm serving', 'model serving', 'kv cache', 'quantization']),
      ('Retrieval and grounding', '"retrieval-augmented generation" OR RAG OR embedding OR reranking OR "vector search"',
        array['rag', 'retrieval', 'retrieval augmented generation', 'retrieval-augmented generation', 'embeddings', 'vector search']),
      ('Reasoning models', '"reasoning model" OR "test-time compute" OR "chain of thought" OR "reasoning benchmark"',
        array['reasoning', 'reasoning models', 'test-time compute']),
      ('AI evaluation', '"model evaluation" OR "LLM benchmark" OR "evaluation benchmark" OR "model benchmark"',
        array['evaluation', 'ai evaluation', 'benchmarks', 'model evaluation']),
      ('Model training', '"model training" OR fine-tuning OR post-training OR distillation OR "reinforcement learning"',
        array['training', 'model training', 'fine-tuning', 'finetuning', 'post-training', 'distillation']),
      ('Multimodal AI', 'multimodal OR "vision language model" OR "video generation" OR "speech model"',
        array['multimodal', 'multimodal ai', 'vision-language models', 'video generation']),
      ('AI infrastructure', 'GPU OR accelerator OR CUDA OR semiconductor OR "data center" OR "compute cluster"',
        array['ai infrastructure', 'accelerators', 'gpu', 'gpus', 'semiconductors', 'compute']),
      ('Open models', '"open weights" OR "open-weight model" OR "open source model"',
        array['open models', 'open weights', 'open-weight models'])
  ), candidates as (
    select t.id, k.label
    from tracked t join topics k
      on t.intelligence_search @@ websearch_to_tsquery('pg_catalog.english'::regconfig, k.query)
    union all
    select t.id, coalesce(k.label, btrim(tag.value))
    from tracked t
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(t.ai_profile->'topics') = 'array' then t.ai_profile->'topics' else '[]'::jsonb end
    ) as tag(value)
    left join topics k on lower(btrim(tag.value)) = any(k.aliases)
    where char_length(btrim(tag.value)) between 1 and 100
  ), mentions as (
    select id, lower(label) as topic, min(label) as label from candidates group by id, lower(label)
  ), counts as (
    select m.topic, min(m.label) as label,
      count(*) filter (where t.is_current)::integer as current_count,
      count(*) filter (where not t.is_current)::integer as previous_count
    from mentions m join tracked t on t.id = m.id group by m.topic
  ), patterns as (
    select * from counts
    where greatest(current_count, previous_count) >= 2
    order by abs(current_count - previous_count) desc, current_count desc, previous_count desc, topic
    limit 8
  ), results as (
    select p.*,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.is_current desc, e.day desc, e.id)
       from (
         select t.id, t.title, t.canonical_url, t.day, t.intelligence_kind as kind, t.is_current,
           case when char_length(t.summary) <= 320 then t.summary else left(t.summary, 317) || '...' end as summary
         from mentions m join tracked t on t.id = m.id
         where p_include_connections and m.topic = p.topic
         order by t.is_current desc, t.day desc, t.id
         limit 3
       ) e), '[]'::jsonb) as evidence
    from patterns p
  ), co_occurrences as (
    select a.topic as left_key, b.topic as right_key, min(a.label) as left_topic, min(b.label) as right_topic,
      count(*) filter (where t.is_current)::integer as current_count,
      count(*) filter (where not t.is_current)::integer as previous_count
    from mentions a join mentions b on a.id = b.id and a.topic < b.topic
    join tracked t on t.id = a.id
    where p_include_connections
    group by a.topic, b.topic having count(*) >= 2
    order by current_count desc, previous_count desc, a.topic, b.topic limit 8
  ), topic_connections as (
    select c.*,
      (select jsonb_agg(to_jsonb(e) order by e.is_current desc, e.day desc, e.id) from (
        select t.id, t.title, t.canonical_url, t.day, t.intelligence_kind as kind, t.is_current,
          case when char_length(t.summary) <= 320 then t.summary else left(t.summary, 317) || '...' end as summary
        from mentions a join mentions b on a.id = b.id and a.topic = c.left_key and b.topic = c.right_key
        join tracked t on t.id = a.id
        order by t.is_current desc, t.day desc, t.id limit 3
      ) e) as evidence
    from co_occurrences c
  ), story_link_candidates as (
    select c.earlier_story_id as earlier_id, c.later_story_id as later_id,
      c.reason, c.evidence_url, 'source_attributed'::text as relationship
    from public.story_connections c
    join public.stories later on later.id = c.later_story_id
    cross join bounds b
    where p_include_connections
      and later.intelligence_date >= (b.current_start::timestamp at time zone 'Asia/Kolkata')
      and later.intelligence_date < ((b.today + 1)::timestamp at time zone 'Asia/Kolkata')
    union all
    select earlier.id, t.id, 'The later update links to the original source of the earlier update.',
      ss.source_url, 'cites'
    from tracked t
    join public.story_sources ss on ss.story_id = t.id
    join public.stories earlier on earlier.canonical_url = ss.source_url
    where p_include_connections and t.is_current and earlier.id <> t.id
      and (earlier.intelligence_date at time zone 'Asia/Kolkata')::date <= t.day
  ), distinct_links as (
    select distinct on (earlier_id, later_id) * from story_link_candidates
    order by earlier_id, later_id, (relationship = 'source_attributed') desc, evidence_url
  ), story_connections as (
    select jsonb_build_object(
      'earlier', jsonb_build_object('id', first_story.id, 'title', first_story.title, 'url', first_story.canonical_url),
      'later', jsonb_build_object('id', last_story.id, 'title', last_story.title, 'url', last_story.canonical_url,
        'day', (last_story.intelligence_date at time zone 'Asia/Kolkata')::date),
      'relationship', l.relationship, 'reason', l.reason, 'evidence_url', l.evidence_url
    ) as connection, (last_story.intelligence_date at time zone 'Asia/Kolkata')::date as day,
      l.later_id, l.earlier_id, (l.relationship = 'source_attributed') as attributed
    from distinct_links l join public.stories first_story on first_story.id = l.earlier_id
    join public.stories last_story on last_story.id = l.later_id
    where first_story.intelligence_date <= last_story.intelligence_date
    order by attributed desc, day desc, l.later_id, l.earlier_id limit 12
  )
  select jsonb_build_object(
    'current', jsonb_build_object('from', b.current_start, 'through', b.today,
      'stories', (select count(*)::integer from tracked where is_current)),
    'previous', jsonb_build_object('from', b.previous_start, 'through', b.current_start - 1,
      'stories', (select count(*)::integer from tracked where not is_current)),
    'patterns', coalesce((select jsonb_agg(to_jsonb(r) - 'topic'
      order by abs(r.current_count - r.previous_count) desc, r.current_count desc, r.previous_count desc, r.topic) from results r), '[]'::jsonb),
    'topic_connections', coalesce((select jsonb_agg(to_jsonb(c) - 'left_key' - 'right_key'
      order by c.current_count desc, c.previous_count desc, c.left_key, c.right_key) from topic_connections c), '[]'::jsonb),
    'story_connections', coalesce((select jsonb_agg(c.connection order by c.attributed desc, c.day desc, c.later_id, c.earlier_id)
      from story_connections c), '[]'::jsonb)
  )
  from bounds b
$$;

create or replace function public.get_ai_patterns(p_days integer default 7) returns jsonb
language sql stable security invoker set search_path = ''
as $$ select public.get_ai_patterns(p_days, true) $$;

revoke all on function public.get_ai_patterns(integer, boolean),
  public.save_story_connection(uuid, uuid, text, text, text) from public, anon, authenticated, service_role;
grant execute on function public.get_ai_patterns(integer, boolean) to authenticated, service_role;
grant execute on function public.save_story_connection(uuid, uuid, text, text, text) to service_role;

commit;
