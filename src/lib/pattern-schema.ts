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
});

export const patternReport = patternSnapshot.extend({ summary: z.array(z.string()) });
export type PatternReport = z.output<typeof patternReport>;
