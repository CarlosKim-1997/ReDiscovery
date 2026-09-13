import { describe, expect, it, vi } from "vitest";
import { authenticatedAccount, completeAuthentication, validateClaimIntent } from "@/application/identity/authentication";
import { SupabaseAuthAdapter } from "@/adapters/supabase-auth/supabase-auth";
import { readPendingClaim, sealPendingClaim } from "@/adapters/supabase-auth/pending-claim";
import { authFixture, fixtureId, AUTH_FIXTURE_DEVICE as device, AUTH_FIXTURE_SESSION as session, AUTH_FIXTURE_TIME as at } from "../support/m6-auth-fixture";

describe("M6-B verified identity and current-session authentication", () => {
  it("does not resolve an account for signed-out identity", async () => {
    const f = authFixture(); expect(await authenticatedAccount(f.deps)).toBeUndefined(); expect(f.accounts.size).toBe(0);
  });
  it("uses only verified JWT sub, never email/name/session-cookie user", async () => {
    const getClaims = vi.fn().mockResolvedValue({ data: { claims: { sub: fixtureId(3), role: "authenticated", email: "ignored@example.test", name: "ignored" } }, error: null });
    const adapter = new SupabaseAuthAdapter({ getClaims } as unknown as ConstructorParameters<typeof SupabaseAuthAdapter>[0]);
    expect(await adapter.getIdentity()).toEqual({ externalSubject: `supabase:${fixtureId(3)}` });
    expect(getClaims).toHaveBeenCalledTimes(1);
  });
  it.each([
    { data: null, error: { message: "invalid signature" } },
    { data: { claims: { sub: fixtureId(3), role: "anon" } }, error: null },
    { data: { claims: { sub: fixtureId(3), role: "authenticated", is_anonymous: true } }, error: null },
    { data: { claims: { sub: "email@example.test", role: "authenticated" } }, error: null },
  ])("rejects unverified/non-user identities", async result => {
    const adapter = new SupabaseAuthAdapter({ getClaims: vi.fn().mockResolvedValue(result) } as unknown as ConstructorParameters<typeof SupabaseAuthAdapter>[0]);
    expect(await adapter.getIdentity()).toBeUndefined();
  });
  it("uses Google PKCE only and exchanges/logs out without exposing returned tokens", async () => {
    const client = { signInWithOAuth: vi.fn().mockResolvedValue({ data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" }, error: null }), exchangeCodeForSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "must-not-escape" } }, error: null }), signOut: vi.fn().mockResolvedValue({ error: null }) };
    const adapter = new SupabaseAuthAdapter(client as unknown as ConstructorParameters<typeof SupabaseAuthAdapter>[0]);
    await adapter.startGoogleLogin("https://app.test/auth/callback");
    expect(client.signInWithOAuth).toHaveBeenCalledWith({ provider: "google", options: { redirectTo: "https://app.test/auth/callback", skipBrowserRedirect: true } });
    expect(await adapter.exchangeCode("code")).toBeUndefined(); expect(await adapter.logout()).toBeUndefined();
    expect(client.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("resolves the same verified subject into the same local Account", async () => {
    const f = authFixture(); await f.auth.exchangeCode("valid");
    const first = await authenticatedAccount(f.deps); expect(await authenticatedAccount(f.deps)).toBe(first); expect(f.accounts.size).toBe(1);
  });
  it("validates only the explicit device-owned official session", async () => {
    const f = authFixture(); expect(await validateClaimIntent(f.deps, session, device)).toBe(session);
    await expect(validateClaimIntent(f.deps, session, fixtureId(9))).rejects.toThrow("INVALID_CURRENT_SESSION");
    f.sessions.set(session, { ...f.sessions.get(session)!, attemptType: "PRACTICE" });
    await expect(validateClaimIntent(f.deps, session, device)).rejects.toThrow("NOT_OFFICIAL");
  });
  it("login without pending intent makes zero claims", async () => {
    const f = authFixture(); expect(await completeAuthentication(f.deps, "valid", undefined, device)).toEqual({ destination: "/", claimApplied: false, claimRequested: false }); expect(f.claims).toEqual([]);
  });
  it("claims exactly one current session, preserves historical isolation and replay timestamp", async () => {
    const f = authFixture(); expect(await completeAuthentication(f.deps, "valid", session, device)).toEqual({ destination: `/result/${session}`, claimApplied: true, claimRequested: true });
    expect(f.claims).toEqual([session]); expect(f.sessions.get(fixtureId(4))?.accountId).toBeUndefined(); expect(f.sessions.get(fixtureId(5))?.accountId).toBeUndefined();
    await expect(completeAuthentication(f.deps, undefined, session, device)).rejects.toThrow("AUTH_CODE_REQUIRED");
    expect(f.sessions.get(session)?.accountClaimedAt).toEqual(at); expect(f.accounts.size).toBe(1);
    await completeAuthentication(f.deps, "valid", undefined, device); expect(f.claims).toEqual([session]);
  });
  it.each(["foreign-device", "practice", "missing", "other-account"])("keeps verified login on %s claim failure without fallback", async failure => {
    const f = authFixture(); const original = f.sessions.get(session)!;
    if (failure === "foreign-device") f.sessions.set(session, { ...original, anonymousDeviceId: fixtureId(9) });
    if (failure === "practice") f.sessions.set(session, { ...original, attemptType: "PRACTICE" });
    if (failure === "missing") f.sessions.delete(session);
    if (failure === "other-account") f.sessions.set(session, { ...original, accountId: fixtureId(77), accountClaimedAt: at });
    const result = await completeAuthentication(f.deps, "valid", session, device);
    expect(result.claimApplied).toBe(false); expect(f.auth.identity).toBeDefined(); expect(f.claims).toEqual([session]);
    expect(f.sessions.get(fixtureId(4))?.accountId).toBeUndefined(); expect(f.auth.logouts).toBe(0);
    if (failure === "other-account") expect(f.sessions.get(session)?.accountId).toBe(fixtureId(77));
  });
  it("logout preserves claimed ownership and anonymous provenance", async () => {
    const f = authFixture(); await completeAuthentication(f.deps, "valid", session, device); const claimed = f.sessions.get(session);
    await f.auth.logout(); expect(await authenticatedAccount(f.deps)).toBeUndefined(); expect(f.sessions.get(session)).toBe(claimed); expect(claimed?.anonymousDeviceId).toBe(device);
  });
  it("signed pending claim contains one session only and rejects tampering/stale/missing", () => {
    const secret = "test-only-secret-not-a-live-credential";
    const sealed = sealPendingClaim(session, at, secret);
    expect(readPendingClaim(sealed, at, secret)).toBe(session);
    expect(readPendingClaim(`${sealed}x`, at, secret)).toBeUndefined();
    expect(readPendingClaim(sealed, new Date(at.getTime() + 600000), secret)).toBeUndefined();
    expect(readPendingClaim(undefined, at, secret)).toBeUndefined();
    const payload = JSON.parse(Buffer.from(sealed.split(".")[0]!, "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["expiresAt", "sessionId"]);
  });
});
