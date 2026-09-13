import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@/config/schema";

describe("server configuration", () => {
  it.each(["https://project.supabase.co", "https://project.supabase.co/", "http://localhost:54321", "http://127.0.0.1:54321/"])("accepts Supabase root %s", url => {
    expect(parseServerConfig({ NEXT_PUBLIC_SUPABASE_URL: url }).NEXT_PUBLIC_SUPABASE_URL).toBe(url);
  });
  it.each(["/rest/v1", "/rest/v1/foo", "/auth/v1", "/other", "?query=value", "#fragment", "?", "#"])("rejects non-root Supabase URL shape %s", suffix => {
    expect(() => parseServerConfig({ NEXT_PUBLIC_SUPABASE_URL: `https://project.supabase.co${suffix}` })).toThrow("NEXT_PUBLIC_SUPABASE_URL must be the Supabase project root URL");
  });
  it("rejects embedded credentials without exposing them", () => {
    try { parseServerConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://private-user:private-password@project.supabase.co" }); throw new Error("expected rejection"); }
    catch (error) { expect(String(error)).toContain("project root URL"); expect(String(error)).not.toMatch(/private-user|private-password/); }
  });
  it.each(["http://remote.test", "ftp://localhost"])("preserves protocol/loopback restriction %s", url => {
    expect(() => parseServerConfig({ NEXT_PUBLIC_SUPABASE_URL: url })).toThrow("NEXT_PUBLIC_SUPABASE_URL");
  });
  it("accepts optional publishable SSR auth config but rejects unsafe origin/service keys", () => {
    expect(parseServerConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", AUTH_APP_ORIGIN: "https://app.test", AUTH_COOKIE_SECRET: "test-only-secret-at-least-32-characters" }).AUTH_APP_ORIGIN).toBe("https://app.test");
    expect(() => parseServerConfig({ AUTH_APP_ORIGIN: "https://app.test/unsafe" })).toThrow("AUTH_APP_ORIGIN");
    expect(() => parseServerConfig({ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_not_allowed" })).toThrow("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  });
  it("boots locally without credentials", () => {
    expect(parseServerConfig({})).toEqual({
      NODE_ENV: "development", APP_ENV: "local", CONFIG_VERSION: "m0-v1", DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", JUDGE_ADAPTER: "fake",
    });
  });

  it("accepts an explicit deployment configuration and strips unrelated env", () => {
    const config = parseServerConfig({
      NODE_ENV: "production", APP_ENV: "staging", CONFIG_VERSION: "m0-v2",
      PRIVATE_SECRET: "must-not-be-exported",
    });
    expect(config).toEqual({ NODE_ENV: "production", APP_ENV: "staging", CONFIG_VERSION: "m0-v2", DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres", JUDGE_ADAPTER: "fake" });
    expect(Object.isFrozen(config)).toBe(true);
  });

  it.each([
    { APP_ENV: "prod" },
    { NODE_ENV: "staging" },
    { CONFIG_VERSION: "" },
    { CONFIG_VERSION: "a".repeat(65) },
    { CONFIG_VERSION: "has spaces" },
  ])("rejects invalid configuration %o", (environment) => {
    expect(() => parseServerConfig(environment)).toThrow("Invalid server configuration:");
  });

  it("never includes environment values in diagnostics", () => {
    expect(() => parseServerConfig({ APP_ENV: "secret-value" })).toThrow(/^Invalid server configuration: APP_ENV$/);
  });

  it("requires server-only key and model only when the OpenAI adapter is selected",()=>{
    expect(()=>parseServerConfig({JUDGE_ADAPTER:"openai"})).toThrow(/OPENAI_API_KEY, PRIMARY_JUDGE_MODEL/);
    expect(parseServerConfig({JUDGE_ADAPTER:"openai",OPENAI_API_KEY:"secret",PRIMARY_JUDGE_MODEL:"candidate"})).toMatchObject({JUDGE_ADAPTER:"openai",OPENAI_API_KEY:"secret",PRIMARY_JUDGE_MODEL:"candidate"});
  });

  it("does not recognize browser-prefixed OpenAI configuration",()=>{
    expect(parseServerConfig({NEXT_PUBLIC_OPENAI_API_KEY:"leak"} as Record<string,string>)).not.toHaveProperty("NEXT_PUBLIC_OPENAI_API_KEY");
    expect(parseServerConfig({NEXT_PUBLIC_TEST_FIXED_NOW:"leak"} as Record<string,string>)).not.toHaveProperty("NEXT_PUBLIC_TEST_FIXED_NOW");
  });

  it("accepts an ISO fixed instant only in the test environment", () => {
    expect(parseServerConfig({
      APP_ENV: "test",
      TEST_FIXED_NOW: "2026-09-09T03:00:00.000Z",
    })).toMatchObject({
      APP_ENV: "test",
      TEST_FIXED_NOW: "2026-09-09T03:00:00.000Z",
    });
  });

  it("rejects invalid or non-test fixed instants without exposing values", () => {
    expect(() => parseServerConfig({
      APP_ENV: "test",
      TEST_FIXED_NOW: "not-an-instant",
    })).toThrow(/^Invalid server configuration: TEST_FIXED_NOW$/);
    expect(() => parseServerConfig({
      APP_ENV: "production",
      TEST_FIXED_NOW: "2026-09-09T03:00:00.000Z",
    })).toThrow(/^Invalid server configuration: TEST_FIXED_NOW$/);
  });
});
