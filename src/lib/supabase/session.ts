import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { publicSupabaseConfig } from "./config";

export async function createSessionClient() {
  const config = publicSupabaseConfig();
  if (!config) throw new Error("Supabase authentication is unconfigured");
  const store = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(values) {
        try {
          for (const { name, value, options } of values) store.set(name, value, options);
        } catch {
          // The proxy refreshes cookies before a read-only Server Component renders.
        }
      },
    },
  });
}

export async function getDashboardAccess() {
  if (!publicSupabaseConfig()) return null;
  const client = await createSessionClient();
  const { data } = await client.auth.getClaims();
  if (!data?.claims?.sub) return null;

  const { data: role, error } = await client.rpc("get_dashboard_role");
  const setupRequired = error?.code === "PGRST202";
  if (error && !setupRequired) throw new Error("Unable to verify dashboard membership");
  return {
    client,
    role: role === "reader" || role === "operator" ? role : null,
    userId: data.claims.sub,
    setupRequired,
  };
}

export async function requireDashboardAccess() {
  const access = await getDashboardAccess();
  if (!access?.role) redirect("/login");
  return access;
}
