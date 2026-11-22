import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { publicSupabaseConfig } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = publicSupabaseConfig();
  response.headers.set("Cache-Control", "private, no-store");
  if (!config || !request.cookies.getAll().some(({ name }) => name.startsWith("sb-"))) return response;

  const client = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        for (const { name, value } of values) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of values) response.cookies.set(name, value, options);
        response.headers.set("Cache-Control", "private, no-store");
      },
    },
  });
  await client.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!api/|\\.well-known/|_next/|favicon.ico).*)"],
};
