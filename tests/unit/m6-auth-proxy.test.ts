import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ getClaims: vi.fn(), cookies: undefined as unknown }));
vi.mock("@/adapters/supabase-auth/supabase-auth", () => ({ createSupabaseServerClient: (_url: string, _key: string, cookies: unknown) => { state.cookies = cookies; return { auth: { getClaims: state.getClaims } }; } }));
import { refreshAuthCookies } from "@/adapters/supabase-auth/proxy";
import type { CookieMethodsServer } from "@supabase/ssr";

describe("M6 cookie-refresh proxy with fake SDK only", () => {
  beforeEach(() => { state.getClaims.mockReset(); });
  it("verifies claims and propagates refreshed request/response cookies and private headers", async () => {
    state.getClaims.mockImplementation(async () => {
      const jar = state.cookies as CookieMethodsServer;
      expect(jar.getAll).toBeDefined();
      jar.setAll!([{ name: "test-auth-cookie", value: "test-only-refreshed", options: { path: "/" } }], { "Cache-Control": "private, no-store" });
      return { data: null, error: null };
    });
    const request = new NextRequest("https://app.test/result/session");
    const response = await refreshAuthCookies(request, "https://project.supabase.co", "sb_publishable_test");
    expect(state.getClaims).toHaveBeenCalledTimes(1);
    expect(request.cookies.get("test-auth-cookie")?.value).toBe("test-only-refreshed");
    expect(response.cookies.get("test-auth-cookie")?.value).toBe("test-only-refreshed");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("does not deny anonymous Reveal when auth refresh is unavailable", async () => {
    state.getClaims.mockRejectedValue(new Error("test-unavailable"));
    expect((await refreshAuthCookies(new NextRequest("https://app.test/reveal/session"), "https://project.supabase.co", "sb_publishable_test")).status).toBe(200);
  });
});
