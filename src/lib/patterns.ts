import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { patternSnapshot, storyConnectionSaved, type PatternReport, type StoryConnectionInput } from "./pattern-schema";

export class StoryConnectionError extends Error {}

export async function getAIPatterns(client: SupabaseClient, days: number, includeConnections = true): Promise<PatternReport | null> {
  const args = { p_days: days };
  let response = await client.rpc("get_ai_patterns", includeConnections ? args : { ...args, p_include_connections: false });
  if (!includeConnections && response.error?.code === "PGRST202") response = await client.rpc("get_ai_patterns", args);
  const { data, error } = response;
  if (error?.code === "PGRST202") return null;
  if (error) throw new Error("Could not load AI coverage patterns");

  const snapshot = patternSnapshot.parse(data);
  const summary = snapshot.patterns.slice(0, 4).map(({ label, current_count, previous_count }) => {
    if (current_count === previous_count) return `Coverage of ${label} held steady at ${current_count} saved updates in each period.`;
    const movement = current_count > previous_count ? "rose" : "fell";
    return `Coverage of ${label} ${movement} from ${previous_count} to ${current_count} saved updates.`;
  });
  return { ...snapshot, summary };
}

export async function saveStoryConnection(client: SupabaseClient, input: StoryConnectionInput, actor: string) {
  const { data, error } = await client.rpc("save_story_connection", {
    p_earlier: input.earlier_story_id, p_later: input.later_story_id,
    p_evidence_url: input.evidence_url, p_reason: input.reason, p_actor: actor,
  });
  if (error?.code === "PGRST202") throw new StoryConnectionError("Apply the story connections migration to save relationships.");
  if (error?.code === "22023") throw new StoryConnectionError("Use two existing stories in chronological order.");
  if (error) throw new Error("Could not save the story connection");
  return storyConnectionSaved.parse(data);
}
