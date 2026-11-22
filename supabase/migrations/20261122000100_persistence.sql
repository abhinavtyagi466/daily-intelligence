begin;

create schema if not exists intelligence_private;
revoke all on schema intelligence_private from public, anon, authenticated;
grant usage on schema intelligence_private to authenticated, service_role;

create table intelligence_private.memberships (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('reader', 'operator'))
);

create function intelligence_private.dashboard_role() returns text
language sql stable security definer set search_path = ''
as $$
  select role from intelligence_private.memberships where user_id = (select auth.uid())
$$;
revoke all on function intelligence_private.dashboard_role() from public, anon, authenticated;
grant execute on function intelligence_private.dashboard_role() to authenticated;

create function public.get_dashboard_role() returns text
language sql stable security invoker set search_path = ''
as $$ select intelligence_private.dashboard_role() $$;
revoke all on function public.get_dashboard_role() from public, anon, authenticated;
grant execute on function public.get_dashboard_role() to authenticated;

create table public.domains (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text
);

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 150),
  base_url text not null check (base_url like 'https://%'),
  source_type text not null check (source_type in ('research_registry', 'external')),
  enabled boolean not null default false,
  last_successful_fetch timestamptz,
  created_at timestamptz not null default now(),
  unique (name, base_url, source_type)
);

create table public.stories (
  id uuid primary key default gen_random_uuid(),
  canonical_url text not null unique check (canonical_url like 'https://%'),
  title text not null check (char_length(title) between 1 and 500),
  summary text not null check (char_length(summary) between 1 and 4000),
  original_published_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_updated_at timestamptz not null default now(),
  primary_domain_id uuid not null references public.domains(id),
  status text not null default 'source_reported' check (status = 'source_reported'),
  created_at timestamptz not null default now()
);

create table public.story_domains (
  story_id uuid not null references public.stories(id),
  domain_id uuid not null references public.domains(id),
  is_primary boolean not null default false,
  primary key (story_id, domain_id)
);
create unique index story_domains_single_primary on public.story_domains (story_id) where is_primary;
create index story_domains_domain on public.story_domains (domain_id);
create index stories_recent on public.stories (first_seen_at desc, id);
create index stories_publication on public.stories (original_published_at desc);
create index stories_domain on public.stories (primary_domain_id);

create table public.story_sources (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id),
  source_id uuid not null references public.sources(id),
  source_url text not null check (source_url like 'https://%'),
  source_title text not null check (char_length(source_title) between 1 and 500),
  published_at timestamptz,
  retrieved_at timestamptz not null default now(),
  content_hash text not null,
  source_role text not null check (source_role in ('citation_metadata', 'submitted_reference')),
  verification_status text not null default 'source_reported' check (verification_status = 'source_reported'),
  unique (story_id, source_id, source_url, content_hash)
);
create index story_sources_source on public.story_sources (source_id);

create table public.research_papers (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null unique references public.stories(id),
  doi text not null unique check (doi = lower(doi)),
  title text not null,
  authors jsonb not null default '[]'::jsonb check (jsonb_typeof(authors) = 'array'),
  publication_type text not null,
  peer_review_status text not null default 'unknown',
  paper_url text not null check (paper_url like 'https://%')
);

create table public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  execution_status text not null default 'running' check (execution_status in ('running', 'completed', 'partial', 'failed')),
  records_collected integer not null default 0 check (records_collected >= 0),
  records_created integer not null default 0 check (records_created >= 0),
  records_rejected integer not null default 0 check (records_rejected >= 0),
  errors jsonb not null default '[]'::jsonb
);
create index ingestion_runs_recent on public.ingestion_runs (started_at desc);
create unique index ingestion_runs_single_active on public.ingestion_runs (source_id) where execution_status = 'running';

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  resource_type text not null,
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_resource on public.audit_logs (resource_id, created_at desc);

create table intelligence_private.idempotency_keys (
  actor text not null,
  key text not null,
  payload jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor, key)
);

create table intelligence_private.mcp_rate_limits (
  actor text primary key,
  bucket bigint not null,
  requests integer not null
);
grant select, insert, update on intelligence_private.idempotency_keys, intelligence_private.mcp_rate_limits to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['domains', 'sources', 'stories', 'story_domains',
    'story_sources', 'research_papers', 'ingestion_runs', 'audit_logs']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', table_name);
    execute format('grant select, insert, update on public.%I to service_role', table_name);
    if table_name <> 'audit_logs' then
      execute format('grant select on public.%I to authenticated', table_name);
      execute format(
        'create policy dashboard_members_read on public.%I for select to authenticated using ((select intelligence_private.dashboard_role()) is not null)',
        table_name
      );
    end if;
  end loop;
end
$$;
revoke update on public.audit_logs from service_role;
grant delete on public.story_domains to service_role;
alter table intelligence_private.memberships enable row level security;
alter table intelligence_private.idempotency_keys enable row level security;
alter table intelligence_private.mcp_rate_limits enable row level security;

insert into public.domains (code, name) values
  ('ai-ml', 'AI & Machine Learning'),
  ('computing', 'Computing & Semiconductors'),
  ('geopolitics', 'Geopolitics'),
  ('startups', 'Startups & Funding'),
  ('psychology', 'Psychology & Cognitive Science'),
  ('neuroscience', 'Neurology & Neuroscience');

insert into public.sources (name, base_url, source_type, enabled)
values ('Crossref', 'https://api.crossref.org', 'research_registry', true);

commit;
