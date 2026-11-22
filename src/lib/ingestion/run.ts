import "server-only";

import { z } from "zod";
import { createServiceClient } from "../supabase/service";
import { upsertStory } from "../stories";
import { crossref } from "./crossref";

export async function ingestCrossref(actor: string) {
  const client = createServiceClient();
  const { data, error } = await client.rpc("start_crossref_ingestion", { p_actor: actor });
  if (error) throw new Error("Could not start ingestion");
  if (!data) return { status: "busy" } as const;
  const id = z.uuid().parse(data);
  const end = new Date();
  const start = new Date(end.getTime() - 365 * 86_400_000);
  const dateWindow = { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  const errors: string[] = [];
  let cursor: string | undefined;
  let collected = 0;
  let created = 0;
  let stored = 0;
  let rejected = 0;
  let fetched = false;

  for (let page = 0; page < 2; page++) {
    try {
      const result = await crossref.fetchUpdates({ ...dateWindow, cursor });
      fetched = true;
      collected += result.items.length;
      const outcomes = await Promise.allSettled(result.items.map(async (record) => {
        const { story, paper } = crossref.normalize(record);
        return upsertStory(client, story, actor, undefined, paper);
      }));
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          stored++;
          if (outcome.value.operation === "inserted") created++;
        } else {
          rejected++;
        }
      }
      if (!result.cursor) break;
      cursor = result.cursor;
    } catch {
      errors.push("Crossref could not return the requested page. Try again later.");
      break;
    }
  }

  if (rejected) errors.push(`${rejected} record(s) failed validation or persistence.`);
  const status = errors.length === 0 ? "completed" : fetched && (collected === 0 || stored > 0) ? "partial" : "failed";
  const finished = await client.rpc("finish_crossref_ingestion", {
    p_id: id, p_actor: actor, p_status: status, p_collected: collected,
    p_created: created, p_rejected: rejected, p_errors: errors,
  });
  if (finished.error) throw new Error("Could not finalize ingestion");
  return { status, created, id } as const;
}
