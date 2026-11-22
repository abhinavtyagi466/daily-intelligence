import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { patternSnapshot, type PatternReport } from "./pattern-schema";

export async function getAIPatterns(client: SupabaseClient, days: number): Promise<PatternReport | null> {
  const { data, error } = await client.rpc("get_ai_patterns", { p_days: days });
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
