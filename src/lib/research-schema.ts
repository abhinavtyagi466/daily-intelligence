import { z } from "zod";
import { aiKind, domains, httpsUrl, runView } from "./story-schema";

const text = (max: number) => z.string().trim().min(1).max(max);
const timestamp = z.iso.datetime({ offset: true });
const domain = z.enum(domains);
const slug = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);

const signal = z.strictObject({
  name: text(100),
  measures: text(500),
  limitation: text(500),
});
const scenario = z.strictObject({
  title: text(100),
  condition: text(500),
  implication: text(500),
  watch_for: text(500),
});
const researchReference = z.strictObject({
  title: text(200),
  url: httpsUrl,
});
const measurement = z.strictObject({
  label: text(100),
  unit: text(40),
  coverage: text(240),
  source_url: httpsUrl,
  points: z.array(z.strictObject({ date: z.iso.date(), value: z.number() })).min(2).max(24)
    .refine((points) => new Set(points.map(({ date }) => date)).size === points.length, "Use one observation per date"),
});

const marketResearchContent = z.strictObject({
  signals: z.array(signal).min(1).max(8),
  scenarios: z.array(scenario).max(6),
  limitations: z.array(text(500)).max(8),
  references: z.array(researchReference).max(10),
  measurements: z.array(measurement).max(4).optional(),
});

const researchSummary = z.object({
  slug,
  title: text(200),
  summary: text(2000),
});
export const marketResearchInput = researchSummary.extend({ content: marketResearchContent }).strict();
export const marketResearchView = marketResearchInput.extend({
  id: z.uuid(), created_at: timestamp, updated_at: timestamp,
});
export const marketResearchReference = z.strictObject({ slug });
export const marketResearchList = z.strictObject({ limit: z.number().int().min(1).max(20).default(10) });
export const marketResearchSaved = z.object({ research_id: z.uuid(), slug, changed: z.boolean() });

export const searchIntelligenceInput = z.strictObject({
  query: z.string().trim().max(200).default(""),
  domains: z.array(domain).max(domains.length).default([]),
  kind: aiKind.optional(),
  start_date: z.iso.date().optional(),
  end_date: z.iso.date().optional(),
  limit: z.number().int().min(1).max(25).default(10),
}).refine(({ start_date, end_date }) => !start_date || !end_date || start_date <= end_date, {
  message: "The end date must be on or after the start date", path: ["end_date"],
});

export const searchIntelligenceResult = z.object({
  story_id: z.uuid(), title: z.string(), summary: z.string(), canonical_url: httpsUrl,
  published_at: timestamp.nullable(), first_seen_at: timestamp, primary_domain: domain,
  source_count: z.number().int().nonnegative(),
  kind: z.union([aiKind, z.literal("development")]).optional(),
});

export const briefingResult = z.object({
  since: z.iso.date(), through: z.iso.date(),
  trends: z.array(searchIntelligenceResult),
  technologies: z.array(searchIntelligenceResult),
  jobs: z.array(searchIntelligenceResult),
  papers: z.array(searchIntelligenceResult),
});

export const aiWorkspaceSnapshot = z.object({
  counts: z.partialRecord(aiKind, z.number().int().nonnegative()),
  skills: z.array(z.object({ name: z.string(), count: z.number().int().nonnegative() })),
});

export const workspaceAnalytics = z.object({
  daily: z.array(z.object({ date: z.iso.date(), count: z.number().int().nonnegative() })),
  domains: z.array(z.object({ code: domain, name: z.string(), count: z.number().int().nonnegative() })),
});

export const systemStatus = z.object({
  database: z.literal("reachable"),
  mcp: z.literal("reachable"),
  developments: z.number().int().nonnegative(),
  research_papers: z.number().int().nonnegative(),
  registered_sources: z.number().int().nonnegative(),
  latest_ingestion: runView.nullable(),
  last_successful_ingestion: timestamp.nullable(),
});

export type MarketResearchInput = z.output<typeof marketResearchInput>;
export type MarketResearchContent = z.output<typeof marketResearchContent>;
export type MarketResearch = z.output<typeof marketResearchView>;
export type MarketMeasurement = z.output<typeof measurement>;
export type WorkspaceAnalytics = z.output<typeof workspaceAnalytics>;
export type AIWorkspaceSnapshot = z.output<typeof aiWorkspaceSnapshot>;
