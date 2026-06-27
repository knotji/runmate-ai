import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

// ─── Phase 1: Typo guard ──────────────────────────────────────────────────────

test("Today page never contains ของเสียง", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");
  // Wait for content to settle
  await expect(page.locator("body")).not.toContainText("ของเสียง");
});
