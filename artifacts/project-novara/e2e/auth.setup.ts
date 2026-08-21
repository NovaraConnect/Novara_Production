import { test as setup } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import path from "path";
import { fileURLToPath } from "url";

// project-novara is an ESM package ("type": "module" in package.json), so
// the CommonJS-only __dirname global isn't available here -- derive it from
// import.meta.url instead, same pattern already used in
// artifacts/api-server/tests/setup.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, ".auth/user.json");

const hasClerkTestCredentials =
  Boolean(process.env.CLERK_SECRET_KEY) &&
  Boolean(process.env.E2E_CLERK_TEST_EMAIL) &&
  Boolean(process.env.E2E_CLERK_TEST_PASSWORD);

setup("authenticate", async ({ page }) => {
  setup.skip(
    !hasClerkTestCredentials,
    "Skipping E2E auth setup: CLERK_SECRET_KEY / E2E_CLERK_TEST_EMAIL / E2E_CLERK_TEST_PASSWORD " +
      "are not set. These must come from a dedicated Clerk *test* user/instance, never a real " +
      "account, and are only expected to be present in CI once the maintainer wires them up.",
  );

  await clerkSetup({ secretKey: process.env.CLERK_SECRET_KEY });
  await setupClerkTestingToken({ page });

  await page.goto("/sign-in");
  await page.getByLabel(/email address/i).fill(process.env.E2E_CLERK_TEST_EMAIL!);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/^password$/i).fill(process.env.E2E_CLERK_TEST_PASSWORD!);
  await page.getByRole("button", { name: /continue/i }).click();

// App.tsx wires Clerk's routerPush/routerReplace to wouter's setLocation,
  // so the post-sign-in redirect is client-side (History API), never a
  // full-page load -- page.waitForURL()'s default waitUntil:"load" can hang
                                            // waiting for a navigation lifecycle event that a pushState-only route
  // change never fires. Poll window.location directly instead.
  await page.waitForFunction(() => /\/dashboard/.test(window.location.pathname), {
    timeout: 20_000,
  });
  await page.context().storageState({ path: authFile });
});
