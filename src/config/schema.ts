import { z } from "zod";

const serverConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  CONFIG_VERSION: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).default("m0-v1"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
  JUDGE_ADAPTER: z.enum(["fake", "openai"]).default("fake"),
  OPENAI_API_KEY: z.string().min(1).optional(),
  PRIMARY_JUDGE_MODEL: z.string().min(1).max(100).optional(),
  ADJUDICATION_MODEL: z.string().min(1).max(100).optional(),
  REVEAL_COMPARISON_MODEL: z.string().min(1).max(100).optional(),
  TEST_FIXED_NOW: z.iso.datetime({ offset: true }).optional(),
}).superRefine((value, context) => {
  if (value.JUDGE_ADAPTER === "openai" && !value.OPENAI_API_KEY) context.addIssue({ code: "custom", path: ["OPENAI_API_KEY"], message: "Required for OpenAI Judge" });
  if (value.JUDGE_ADAPTER === "openai" && !value.PRIMARY_JUDGE_MODEL) context.addIssue({ code: "custom", path: ["PRIMARY_JUDGE_MODEL"], message: "Required for OpenAI Judge" });
  if (value.TEST_FIXED_NOW && value.APP_ENV !== "test") context.addIssue({ code: "custom", path: ["TEST_FIXED_NOW"], message: "Allowed only in test" });
});

export type ServerConfig = Readonly<z.infer<typeof serverConfigSchema>>;

/** Parse only owned keys. Diagnostics contain key names, never input values. */
export function parseServerConfig(environment: Readonly<Record<string, string | undefined>>): ServerConfig {
  const result = serverConfigSchema.safeParse(environment);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(`Invalid server configuration: ${keys.join(", ")}`);
  }
  return Object.freeze(result.data);
}
