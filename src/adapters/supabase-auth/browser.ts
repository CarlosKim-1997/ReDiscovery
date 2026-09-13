"use client";
import { createBrowserClient } from "@supabase/ssr";

// Available for cookie-based SSR integration. Login itself remains server-started;
// no client session/user object is used for product authorization.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("AUTH_NOT_CONFIGURED");
  return createBrowserClient(url, key);
}
