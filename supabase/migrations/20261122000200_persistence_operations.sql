begin;

create function public.upsert_intelligence_story(
  p_story jsonb, p_actor text, p_key text default null, p_paper jsonb default null
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_url text := p_story->>'canonical_url';
  v_story_id uuid;
  v_source_id uuid;
  v_primary_id uuid;
  v_domain_count integer;
  v_source jsonb;
  v_result jsonb;
  v_operation text;
  v_payload jsonb;
  v_previous jsonb;
  v_kind text := case when p_paper is null then 'external' else 'research_registry' end;
begin
  if p_key is not null then
    v_payload := jsonb_build_object('story', p_story, 'paper', p_paper);
    perform pg_advisory_xact_lock(hashtextextended(jsonb_build_array(p_actor, p_key)::text, 0));
    select payload, result into v_previous, v_result
    from intelligence_private.idempotency_keys where actor = p_actor and key = p_key;
    if found then
      if v_payload is distinct from v_previous then
        raise exception 'Idempotency key already used for a different payload' using errcode = '22023';
      end if;
      return v_result || '{"replayed":true}'::jsonb;
    end if;
  end if;

  select id into v_primary_id from public.domains where code = (p_story->'domains'->>0);
  select count(*) into v_domain_count from public.domains
  where code in (select jsonb_array_elements_text(p_story->'domains'));
  if v_primary_id is null or v_domain_count <> jsonb_array_length(p_story->'domains')
     or coalesce(jsonb_array_length(p_story->'source_records'), 0) = 0 then
    raise exception 'A story requires valid distinct domains and at least one source' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_url, 1));
  select id into v_story_id from public.stories where canonical_url = v_url;
  if v_story_id is null then
    insert into public.stories (canonical_url, title, summary, original_published_at, primary_domain_id)
    values (v_url, p_story->>'title', p_story->>'summary', (p_story->>'published_at')::timestamptz, v_primary_id)
    returning id into v_story_id;
    v_operation := 'inserted';
  elsif p_paper is null then
    update public.stories
    set title = p_story->>'title', summary = p_story->>'summary',
      original_published_at = coalesce((p_story->>'published_at')::timestamptz, original_published_at),
      primary_domain_id = v_primary_id, last_updated_at = now()
    where id = v_story_id;
    delete from public.story_domains where story_id = v_story_id;
    v_operation := 'updated';
  else
    v_operation := 'existing';
  end if;

  if v_operation <> 'existing' then
    insert into public.story_domains (story_id, domain_id, is_primary)
    select v_story_id, id, id = v_primary_id from public.domains
    where code in (select jsonb_array_elements_text(p_story->'domains'));
  end if;

  -- Consistent order prevents locks on shared source origins being acquired in reverse order.
  for v_source in select value from jsonb_array_elements(p_story->'source_records')
                  order by value->>'source_name', value->>'source_origin'
  loop
    insert into public.sources (name, base_url, source_type)
    values (v_source->>'source_name', v_source->>'source_origin', v_kind)
    on conflict (name, base_url, source_type) do nothing
    returning id into v_source_id;

    if v_source_id is null then
      select id into strict v_source_id from public.sources
      where name = v_source->>'source_name' and base_url = v_source->>'source_origin' and source_type = v_kind;
    end if;

    insert into public.story_sources (story_id, source_id, source_url, source_title, published_at, content_hash, source_role)
    values (v_story_id, v_source_id, v_source->>'source_url', v_source->>'source_title',
      (v_source->>'published_at')::timestamptz, encode(sha256(convert_to(v_source::text, 'UTF8')), 'hex'),
      case when p_paper is null then 'submitted_reference' else 'citation_metadata' end)
    on conflict (story_id, source_id, source_url, content_hash) do nothing;
  end loop;

  if p_paper is not null then
    insert into public.research_papers (story_id, doi, title, authors, publication_type, paper_url)
    values (v_story_id, p_paper->>'doi', p_story->>'title', p_paper->'authors', p_paper->>'publication_type', v_url)
    on conflict (story_id) do update set title = excluded.title, authors = excluded.authors,
      publication_type = excluded.publication_type;
  end if;

  insert into public.audit_logs (actor, action, resource_type, resource_id, metadata)
  values (p_actor, 'story.' || v_operation, 'story', v_story_id,
    jsonb_build_object('source_count', jsonb_array_length(p_story->'source_records')));

  v_result := jsonb_build_object('story_id', v_story_id, 'operation', v_operation, 'status', 'stored', 'replayed', false);
  if p_key is not null then
    insert into intelligence_private.idempotency_keys (actor, key, payload, result)
    values (p_actor, p_key, v_payload, v_result);
  end if;
  return v_result;
end
$$;

create function public.start_crossref_ingestion(p_actor text) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_source_id uuid;
  v_run_id uuid;
begin
  select id into strict v_source_id from public.sources
  where name = 'Crossref' and base_url = 'https://api.crossref.org'
    and source_type = 'research_registry' and enabled;

  perform pg_advisory_xact_lock(hashtextextended(v_source_id::text, 2));
  update public.ingestion_runs set execution_status = 'failed', completed_at = now(),
    errors = '["Run expired before reporting completion."]'::jsonb
  where source_id = v_source_id and execution_status = 'running' and started_at < now() - interval '5 minutes';

  insert into public.ingestion_runs (source_id) values (v_source_id)
  on conflict (source_id) where execution_status = 'running' do nothing
  returning id into v_run_id;

  if v_run_id is not null then
    insert into public.audit_logs (actor, action, resource_type, resource_id)
    values (p_actor, 'ingestion.started', 'ingestion_run', v_run_id);
  end if;
  return v_run_id;
end
$$;

create function public.finish_crossref_ingestion(
  p_id uuid, p_actor text, p_status text, p_collected integer, p_created integer, p_rejected integer, p_errors jsonb
) returns void
language plpgsql security invoker set search_path = ''
as $$
declare
  v_source_id uuid;
begin
  if p_status not in ('completed', 'partial', 'failed') then
    raise exception 'Invalid final run status' using errcode = '22023';
  end if;
  update public.ingestion_runs
  set execution_status = p_status, completed_at = now(), records_collected = p_collected,
    records_created = p_created, records_rejected = p_rejected, errors = p_errors
  where id = p_id and execution_status = 'running'
  returning source_id into v_source_id;
  if found then
    if p_status in ('completed', 'partial') then
      update public.sources set last_successful_fetch = now() where id = v_source_id;
    end if;
    insert into public.audit_logs (actor, action, resource_type, resource_id)
    values (p_actor, 'ingestion.' || p_status, 'ingestion_run', p_id);
  end if;
end
$$;

create function public.consume_mcp_quota(p_actor text) returns boolean
language sql security invoker set search_path = ''
as $$
  insert into intelligence_private.mcp_rate_limits as limits (actor, bucket, requests)
  values (p_actor, floor(extract(epoch from statement_timestamp()) / 60)::bigint, 1)
  on conflict (actor) do update set bucket = excluded.bucket,
    requests = case when limits.bucket = excluded.bucket then least(limits.requests + 1, 61) else 1 end
  returning requests <= 60
$$;

revoke all on function public.upsert_intelligence_story(jsonb, text, text, jsonb),
  public.start_crossref_ingestion(text), public.finish_crossref_ingestion(uuid, text, text, integer, integer, integer, jsonb),
  public.consume_mcp_quota(text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_intelligence_story(jsonb, text, text, jsonb),
  public.start_crossref_ingestion(text), public.finish_crossref_ingestion(uuid, text, text, integer, integer, integer, jsonb),
  public.consume_mcp_quota(text) to service_role;

commit;
