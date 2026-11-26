import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const targetFields = z.strictObject({
  kind: z.enum(["story", "market_research", "story_connection", "story_source", "submitted_source"]),
  id: z.uuid(),
  related_id: z.uuid().optional(),
});
const validTarget = ({ kind, id, related_id }: z.output<typeof targetFields>) =>
  kind === "story_connection" ? related_id !== undefined && id !== related_id : related_id === undefined;

export const deletePreviewInput = targetFields.refine(validTarget, "Supply two different story IDs for a story connection.");
export const deleteRecordInput = targetFields.extend({
  revision: z.string().regex(/^[0-9a-f]{64}$/),
}).refine(validTarget, "Supply two different story IDs for a story connection.");
export const deleteResult = z.object({
  status: z.enum(["ready", "deleted", "blocked", "not_found", "changed"]),
  title: z.string().optional(),
  revision: z.string().optional(),
  reason: z.string().optional(),
  dependents: z.object({
    source_links: z.number().int().nonnegative().optional(),
    paper_metadata: z.number().int().nonnegative().optional(),
    domain_assignments: z.number().int().nonnegative().optional(),
    story_connections: z.number().int().nonnegative().optional(),
  }).optional(),
});

export class WorkspaceDeleteMigrationRequired extends Error {}

export async function workspaceDelete(
  client: SupabaseClient, target: z.output<typeof targetFields>, actor: string, revision?: string,
) {
  const { data, error } = await client.rpc("mcp_workspace_delete", {
    p_kind: target.kind, p_id: target.id, p_related_id: target.related_id ?? null, p_actor: actor,
    p_revision: revision ?? null,
  });
  if (error?.code === "PGRST202") throw new WorkspaceDeleteMigrationRequired();
  if (error) throw new Error("Workspace deletion failed");
  return deleteResult.parse(data);
}
