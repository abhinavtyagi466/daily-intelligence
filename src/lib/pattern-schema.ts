import { z } from "zod";
import { httpsUrl } from "./story-schema";

const period = z.object({
  from: z.iso.date(),
  through: z.iso.date(),
  stories: z.number().int().nonnegative(),
});

const evidence = z.object({
  id: z.uuid(),
  title: z.string(),
  summary: z.string(),
  canonical_url: httpsUrl,
  day: z.iso.date(),
  kind: z.enum(["trend", "technology", "paper", "development"]),
  is_current: z.boolean(),
});
const connectionStory = z.object({ id: z.uuid(), title: z.string(), url: httpsUrl });

export const storyConnectionInput = z.strictObject({
  earlier_story_id: z.uuid(),
  later_story_id: z.uuid(),
  evidence_url: httpsUrl,
  reason: z.string().trim().min(1).max(500),
}).refine(({ earlier_story_id, later_story_id }) => earlier_story_id !== later_story_id, "Use two different stories");
export const storyConnectionSaved = z.object({
  earlier_story_id: z.uuid(), later_story_id: z.uuid(), changed: z.boolean(),
});

export const patternInput = z.strictObject({ days: z.number().int().min(1).max(30).default(7) });
export const patternSnapshot = z.object({
  current: period,
  previous: period,
  patterns: z.array(z.object({
    label: z.string(),
    current_count: z.number().int().nonnegative(),
    previous_count: z.number().int().nonnegative(),
    evidence: z.array(evidence),
  })),
  topic_connections: z.array(z.object({
    left_topic: z.string(), right_topic: z.string(),
    current_count: z.number().int().nonnegative(), previous_count: z.number().int().nonnegative(),
    evidence: z.array(evidence),
  })).optional(),
  story_connections: z.array(z.object({
    earlier: connectionStory, later: connectionStory.extend({ day: z.iso.date() }),
    relationship: z.enum(["cites", "source_attributed"]),
    reason: z.string(), evidence_url: httpsUrl,
  })).optional(),
});

export const patternReport = patternSnapshot.extend({ summary: z.array(z.string()) });
export type PatternReport = z.output<typeof patternReport>;
export type StoryConnectionInput = z.output<typeof storyConnectionInput>;
