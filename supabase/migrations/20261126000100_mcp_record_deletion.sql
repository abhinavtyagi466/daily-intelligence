begin;

create function public.mcp_workspace_delete(
  p_kind text, p_id uuid, p_related_id uuid, p_actor text, p_revision text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
  v_title text;
  v_url text;
  v_story_id uuid;
  v_source_count integer;
  v_revision text;
  v_dependents jsonb := '{}'::jsonb;
begin
  if p_kind = 'story' then
    select canonical_url into v_url from public.stories where id = p_id;
    if p_revision is not null and v_url is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_url, 1));
    end if;
    select to_jsonb(s), s.title into v_row, v_title from public.stories s where s.id = p_id for update;
    if found then
      v_dependents := jsonb_build_object(
        'source_links', (select count(*) from public.story_sources where story_id = p_id),
        'paper_metadata', (select count(*) from public.research_papers where story_id = p_id),
        'domain_assignments', (select count(*) from public.story_domains where story_id = p_id),
        'story_connections', (select count(*) from public.story_connections where earlier_story_id = p_id or later_story_id = p_id)
      );
    end if;
  elsif p_kind = 'market_research' then
    select to_jsonb(r), r.title into v_row, v_title from public.market_research r where r.id = p_id for update;
  elsif p_kind = 'story_connection' then
    select to_jsonb(c), earlier.title || ' → ' || later.title into v_row, v_title
    from public.story_connections c
    join public.stories earlier on earlier.id = c.earlier_story_id
    join public.stories later on later.id = c.later_story_id
    where c.earlier_story_id = p_id and c.later_story_id = p_related_id
    for update of c;
  elsif p_kind = 'story_source' then
    select story_id into v_story_id from public.story_sources where id = p_id;
    if v_story_id is not null then
      -- Serialize with story deletion and other removals on the same story.
      perform 1 from public.stories where id = v_story_id for update;
    end if;
    select to_jsonb(ss), ss.source_title into v_row, v_title from public.story_sources ss where ss.id = p_id for update;
    if found then
      select count(*)::integer into v_source_count from public.story_sources where story_id = v_story_id;
      if v_source_count <= 1 then
        return jsonb_build_object('status', 'blocked', 'reason', 'Keep at least one source citation on a saved story.');
      end if;
    end if;
  elsif p_kind = 'submitted_source' then
    select to_jsonb(s), s.name into v_row, v_title from public.sources s where s.id = p_id for update;
    if found and (v_row->>'source_type' <> 'external' or (v_row->>'enabled')::boolean
      or exists (select 1 from public.story_sources where source_id = p_id)
      or exists (select 1 from public.ingestion_runs where source_id = p_id)) then
      return jsonb_build_object('status', 'blocked', 'reason', 'Only unused submitted sources can be deleted.');
    end if;
  else
    raise exception 'Unsupported delete target' using errcode = '22023';
  end if;

  if v_row is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  v_revision := encode(sha256(convert_to(jsonb_build_array(p_kind, v_row, v_title, v_dependents)::text, 'UTF8')), 'hex');

  if p_revision is null then
    return jsonb_build_object('status', 'ready', 'title', v_title, 'revision', v_revision, 'dependents', v_dependents);
  end if;
  if p_revision <> v_revision then
    return jsonb_build_object('status', 'changed', 'reason', 'The record changed. Preview it again.');
  end if;

  if p_kind = 'story' then
    delete from public.story_sources where story_id = p_id;
    delete from public.research_papers where story_id = p_id;
    delete from public.story_domains where story_id = p_id;
    delete from public.stories where id = p_id;
    update intelligence_private.idempotency_keys set payload = '{"deleted":true}'::jsonb
    where result->>'story_id' = p_id::text;
  elsif p_kind = 'market_research' then
    delete from public.market_research where id = p_id;
  elsif p_kind = 'story_connection' then
    delete from public.story_connections where earlier_story_id = p_id and later_story_id = p_related_id;
  elsif p_kind = 'story_source' then
    delete from public.story_sources where id = p_id;
    -- Discard replay payloads bearing the removed citation while retaining their consumed keys.
    update intelligence_private.idempotency_keys set payload = '{"citation_removed":true}'::jsonb
    where result->>'story_id' = v_story_id::text;
  elsif p_kind = 'submitted_source' then
    delete from public.sources where id = p_id;
  end if;

  insert into public.audit_logs (actor, action, resource_type, resource_id, metadata)
  values (p_actor, 'workspace.record_deleted', p_kind, p_id,
    jsonb_strip_nulls(jsonb_build_object('related_id', p_related_id, 'dependents', v_dependents)));
  return jsonb_build_object('status', 'deleted', 'title', v_title, 'dependents', v_dependents);
end
$$;

revoke all on function public.mcp_workspace_delete(text, uuid, uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function public.mcp_workspace_delete(text, uuid, uuid, text, text) to service_role;

commit;
