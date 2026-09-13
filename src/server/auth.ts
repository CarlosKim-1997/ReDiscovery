import "server-only";
import { cookies } from "next/headers";
import { config, services } from "./container";
import { createSupabaseServerClient, SupabaseAuthAdapter } from "@/adapters/supabase-auth/supabase-auth";
export { sealPendingClaim, readPendingClaim, PENDING_CLAIM_COOKIE, PENDING_CLAIM_MAX_AGE } from "@/adapters/supabase-auth/pending-claim";
export { requireSameOrigin } from "./auth-policy";

export function authConfiguration() {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key, AUTH_APP_ORIGIN: origin, AUTH_COOKIE_SECRET: secret } = config;
  return url && key && origin && secret ? { url, key, origin, secret } : undefined;
}
export async function authenticationDependencies() {
  const configuration = authConfiguration();
  if (!configuration) throw new Error("AUTH_NOT_CONFIGURED");
  const jar = await cookies();
  const client = createSupabaseServerClient(configuration.url, configuration.key, {
    getAll: () => jar.getAll(),
    setAll: values => { for (const { name, value, options } of values) jar.set(name, value, options); },
  });
  return { auth: new SupabaseAuthAdapter(client.auth), store: services.store, clock: services.clock };
}
