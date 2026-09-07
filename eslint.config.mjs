import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import next from "@next/eslint-plugin-next";
import architecture from "./tooling/eslint/architecture.mjs";

export default defineConfig([
  js.configs.recommended,
  ...tseslint.configs.recommended,
  globalIgnores([".next/**", "out/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { architecture, "@next/next": next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs["core-web-vitals"].rules,
      "architecture/boundaries": "error",
    },
  },
  {
    files: ["src/{domain,application,ports,shared}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-globals": ["error",
        { name: "Date", message: "Inject ClockPort instead of reading ambient time." },
        { name: "process", message: "Inject validated configuration from the server composition root." },
        { name: "fetch", message: "Use a port for external I/O." },
      ],
    },
  },
]);
