import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test.describe("History Import Integration", () => {
  test("Settings > Data shows import hub with Samsung ZIP, CSV sleep, and CSV workout options", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    // Switch to Data tab
    await page.getByRole("button", { name: "ข้อมูล", exact: true }).click();

    // Verify title and description
    await expect(page.getByTestId("history-import-card")).toBeVisible();
    await expect(page.getByText("นำเข้าประวัติ", { exact: true })).toBeVisible();
    await expect(
      page.getByText("รวมไฟล์จาก Samsung Health, Garmin, Apple Health หรือ CSV อื่น ๆ")
    ).toBeVisible();

    // Verify options are visible
    await expect(page.getByTestId("import-samsung-btn")).toBeVisible();
    await expect(page.getByTestId("import-sleep-csv-btn")).toBeVisible();
    await expect(page.getByTestId("import-workout-csv-btn")).toBeVisible();

    // Samsung import zone should be visible initially because it is defaulted
    await expect(page.getByTestId("samsung-import-zone")).toBeVisible();
  });

  test("CSV sleep option inside Settings opens sleep CSV importer", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    // Switch to Data tab
    await page.getByRole("button", { name: "ข้อมูล", exact: true }).click();

    // Click on CSV sleep import tile
    await page.getByTestId("import-sleep-csv-btn").click();

    // Verify sleep CSV importer zone is shown
    await expect(page.getByTestId("sleep-csv-import-zone")).toBeVisible();
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();
    await expect(page.getByText("รองรับ CSV การนอนจาก Garmin/Apple Health")).toBeVisible();
  });

  test("CSV workout option inside Settings opens workout CSV importer", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    // Switch to Data tab
    await page.getByRole("button", { name: "ข้อมูล", exact: true }).click();

    // Click on CSV workout import tile
    await page.getByTestId("import-workout-csv-btn").click();

    // Verify workout CSV importer zone is shown
    await expect(page.getByTestId("workout-csv-import-zone")).toBeVisible();
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();
    await expect(page.getByText("รองรับ CSV กิจกรรมจาก Garmin หรือแหล่งอื่น")).toBeVisible();
  });

  test("Direct navigation with type=sleep&mode=csv query parameters redirects to Settings sleep CSV import", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=sleep&mode=csv");

    // URL should redirect to Settings page with tab=data and import=sleep-csv
    await expect(page).toHaveURL(/\/settings\?tab=data&import=sleep-csv/);
    await expect(page.getByTestId("sleep-csv-import-zone")).toBeVisible();
    await expect(page.getByText("รองรับ CSV การนอนจาก Garmin/Apple Health")).toBeVisible();
  });

  test("Direct navigation with type=workout&mode=csv query parameters redirects to Settings workout CSV import", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=workout&mode=csv");

    // URL should redirect to Settings page with tab=data and import=workout-csv
    await expect(page).toHaveURL(/\/settings\?tab=data&import=workout-csv/);
    await expect(page.getByTestId("workout-csv-import-zone")).toBeVisible();
    await expect(page.getByText("รองรับ CSV กิจกรรมจาก Garmin หรือแหล่งอื่น")).toBeVisible();
  });
});
