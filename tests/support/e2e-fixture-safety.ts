export type E2eFixtureEnvironment = Readonly<Record<string, string | undefined>>;

export const E2E_FIXTURE_DATABASE_NAME = "rediscovery_e2e";

export function assertE2eFixtureSafety(environment: E2eFixtureEnvironment): string {
  if (environment.APP_ENV !== "test" || environment.E2E_ALLOW_DB_FIXTURES !== "1") {
    throw new Error("E2E_DB_FIXTURE_FORBIDDEN");
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl || !databaseUrl.trim()) throw new Error("E2E_DB_FIXTURE_DATABASE_URL_REQUIRED");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("E2E_DB_FIXTURE_DATABASE_URL_INVALID");
  }
  if (!(["postgres:", "postgresql:"].includes(parsed.protocol)) || !(["127.0.0.1", "localhost"].includes(parsed.hostname))) {
    throw new Error("E2E_DB_FIXTURE_REQUIRES_LOOPBACK_POSTGRES");
  }
  if (parsed.pathname !== "/" + E2E_FIXTURE_DATABASE_NAME) throw new Error("E2E_DB_FIXTURE_REQUIRES_DEDICATED_DATABASE");
  return databaseUrl;
}
