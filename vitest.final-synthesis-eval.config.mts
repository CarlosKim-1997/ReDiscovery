import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
export default defineConfig({resolve:{alias:{"@":fileURLToPath(new URL("./src",import.meta.url))}},test:{environment:"node",include:["tests/eval/final-synthesis-*.test.ts"],testTimeout:1_800_000,fileParallelism:false,maxWorkers:1}});
