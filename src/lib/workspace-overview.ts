import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAIPatterns } from "./patterns";
import { getReadingPriorities, readingPriority } from "./reading-priorities";
import { getAIWorkspaceSnapshot, getWorkspaceAnalytics } from "./research";
import { aiWorkspaceSnapshot, workspaceAnalytics } from "./research-schema";
import { aiKind, httpsUrl, runView, storyKind } from "./story-schema";
import { listRuns, listStories } from "./stories";
import { workspaceDay } from "./workspace-date";

export const workspaceOverviewInput = z.strictObject({ days: z.union([z.literal(7), z.literal(14), z.literal(30)]).default(14) });
export const workspaceOverviewResult = z.object({
  days: z.number().int(),
  date_ist: z.iso.date(),
  category_snapshot: aiWorkspaceSnapshot.nullable(),
  activity: workspaceAnalytics.nullable(),
  coverage_summary: z.array(z.string()).nullable(),
  latest_ingestion: runView.nullable(),
  latest_updates: z.array(z.object({
    story_id: z.uuid(), title: z.string(), summary: z.string(), canonical_url: httpsUrl,
    kind: z.union([aiKind, z.literal("development")]), date_ist: z.iso.date(),
    is_today: z.boolean(), source_count: z.number().int().nonnegative(),
  })),
  reading_priorities: z.array(readingPriority),
});

export function loadWorkspaceOverview(client: SupabaseClient, days: number) {
  return {
    feed: listStories(client, { size: 12, withCount: false }),
    snapshot: getAIWorkspaceSnapshot(client, days),
    analytics: getWorkspaceAnalytics(client, days),
    patterns: getAIPatterns(client, days, false),
    runs: listRuns(client, 1),
  };
}

export async function getWorkspaceOverview(client: SupabaseClient, days: number) {
  const { feed, snapshot, analytics, patterns, runs } = loadWorkspaceOverview(client, days);
  const [entries, category_snapshot, activity, report, history] = await Promise.all([feed, snapshot, analytics, patterns, runs]);
  const date_ist = workspaceDay();
  return {
    days, date_ist, category_snapshot, activity, coverage_summary: report?.summary.slice(0, 2) ?? null,
    latest_ingestion: history[0] ?? null,
    latest_updates: entries.stories.slice(0, 6).map((story) => {
      const date = workspaceDay(story.original_published_at ?? story.first_seen_at);
      return {
        story_id: story.id, title: story.title, summary: story.summary, canonical_url: story.canonical_url,
        kind: storyKind(story), date_ist: date, is_today: date === date_ist, source_count: story.story_sources.length,
      };
    }),
    reading_priorities: getReadingPriorities(entries.stories),
  };
}
