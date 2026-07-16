/**
 * Push notification settings — e2e coverage:
 * 1. Settings > บัญชี shows the notification section with expected copy.
 * 2. When the browser supports the Push API, the enable/disable toggle is visible.
 *
 * The actual subscribe flow (navigator.serviceWorker.ready + pushManager.subscribe)
 * isn't exercised here — the service worker only registers in production builds
 * (see PWARegistration.tsx), so there's nothing for it to resolve against in the
 * dev server this suite runs against. That flow is verified manually.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("Settings shows the notification section with expected copy", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/settings");
  await page.getByRole("button", { name: "บัญชี" }).click();

  const section = page.getByTestId("notification-settings-section");
  await expect(section).toBeVisible();
  await expect(section.getByText("เตือนบันทึกประจำวัน")).toBeVisible();
});

test("Enable/disable toggle appears when the browser supports the Push API", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/settings");
  await page.getByRole("button", { name: "บัญชี" }).click();

  const supportsPush = await page.evaluate(
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  );
  test.skip(!supportsPush, "Browser does not support the Push API");

  await expect(page.getByTestId("notification-toggle")).toBeVisible();
});
