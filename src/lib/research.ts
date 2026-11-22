import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  marketResearchSaved, marketResearchView, searchIntelligenceResult, workspaceAnalytics,
  type MarketResearchInput, type searchIntelligenceInput,
} from "./research-schema";
import { getDashboardMetrics, listRuns } from "./stories";

const researchFields = "id,slug,title,summary,content,created_at,updated_at";

export class ResearchMigrationRequired extends Error {}

export async function listMarketResearch(client: SupabaseClient, limit = 10) {
  const { data, error } = await client.from("market_research").select(researchFields)
    .order("updated_at", { ascending: false }).order("id").limit(limit);
  if (error?.code === "PGRST205") return null;
  if (error) throw new Error("Could not list market research");
  return z.array(marketResearchView).parse(data);
}

export async function getMarketResearch(client: SupabaseClient, slug: string) {
  const { data, error } = await client.from("market_research").select(researchFields).eq("slug", slug).maybeSingle();
  if (error?.code === "PGRST205") throw new ResearchMigrationRequired();
  if (error) throw new Error("Could not load market research");
  return data ? marketResearchView.parse(data) : null;
}

export async function saveMarketResearch(client: SupabaseClient, input: MarketResearchInput, actor: string) {
  const { data, error } = await client.rpc("save_market_research", { p_entry: input, p_actor: actor });
  if (error?.code === "PGRST202") throw new ResearchMigrationRequired();
  if (error) throw new Error("Could not save market research");
  return marketResearchSaved.parse(data);
}

export async function searchIntelligence(client: SupabaseClient, input: z.output<typeof searchIntelligenceInput>) {
  const { data, error } = await client.rpc("search_intelligence", {
    p_query: input.query,
    p_domains: input.domains,
    p_start: input.start_date ?? null,
    p_end: input.end_date ?? null,
    p_limit: input.limit,
  });
  if (error?.code === "PGRST202") throw new ResearchMigrationRequired();
  if (error) throw new Error("Could not search developments");
  return z.array(searchIntelligenceResult).parse(data);
}

export async function getWorkspaceAnalytics(client: SupabaseClient, days: number) {
  const { data, error } = await client.rpc("get_workspace_analytics", { p_days: days });
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error("Could not load workspace analytics");
  return workspaceAnalytics.parse(data);
}

export async function getSystemStatus(client: SupabaseClient) {
  const [metrics, runs] = await Promise.all([getDashboardMetrics(client), listRuns(client, 1)]);
  return {
    database: "reachable" as const,
    mcp: "reachable" as const,
    developments: metrics.stories,
    research_papers: metrics.papers,
    registered_sources: metrics.sources,
    latest_ingestion: runs[0] ?? null,
    last_successful_ingestion: metrics.lastSuccessful?.completed_at ?? null,
  };
}
