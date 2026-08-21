import { test, expect } from "@playwright/test";

// Every test in this file relies on the "setup" project (e2e/auth.setup.ts)
// having produced a signed-in storageState. If Clerk test credentials are not
// configured (see auth.setup.ts), that project skips and these tests will
// fail at the first navigation because they'll land on the signed-out
// homepage instead of /dashboard — that failure is expected and informative
// in that case, not a bug in these tests.

test("dashboard loads for a signed-in user", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  // BottomNav is present on every authenticated page; its presence confirms
  // we actually reached the app shell rather than being redirected to "/".
  await expect(page.getByTestId("nav-dashboard")).toBeVisible();
});

test("create, edit, persist-through-refresh, and delete a contact; then sign out", async ({
  page,
}) => {
  const uniqueLastName = `E2E${Date.now()}`;

  // ── Create ────────────────────────────────────────────────────────────
  await page.goto("/add");
  await page.getByTestId("input-firstname").fill("Playwright");
  await page.getByTestId("input-lastname").fill(uniqueLastName);
  await page.getByTestId("input-company").fill("Initial Co");
  await page.getByTestId("button-submit").click();
  await expect(page).toHaveURL(/\/contacts$/);

  // ── Search ────────────────────────────────────────────────────────────
  await page.getByTestId("input-search-contacts").fill(uniqueLastName);
  const card = page.getByText(`Playwright ${uniqueLastName}`);
  await expect(card).toBeVisible();

  // ── Navigate to detail, then edit ───────────────────────────────────────
  await card.click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await page.getByTestId("button-edit").click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+\/edit$/);

  await page.getByLabel("Company", { exact: true }).fill("Updated Co");
  await page.getByRole("button", { name: /save changes/i }).click();
  await expect(page).toHaveURL(/\/contacts\/[^/]+$/);
  await expect(page.getByText("Updated Co")).toBeVisible();

  // ── Refresh and verify persistence ──────────────────────────────────────
  await page.reload();
  await expect(page.getByText("Updated Co")).toBeVisible();
  await expect(page.getByText(`Playwright ${uniqueLastName}`)).toBeVisible();

  // ── Delete ───────────────────────────────────────────────────────────────
  await page.getByTestId("button-delete").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(page.getByText(`Playwright ${uniqueLastName}`)).toHaveCount(0);

  // ── Sign out ─────────────────────────────────────────────────────────────
  await page.goto("/settings");
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page).toHaveURL(/\/(sign-in)?$/, { timeout: 15_000 });
});
