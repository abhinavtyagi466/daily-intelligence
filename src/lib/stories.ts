import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { canonicalUrl, runView, sourceView, storyView, upsertResult, type AIKind, type LaunchType, type Story, type StoryInput } from "./story-schema";

const storyFields = `
  id,canonical_url,title,summary,original_published_at,first_seen_at,last_updated_at,status,
  domain:domains!primary_domain_id(code,name),
  story_domains(is_primary,domain:domains(code,name)),
  story_sources(id,source_url,source_title,published_at,retrieved_at,source_role,verification_status,source:sources(name)),
  research_papers(doi,title,authors,publication_type,peer_review_status,paper_url)
`;
const runFields = `
  id,started_at,completed_at,execution_status,records_collected,records_created,records_rejected,errors,source:sources(name)
`;

export class IdempotencyConflict extends Error {}
export class AITrackerMigrationRequired extends Error {}

export type ResearchPaper = { doi: string; authors: string[]; publication_type: string };

export async function upsertStory(
  client: SupabaseClient, input: StoryInput, actor: string, key?: string, paper?: ResearchPaper,
) {
  const story = {
    ...input,
    canonical_url: canonicalUrl(input.canonical_url),
    source_records: input.source_records.map((source) => ({
      ...source, source_origin: new URL(source.source_url).origin,
    })),
  };
  const args = { p_story: story, p_actor: actor, p_key: key ?? null };
  const { data, error } = input.ai_profile
    ? await client.rpc("upsert_ai_story", args)
    : await client.rpc("upsert_intelligence_story", { ...args, p_paper: paper ?? null });
  if (input.ai_profile && error?.code === "PGRST202") throw new AITrackerMigrationRequired();
  if (error?.code === "22023" && error.message.startsWith("Idempotency key")) throw new IdempotencyConflict();
  if (error) throw new Error(`Story persistence failed (${error.code || "database"})`);
  return upsertResult.parse(data);
}

export async function getStory(client: SupabaseClient, id: string) {
  const read = (fields: string) => client.from("stories").select(fields).eq("id", id).maybeSingle();
  let response = await read(`${storyFields},ai_profile`);
  if (response.error?.code === "42703") response = await read(storyFields);
  if (response.error) throw new Error("Could not read the story");
  return response.data ? storyView.parse(response.data) : null;
}

export async function listStories(client: SupabaseClient, options: {
  query?: string; kind?: AIKind; launch?: LaunchType | "all"; page?: number; size?: number; withCount?: boolean;
} = {}): Promise<{ stories: Story[]; count: number; setupRequired?: boolean }> {
  const size = options.size ?? 12;
  const first = ((options.page ?? 1) - 1) * size;
  const { launch, query } = options;
  const kind = launch ? "technology" : options.kind;
  function read(withProfile: boolean) {
    let request = client.from("stories").select(
      withProfile ? `${storyFields},ai_profile` : storyFields,
      options.withCount === false ? undefined : { count: "exact" },
    );
    if (query) request = withProfile
      ? request.textSearch("intelligence_search", query, { config: "english", type: "websearch" })
      : request.ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`);
    if (kind && withProfile) request = request.eq("intelligence_kind", kind);
    if (launch === "all") request = request.not("ai_profile->launch", "is", null);
    else if (launch) request = request.eq("ai_profile->launch->>type", launch);
    if (kind === "job") request = request.not("ai_profile", "cs", '{"job":{"status":"closed"}}');
    if (kind === "paper" && !withProfile) request = request.not("research_papers", "is", null);
    return request.order(withProfile ? "intelligence_date" : "first_seen_at", { ascending: false })
      .order("id").range(first, first + size - 1);
  }
  let response = await read(true);
  if (response.error?.code === "42703") {
    if (kind && kind !== "paper") return { stories: [], count: 0, setupRequired: true };
    response = await read(false);
  }
  const { data, count, error } = response;
  if (error?.code === "PGRST103" && first > 0) {
    const fallback = await listStories(client, { ...options, page: 1, size: 1 });
    return { stories: [], count: fallback.count };
  }
  if (error) throw new Error("Could not load developments");
  return { stories: z.array(storyView).parse(data), count: count ?? 0 };
}

export async function listSources(client: SupabaseClient, limit = 100) {
  const { data, error } = await client.from("sources")
    .select("id,name,base_url,source_type,enabled,last_successful_fetch")
    .order("enabled", { ascending: false }).order("name").order("id").limit(limit);
  if (error) throw new Error("Could not load sources");
  return z.array(sourceView).parse(data);
}

export async function listRuns(client: SupabaseClient, limit = 10) {
  const { data, error } = await client.from("ingestion_runs").select(runFields)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error("Could not load ingestion runs");
  return z.array(runView).parse(data);
}

export async function getDashboardMetrics(client: SupabaseClient) {
  const [stories, papers, sources, run] = await Promise.all([
    client.from("stories").select("id", { count: "exact", head: true }),
    countPapers(client),
    client.from("sources").select("id", { count: "exact", head: true }),
    client.from("ingestion_runs").select(runFields).in("execution_status", ["completed", "partial"])
      .order("completed_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if ([stories, papers, sources, run].some((result) => result.error)) throw new Error("Could not load dashboard metrics");
  return {
    stories: stories.count ?? 0, papers: papers.count ?? 0, sources: sources.count ?? 0,
    lastSuccessful: run.data ? runView.parse(run.data) : null,
  };
}

async function countPapers(client: SupabaseClient) {
  const response = await client.from("stories").select("id", { count: "exact", head: true }).eq("intelligence_kind", "paper");
  if (response.status === 400) return client.from("research_papers").select("id", { count: "exact", head: true });
  return response;
}
