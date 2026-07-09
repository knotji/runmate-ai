import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test.describe("Settings — release notes collapsible", () => {
  test("shows ประวัติอัปเดต section with latest version preview", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    const section = page.getByTestId("release-notes-section");
    await expect(section).toBeVisible({ timeout: 10000 });
    await expect(section).toContainText("ประวัติอัปเดต");
    await expect(section).toContainText("v0.2");
    await expect(section).toContainText("Goal-Aware Personal Running + Health Coach");
  });

  test("older versions are hidden by default", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    await expect(page.getByTestId("release-notes-expanded")).toBeHidden({ timeout: 10000 });
    await expect(page.getByText("v0.1.2")).not.toBeVisible();
    await expect(page.getByText("v0.1.0 Beta")).not.toBeVisible();
  });

  test("tapping ดูทั้งหมด reveals v0.1.2 and v0.1.0 Beta", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    await page.getByTestId("release-notes-toggle").click();

    await expect(page.getByTestId("release-notes-expanded")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("v0.1.2")).toBeVisible();
    await expect(page.getByText("v0.1.0 Beta")).toBeVisible();
  });

  test("tapping ย่อ collapses the expanded release notes", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    // Expand first
    await page.getByTestId("release-notes-toggle").click();
    await expect(page.getByTestId("release-notes-expanded")).toBeVisible({ timeout: 5000 });

    // Collapse
    await page.getByTestId("release-notes-toggle").click();
    await expect(page.getByTestId("release-notes-expanded")).toBeHidden();
    await expect(page.getByText("v0.1.2")).not.toBeVisible();
  });
});
