import { z } from "zod";

export const domains = ["ai-ml", "computing", "geopolitics", "startups", "psychology", "neuroscience"] as const;
export const aiKinds = ["trend", "technology", "job", "paper"] as const;
export const aiKind = z.enum(aiKinds);

export const httpsUrl = z.string().trim().max(2048).url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS URL without credentials");

const submittedDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const storedDate = z.iso.datetime({ offset: true });
const label = z.string().trim().min(1).max(100);
const note = z.string().trim().min(1).max(800);
const keywords = z.array(label).max(12).refine((values) =>
  new Set(values.map((value) => value.toLowerCase())).size === values.length, "Use each keyword once");
const profileFields = {
  topics: keywords.optional(),
  why_it_matters: note.optional(),
  watch_next: note.optional(),
};
export const aiProfile = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("trend"), ...profileFields }),
  z.strictObject({ kind: z.literal("technology"), ...profileFields, docs_url: httpsUrl.optional() }),
  z.strictObject({
    kind: z.literal("job"), ...profileFields,
    job: z.strictObject({
      company: label,
      location: label.optional(),
      experience: label.optional(),
      skills: keywords,
      requirements: z.array(note).min(1).max(10),
      apply_url: httpsUrl,
      checked_on: z.iso.date().optional(),
      status: z.enum(["listed", "closed", "unknown"]).default("unknown"),
    }),
  }),
  z.strictObject({
    kind: z.literal("paper"), ...profileFields,
    code_url: httpsUrl.optional(),
    reading_focus: note.optional(),
  }),
]);

const sourceRecord = z.strictObject({
  source_name: z.string().trim().min(1).max(150),
  source_url: httpsUrl,
  source_title: z.string().trim().min(1).max(500),
  published_at: submittedDate.optional(),
});

export const storyInput = z.strictObject({
  canonical_url: httpsUrl,
  title: z.string().trim().min(1).max(500),
  summary: z.string().trim().min(1).max(4000),
  published_at: submittedDate.optional(),
  domains: z.array(z.enum(domains)).min(1).max(domains.length)
    .refine((values) => new Set(values).size === values.length, "Each domain may appear once"),
  source_records: z.array(sourceRecord).min(1).max(10),
  ai_profile: aiProfile.optional(),
});

export const storyUpsertInput = storyInput.extend({
  idempotency_key: z.string().trim().min(8).max(128).regex(/^[a-zA-Z0-9._:-]+$/),
});

export const storyReference = z.strictObject({ story_id: z.uuid() });
export const upsertResult = z.object({
  story_id: z.uuid(),
  operation: z.enum(["inserted", "updated", "existing"]),
  status: z.literal("stored"),
  replayed: z.boolean(),
});

const domainSummary = z.object({ code: z.enum(domains), name: z.string() });
const paperSummary = z.object({
  doi: z.string(), title: z.string(), authors: z.array(z.string()),
  publication_type: z.string(), peer_review_status: z.string(), paper_url: httpsUrl,
});

export const storyView = z.object({
  id: z.uuid(),
  canonical_url: httpsUrl,
  title: z.string(),
  summary: z.string(),
  original_published_at: storedDate.nullable(),
  first_seen_at: storedDate,
  last_updated_at: storedDate,
  status: z.literal("source_reported"),
  domain: domainSummary,
  story_domains: z.array(z.object({ is_primary: z.boolean(), domain: domainSummary })),
  story_sources: z.array(z.object({
    id: z.uuid(), source_url: httpsUrl, source_title: z.string(), published_at: storedDate.nullable(),
    retrieved_at: storedDate, source_role: z.enum(["citation_metadata", "submitted_reference"]),
    verification_status: z.literal("source_reported"),
    source: z.object({ name: z.string() }),
  })),
  research_papers: paperSummary.nullable(),
  ai_profile: aiProfile.nullable().optional(),
});

export const runView = z.object({
  id: z.uuid(), started_at: storedDate, completed_at: storedDate.nullable(),
  execution_status: z.enum(["running", "completed", "partial", "failed"]),
  records_collected: z.number().int(), records_created: z.number().int(),
  records_rejected: z.number().int(), errors: z.array(z.string()),
  source: z.object({ name: z.string() }),
});

export const sourceView = z.object({
  id: z.uuid(), name: z.string(), base_url: httpsUrl, source_type: z.enum(["research_registry", "external"]),
  enabled: z.boolean(), last_successful_fetch: storedDate.nullable(),
});

export type StoryInput = z.output<typeof storyInput>;
export type Story = z.output<typeof storyView>;
export type AIKind = z.output<typeof aiKind>;
export type IngestionRun = z.output<typeof runView>;

export function storyKind(story: Story): AIKind | "development" {
  if (story.ai_profile) return story.ai_profile.kind;
  if (story.research_papers || /^https:\/\/([a-z0-9-]+\.)*arxiv\.org\/(abs|pdf|html)\//i.test(story.canonical_url)) return "paper";
  return "development";
}

export function canonicalUrl(value: string) {
  const url = new URL(value);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_.+|fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  if (url.hostname === "doi.org" || url.hostname === "dx.doi.org") {
    try {
      const doi = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
      if (/^10\.\d{4,9}\/\S+$/.test(doi)) {
        return "https://doi.org/" + doi.split("/").map(encodeURIComponent).join("/");
      }
    } catch {
      // Preserve a malformed escape as part of the original URL.
    }
  }
  return url.href;
}
