import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Tests share one real Postgres connection and TRUNCATE between each
    // test; running them concurrently would cause cross-test data races, so
    // force a single worker.
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
