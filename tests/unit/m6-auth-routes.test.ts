import { beforeEach, describe, expect, it, vi } from "vitest";
import { authFixture, AUTH_FIXTURE_DEVICE as device, AUTH_FIXTURE_SESSION as session, AUTH_FIXTURE_TIME as at, fixtureId } from "../support/m6-auth-fixture";

const state = vi.hoisted(() => ({ deps: undefined as unknown, configured: true, deviceActive: true, cookies: new Map<string, string>(), options: new Map<string, unknown>() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => state.cookies.has(name) ? { value: state.cookies.get(name) } : undefined, delete: (name: string) => state.cookies.delete(name), set: (name: string, value: string, options: unknown) => { state.cookies.set(name, value); state.options.set(name, options); } }) }));
vi.mock("@/server/auth", async () => ({
  ...(await import("@/adapters/supabase-auth/pending-claim")), ...(await import("@/server/auth-policy")),
  authConfiguration: () => state.configured ? { url: "https://project.supabase.co", key: "test-publishable", origin: "https://app.test", secret: "test-only-secret-not-a-live-credential" } : undefined,
  authenticationDependencies: async () => state.deps,
}));
vi.mock("@/app/api/_device", () => ({ currentDevice: async () => state.deviceActive ? ({ id: device }) : undefined }));
import { POST as start } from "@/app/auth/google/route";
import { GET as callback } from "@/app/auth/callback/route";
import { POST as logout } from "@/app/auth/logout/route";
import { GET as status } from "@/app/api/auth/status/route";
import { sealPendingClaim, PENDING_CLAIM_COOKIE } from "@/adapters/supabase-auth/pending-claim";

