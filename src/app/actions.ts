"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ingestCrossref } from "@/lib/ingestion/run";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { createSessionClient, getDashboardAccess } from "@/lib/supabase/session";

export type ActionState = { message: string; ok?: boolean };

const credentials = z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) });

export async function signIn(_state: ActionState, input: FormData): Promise<ActionState> {
  if (!publicSupabaseConfig()) return { message: "Supabase authentication is not configured." };
  const parsed = credentials.safeParse({ email: input.get("email"), password: input.get("password") });
  if (!parsed.success) return { message: "Enter a valid email and password." };
  const client = await createSessionClient();
  const { error } = await client.auth.signInWithPassword(parsed.data);
  if (error) return { message: "Sign-in failed. Check your credentials and try again." };
  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut() {
  if (publicSupabaseConfig()) {
    const client = await createSessionClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw new Error("Unable to sign out");
  }
  revalidatePath("/", "layout");
  redirect("/login");
}

export async function runResearch(): Promise<ActionState> {
  const access = await getDashboardAccess();
  if (access?.role !== "operator") return { message: "Operator access is required." };
  try {
    const run = await ingestCrossref(`dashboard:${access.userId}`);
    revalidatePath("/");
    switch (run.status) {
      case "busy": return { message: "A Crossref run is already in progress." };
      case "failed": return { message: "Crossref ingestion failed. See System Health for details." };
      case "partial": return { message: `Crossref completed with errors. Added ${run.created} new stories.` };
      case "completed":
        return { ok: true, message: run.created ? `Added ${run.created} new stories from Crossref.` : "Crossref run completed. No new stories." };
    }
  } catch {
    revalidatePath("/");
    return { message: "The run could not be completed. Check System Health and try again." };
  }
}
