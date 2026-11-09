import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    // All test files share one real Postgres database (see tests/setup.ts),
    // and each test TRUNCATEs it in beforeEach. Running files in parallel
    // would let one file's truncate wipe rows another file is mid-test
    // with — sequential execution trades a bit of speed for tests that
    // aren't flaky by construction.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
