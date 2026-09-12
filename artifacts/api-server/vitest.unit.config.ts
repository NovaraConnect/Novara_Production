import { defineConfig } from "vitest/config";

// Unit tests for pure logic — no database, no setup file.
//
// The main suite (vitest.config.ts) TRUNCATEs a real Postgres between tests
// and therefore cannot run without DATABASE_URL pointing at a live database.
// That makes pure helpers effectively untestable in a local checkout, so
// anything dependency-free lives in tests/unit and runs here instead.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["tests/unit/**/*.test.ts"],
  },
});
