import { z } from "zod";

const serverConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
  CONFIG_VERSION: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/).default("m0-v1"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@127.0.0.1:54322/postgres"),
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
