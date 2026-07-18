/**
 * Google Health connect section — e2e coverage:
 * 1. Settings > ข้อมูล shows the section with a "เชื่อมต่อ" link when not connected.
 * 2. When already connected (per /api/google-health/status), shows sync info and a
 *    disconnect button.
 *
 * The OAuth round trip itself (redirect to Google's consent screen, callback, token
 * exchange) isn't e2e-tested — it requires a real Google Cloud OAuth client and live
 * consent screen, verified manually instead.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("Google Health section shows a connect link when not connected", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/api/google-health/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: false, connectedAt: null, lastSyncedAt: null, lastSyncError: null }),
    });
  });

  await gotoApp(page, "/settings?tab=data");

  const section = page.getByTestId("google-health-connect-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("google-health-connect-button")).toBeVisible();
  await expect(page.getByTestId("google-health-connect-button")).toHaveAttribute("href", "/api/google-health/connect");
  await expect(page.getByTestId("google-health-backfill-button")).toHaveCount(0);
});

test("Google Health section shows sync status and disconnect button when connected", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/api/google-health/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        connectedAt: "2026-07-01T00:00:00.000Z",
        lastSyncedAt: "2026-07-16T23:00:00.000Z",
        lastSyncError: null,
      }),
    });
  });

  await gotoApp(page, "/settings?tab=data");

  const section = page.getByTestId("google-health-connect-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("google-health-disconnect-button")).toBeVisible();
  await expect(page.getByTestId("google-health-connect-button")).toHaveCount(0);
  await expect(page.getByTestId("google-health-backfill-button")).toBeVisible();
});

test("backfill button imports historical data and shows a summary", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/api/google-health/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        connected: true,
        connectedAt: "2026-07-01T00:00:00.000Z",
        lastSyncedAt: null,
        lastSyncError: null,
      }),
    });
  });
  await page.route("**/api/google-health/backfill", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sinceDateKey: "2026-06-17",
        sleepImported: 12,
        workoutsImported: 5,
        sleepSkippedManual: 0,
        workoutsSkippedManual: 0,
      }),
    });
  });

  await gotoApp(page, "/settings?tab=data");

  const backfillButton = page.getByTestId("google-health-backfill-button");
  await expect(backfillButton).toBeVisible();
  await backfillButton.click();

  const summary = page.getByTestId("google-health-backfill-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("12");
  await expect(summary).toContainText("5");
});

test("backfill summary notes days skipped because a manual entry already exists", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/api/google-health/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: true, connectedAt: "2026-07-01T00:00:00.000Z", lastSyncedAt: null, lastSyncError: null }),
    });
  });
  await page.route("**/api/google-health/backfill", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sinceDateKey: "2026-06-17",
        sleepImported: 8,
        workoutsImported: 3,
        sleepSkippedManual: 2,
        workoutsSkippedManual: 1,
      }),
    });
  });

  await gotoApp(page, "/settings?tab=data");
  await page.getByTestId("google-health-backfill-button").click();

  const summary = page.getByTestId("google-health-backfill-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("ข้าม 3");
});

test("app load fires a sync-if-stale request in the background", async ({ page }) => {
  await installMockBackend(page);

  let called = false;
  await page.route("**/api/google-health/sync-if-stale", async (route) => {
    called = true;
    await route.fallback();
  });

  const responsePromise = page.waitForResponse("**/api/google-health/sync-if-stale");
  await gotoApp(page, "/");
  const response = await responsePromise;
  const body = await response.json();

  expect(called).toBe(true);
  expect(response.status()).toBe(200);
  // This route's Supabase call happens server-side (Next.js API route -> Supabase),
  // which installMockBackend's page.route() mocks can't reach (those only intercept
  // browser-originated requests) — so it can't reach a real "connected" state here.
  // What this test actually verifies is the client-side wiring: the request fires
  // on app load, and the route responds gracefully (not a crash) either way.
  expect(body).toMatchObject({ synced: false, reason: "not-authenticated" });
});
