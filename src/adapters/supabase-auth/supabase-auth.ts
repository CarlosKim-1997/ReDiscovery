import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";
import type { TrustedAuthPort } from "@/ports/trusted-auth";
import { identityIdSchema } from "@/domain/identity/account";

type AuthClient = ReturnType<typeof createServerClient>["auth"];
export class SupabaseAuthAdapter implements TrustedAuthPort {
  constructor(private readonly auth: AuthClient) {}
  async getIdentity() {
    const { data, error } = await this.auth.getClaims();
    if (error || !data?.claims || data.claims.role !== "authenticated" || data.claims.is_anonymous === true) return undefined;
    const subject = identityIdSchema.safeParse(data.claims.sub);
    return subject.success ? { externalSubject: `supabase:${subject.data}` } : undefined;
  }
  async startGoogleLogin(callbackUrl: string) {
    const { data, error } = await this.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl, skipBrowserRedirect: true } });
    if (error || !data.url) throw new Error("AUTH_START_FAILED");
    return data.url;
  }
  async exchangeCode(code: string) {
    const { error } = await this.auth.exchangeCodeForSession(code);
    if (error) throw new Error("AUTH_EXCHANGE_FAILED");
  }
  async logout() {
    const { error } = await this.auth.signOut({ scope: "local" });
    if (error) throw new Error("AUTH_LOGOUT_FAILED");
  }
}
export function createSupabaseServerClient(url: string, key: string, cookies: CookieMethodsServer) {
  return createServerClient(url, key, { cookies });
}
