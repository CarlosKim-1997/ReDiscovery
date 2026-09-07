import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();

async function ruleIds(code: string, filePath = "src/application/probe.ts") {
  const results = await eslint.lintText(code, { filePath });
  return results.flatMap((result) => result.messages.map((message) => message.ruleId));
}

describe("architecture enforcement", () => {
  it.each([
    'import OpenAI from "openai";',
    'export * from "@supabase/supabase-js";',
    'const sdk = import("@upstash/redis");',
    'import type { X } from "@sentry/nextjs";',
    'import { SystemClock } from "@/adapters/system-clock/system-clock";',
    'import { SystemClock } from "../adapters/system-clock/system-clock";',
    'import { config } from "@/server/container";',
    'import { headers } from "next/headers";',
    'const sdk = require("cloudflare");',
    'export type Client = import("openai").OpenAI;',
    'const sdk = import(modulePath);',
  ])("rejects forbidden dependencies: %s", async (code) => {
    expect(await ruleIds(code)).toContain("architecture/boundaries");
  });

  it("prevents shared utilities from hiding vendor dependencies", async () => {
    expect(await ruleIds('export * from "openai";', "src/shared/probe.ts")).toContain("architecture/boundaries");
  });

  it.each(['export const now = Date.now();', 'export const now = new Date();', 'export const env = process.env;', 'export const request = fetch("https://example.com");']) (
    "rejects ambient I/O: %s", async (code) => {
      expect(await ruleIds(code)).toContain("no-restricted-globals");
    },
  );

  it("allows an application to depend on a port", async () => {
    expect(await ruleIds('import type { ClockPort } from "@/ports/clock"; export type Clock = ClockPort;')).toEqual([]);
  });

  it("resolves valid relative imports on Windows and POSIX", async () => {
    expect(await ruleIds('export { parseServerConfig } from "./schema";', "src/config/probe.ts")).toEqual([]);
    expect(await ruleIds('import "./globals.css";', "src/app/probe.ts")).toEqual([]);
  });

  it("allows SDK imports inside adapters", async () => {
    expect(await ruleIds('import OpenAI from "openai"; export const Client = OpenAI;', "src/adapters/openai/probe.ts")).toEqual([]);
  });
});
