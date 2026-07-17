/**
 * Navigation guard — reported: users could tap the bottom nav (or header
 * links) while a save was still in flight and silently abandon it with no
 * warning. Pages with a real save flow now flag themselves as "guarded"
 * while saving (useGuardNavigationWhile), and every nav link (GuardedLink,
 * used by both BottomNav and AppShell's header) confirms before leaving.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test("navigating away via bottom nav while a save is in flight asks for confirmation", async ({ page }) => {
  await installMockBackend(page);

  // Never resolve the underlying save — removes any timing race with the test
  // steps below; "saving" simply stays true for the rest of the test.
  await page.route("**/e2e-supabase/rest/v1/history_items**", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise(() => {});
      return;
    }
    await route.fallback();
  });

  await gotoApp(page, "/sick");

  await page.getByRole("button", { name: "บันทึกอาการ" }).click();
  await expect(page.getByText("กำลังบันทึก...")).toBeVisible();

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });

  // "Report" rather than "Today" — the leftmost nav item sits under the
  // Next.js dev-tools indicator button in this dev-server environment, an
  // unrelated overlay that intercepts clicks there regardless of app code.
  await page.getByRole("link", { name: "Report" }).click();

  await expect.poll(() => dialogMessage).toContain("บันทึก");
  // Dismissed — should still be on the Sick page, not navigated away.
  await expect(page).toHaveURL(/\/sick/);
});

test("confirming the navigation warning proceeds to the requested page", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/e2e-supabase/rest/v1/history_items**", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise(() => {});
      return;
    }
    await route.fallback();
  });

  await gotoApp(page, "/sick");

  await page.getByRole("button", { name: "บันทึกอาการ" }).click();
  await expect(page.getByText("กำลังบันทึก...")).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("link", { name: "Report" }).click();

  await expect(page).toHaveURL(/\/logs/);
});

test("navigating away when nothing is saving does not prompt", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/sick");

  let dialogFired = false;
  page.on("dialog", () => {
    dialogFired = true;
  });

  await page.getByRole("link", { name: "Upload" }).click();
  await expect(page).toHaveURL(/\/upload/);
  expect(dialogFired).toBe(false);
});
