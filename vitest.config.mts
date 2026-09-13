import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    clearMocks: true,
    projects: [
      {
        test: {
          name: "normal",
          include: ["tests/unit/**/*.test.ts", "tests/architecture/**/*.test.ts"],
          fileParallelism: true,
        },
      },
      {
        test: {
          name: "postgres",
          include: [
            "tests/integration/m2-postgres.test.ts",
            "tests/integration/m6-data-access-boundary.test.ts",
            "tests/integration/m6-postgres-claim.test.ts",
          ],
          fileParallelism: false,
        },
      },
    ],
  },
});
