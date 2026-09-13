import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "./supabase-auth";

export async function refreshAuthCookies(request: NextRequest, url: string, key: string) {
  let response = NextResponse.next({ request });
  const client = createSupabaseServerClient(url, key, {
    getAll: () => request.cookies.getAll(),
    setAll: (values, headers) => {
      for (const { name, value } of values) request.cookies.set(name, value);
      response = NextResponse.next({ request });
      for (const { name, value, options } of values) response.cookies.set(name, value, options);
      for (const [name, value] of Object.entries(headers ?? {})) response.headers.set(name, value);
    },
  });
  try { await client.auth.getClaims(); } catch { /* Auth unavailable must not block anonymous Reveal. */ }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
