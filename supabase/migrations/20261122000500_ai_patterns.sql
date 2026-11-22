begin;

create function public.get_ai_patterns(p_days integer default 7) returns jsonb
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
      (select jsonb_agg(to_jsonb(e) order by e.is_current desc, e.day desc, e.id)
       from (
         select t.id, t.title, t.canonical_url, t.day, t.intelligence_kind as kind, t.is_current,
           case when char_length(t.summary) <= 320 then t.summary else left(t.summary, 317) || '...' end as summary
         from mentions m join tracked t on t.id = m.id
         where m.topic = p.topic
         order by t.is_current desc, t.day desc, t.id
         limit 3
       ) e) as evidence
    from patterns p
  )
  select jsonb_build_object(
    'current', jsonb_build_object('from', b.current_start, 'through', b.today,
      'stories', (select count(*)::integer from tracked where is_current)),
    'previous', jsonb_build_object('from', b.previous_start, 'through', b.current_start - 1,
      'stories', (select count(*)::integer from tracked where not is_current)),
    'patterns', coalesce((select jsonb_agg(to_jsonb(r) - 'topic'
      order by abs(r.current_count - r.previous_count) desc, r.current_count desc, r.previous_count desc, r.topic) from results r), '[]'::jsonb)
  )
  from bounds b
$$;

revoke all on function public.get_ai_patterns(integer) from public, anon, authenticated, service_role;
grant execute on function public.get_ai_patterns(integer) to authenticated, service_role;

commit;