const request = (path: string, form: Record<string, string> = {}, origin = "https://app.test") => new Request(`https://app.test${path}`, { method: "POST", headers: { origin }, body: new URLSearchParams(form) });
describe("M6 fake-auth HTTP boundary", () => {
  let f: ReturnType<typeof authFixture>;
  beforeEach(() => { f = authFixture(); state.deps = f.deps; state.configured = true; state.deviceActive = true; state.cookies.clear(); state.options.clear(); });
  it("unresolved anonymous identity rejects existing-session OAuth intent before provider start", async () => {
    state.deviceActive = false;
    expect((await start(request("/auth/google", { sessionId: session }))).status).toBe(400);
    expect(f.auth.callbacks).toEqual([]); expect(f.claims).toEqual([]); expect(state.options.size).toBe(0);
  });
  it("ownership proof lost after start preserves verified login with zero claims", async () => {
    await start(request("/auth/google", { sessionId: session })); state.deviceActive = false;
    expect((await callback(new Request("https://app.test/auth/callback?code=valid"))).headers.get("location")).toBe("https://app.test/?auth=claim_not_applied");
    expect(f.auth.identity).toBeDefined(); expect(f.claims).toEqual([]); expect(f.sessions.get(session)?.accountId).toBeUndefined(); expect(state.cookies.size).toBe(0);
    expect(await (await status(new Request(`https://app.test/api/auth/status?sessionId=${session}`))).json()).toMatchObject({ authenticated: true, currentSessionClaimed: false });
  });
  it("login without session intent does not require anonymous ownership", async () => {
    state.deviceActive = false;
    expect((await start(request("/auth/google"))).status).toBe(303);
    expect((await callback(new Request("https://app.test/auth/callback?code=valid"))).headers.get("location")).toBe("https://app.test/?auth=signed_in");
    expect(f.claims).toEqual([]); expect(state.options.size).toBe(0);
  });
  it("sets one safe server-controlled intent and fixed callback", async () => {
    const response = await start(request("/auth/google", { sessionId: session }));
    expect(response.status).toBe(303); expect(f.auth.callbacks).toEqual(["https://app.test/auth/callback"]);
    expect(state.options.get(PENDING_CLAIM_COOKIE)).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 600 });
    expect(state.cookies.size).toBe(1);
  });
  it.each(["foreign", "practice"])("rejects %s intent without starting OAuth or storing claim", async kind => {
    f.sessions.set(session, { ...f.sessions.get(session)!, ...(kind === "foreign" ? { anonymousDeviceId: fixtureId(9) } : { attemptType: "PRACTICE" as const }) });
    expect((await start(request("/auth/google", { sessionId: session }))).status).toBe(400); expect(f.auth.callbacks).toEqual([]); expect(state.cookies.size).toBe(0);
  });
  it("rejects external returnTo and cross-origin starts/logout", async () => {
    expect((await start(request("/auth/google", { returnTo: "https://evil.test" }))).status).toBe(400);
    expect((await start(request("/auth/google", {}, "https://evil.test"))).status).toBe(400);
    expect((await logout(request("/auth/logout", {}, "https://evil.test"))).status).toBe(400); expect(f.auth.callbacks).toEqual([]);
  });
  it("handles callback, clears intent, returns exact Result, and exposes only safe status", async () => {
    await start(request("/auth/google", { sessionId: session }));
    const response = await callback(new Request("https://app.test/auth/callback?code=valid"));
    expect(response.headers.get("location")).toBe(`https://app.test/result/${session}?auth=signed_in`); expect(state.cookies.size).toBe(0);
    expect(f.claims).toEqual([session]);
    const body = await (await status(new Request(`https://app.test/api/auth/status?sessionId=${session}`))).json();
    expect(body).toEqual({ configured: true, authenticated: true, account: { id: fixtureId(100) }, currentSessionClaimed: true });
    expect(JSON.stringify(body)).not.toMatch(/token|externalSubject|email|name/);
    await callback(new Request("https://app.test/auth/callback?code=valid")); expect(f.claims).toEqual([session]); expect(f.accounts.size).toBe(1);
  });
  it("missing/stale intent permits login but zero history claims", async () => {
    state.cookies.set(PENDING_CLAIM_COOKIE, sealPendingClaim(session, new Date(at.getTime() - 600000), "test-only-secret-not-a-live-credential"));
    const response = await callback(new Request("https://app.test/auth/callback?code=valid"));
    expect(response.headers.get("location")).toBe("https://app.test/?auth=signed_in"); expect(f.claims).toEqual([]); expect(state.cookies.size).toBe(0);
  });
  it("auth-success / claim-conflict remains signed in without transferring ownership", async () => {
    await start(request("/auth/google", { sessionId: session }));
    f.sessions.set(session, { ...f.sessions.get(session)!, accountId: fixtureId(77), accountClaimedAt: at });
    expect((await callback(new Request("https://app.test/auth/callback?code=valid"))).headers.get("location")).toContain("auth=claim_not_applied");
    expect(f.sessions.get(session)?.accountId).toBe(fixtureId(77)); expect(f.auth.identity).toBeDefined(); expect(state.cookies.size).toBe(0);
  });
  it("failure clears pending and cannot use an external callback redirect", async () => {
    await start(request("/auth/google", { sessionId: session }));
    expect((await callback(new Request("https://app.test/auth/callback?error=denied&returnTo=https://evil.test"))).headers.get("location")).toBe("https://app.test/?auth=failed");
    expect(state.cookies.size).toBe(0); expect(f.claims).toEqual([]);
  });
  it("logout leaves claimed session/device intact", async () => {
    await start(request("/auth/google", { sessionId: session })); await callback(new Request("https://app.test/auth/callback?code=valid"));
    const original = f.sessions.get(session); await logout(request("/auth/logout")); expect(f.sessions.get(session)).toBe(original); expect(f.auth.identity).toBeUndefined();
  });
  it("missing configuration and signed-out lookup remain safe", async () => {
    expect(await (await status(new Request("https://app.test/api/auth/status"))).json()).toEqual({ configured: true, authenticated: false });
    state.configured = false;
    expect((await start(request("/auth/google"))).status).toBe(503);
    expect((await callback(new Request("https://app.test/auth/callback"))).status).toBe(503);
    expect((await logout(request("/auth/logout"))).status).toBe(503);
    expect((await (await status(new Request("https://app.test/api/auth/status"))).json()).error).toBe("AUTH_NOT_CONFIGURED"); expect(f.accounts.size).toBe(0);
  });
});
