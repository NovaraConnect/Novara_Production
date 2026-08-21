import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 4173);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      // The setup project is the only place a real (test) Clerk password is
      // ever typed. Playwright's trace/video capture records the literal
      // arguments passed to page.fill(), so leaving tracing on here would
      // write the test password into the uploaded CI artifact in plain
      // text. Tracing stays fully on for the "chromium" project below,
      // which contains no credentials.
      use: {
        trace: "off",
        screenshot: "off",
        video: "off",
      },
      // Clerk's hosted sign-in widget makes real network calls to Clerk's
      // servers; the default 30s test timeout is sometimes too tight for
      // that plus the post-auth redirect poll below in a CI sandbox.
      timeout: 60_000,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],
  // Reuses the app's existing "serve" script (vite preview over the
  // production build) so E2E runs against the real built app, not the dev
  // server.
  webServer: {
    command: "pnpm run serve",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
