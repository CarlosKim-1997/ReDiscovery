import { describe, expect, it } from "vitest";
import { parseServerConfig } from "@/config/schema";

describe("server configuration", () => {
  it("boots locally without credentials", () => {
    expect(parseServerConfig({})).toEqual({
      NODE_ENV: "development", APP_ENV: "local", CONFIG_VERSION: "m0-v1",
    });
  });

  it("accepts an explicit deployment configuration and strips unrelated env", () => {
    const config = parseServerConfig({
      NODE_ENV: "production", APP_ENV: "staging", CONFIG_VERSION: "m0-v2",
      PRIVATE_SECRET: "must-not-be-exported",
    });
    expect(config).toEqual({ NODE_ENV: "production", APP_ENV: "staging", CONFIG_VERSION: "m0-v2" });
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
});
