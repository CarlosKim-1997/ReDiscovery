import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@/config/schema";

describe("server configuration", () => {
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
