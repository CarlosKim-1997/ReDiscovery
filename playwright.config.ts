import { defineConfig, devices } from "@playwright/test";

process.env.APP_ENV = "test";
process.env.E2E_ALLOW_DB_FIXTURES = "1";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/api/health",
    env: {
      ...process.env,
      APP_ENV: "test",
      JUDGE_ADAPTER: "fake",
      TEST_FIXED_NOW: "2026-09-09T03:00:00.000Z",
    },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
