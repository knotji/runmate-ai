/**
 * Fitbit connect section — e2e coverage:
 * 1. Settings > ข้อมูล shows the Fitbit section with a "เชื่อมต่อ" link when not connected.
 * 2. When already connected (per /api/fitbit/status), shows sync info and a disconnect button.
 *
 * The OAuth round trip itself (redirect to Fitbit, callback, token exchange) isn't
 * e2e-tested — it requires a real Fitbit app registration and live consent screen,
 * verified manually instead.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("Fitbit section shows a connect link when not connected", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/api/fitbit/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ connected: false, connectedAt: null, lastSyncedAt: null, lastSyncError: null }),
    });
  });

  await gotoApp(page, "/settings?tab=data");

  const section = page.getByTestId("fitbit-connect-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("fitbit-connect-button")).toBeVisible();
  await expect(page.getByTestId("fitbit-connect-button")).toHaveAttribute("href", "/api/fitbit/connect");
});

test("Fitbit section shows sync status and disconnect button when connected", async ({ page }) => {
  await installMockBackend(page);
  await page.route("**/api/fitbit/status", async (route) => {
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

  const section = page.getByTestId("fitbit-connect-section");
  await expect(section).toBeVisible();
  await expect(page.getByTestId("fitbit-disconnect-button")).toBeVisible();
  await expect(page.getByTestId("fitbit-connect-button")).toHaveCount(0);
});
