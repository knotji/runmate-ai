import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test.describe("History Import Integration", () => {
  test("Settings > Data shows import hub with Samsung ZIP and CSV shortcut options", async ({ page }) => {
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

    // Verify Both options are visible
    await expect(page.getByTestId("import-samsung-btn")).toBeVisible();
    await expect(page.getByTestId("import-csv-btn")).toBeVisible();

    // Samsung import zone should be visible initially because it is defaulted
    await expect(page.getByTestId("samsung-import-zone")).toBeVisible();
  });

  test("CSV shortcut on Settings > Data navigates to upload page in CSV mode", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/settings");

    // Switch to Data tab
    await page.getByRole("button", { name: "ข้อมูล", exact: true }).click();

    // Click on CSV import link
    await page.getByTestId("import-csv-btn").click();

    // Should navigate to upload page with mode=csv
    await expect(page).toHaveURL(/\/upload\?source=history-import&mode=csv/);

    // Upload page should default to Sleep and have CSV mode selected
    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการนอน");
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();
    await expect(page.getByText("รองรับ CSV การนอนจาก Garmin/Apple Health")).toBeVisible();
  });

  test("Direct navigation with type=sleep&mode=csv query parameters opens Sleep CSV upload", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=sleep&mode=csv");

    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการนอน");
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();
    await expect(page.getByText("รองรับ CSV การนอนจาก Garmin/Apple Health")).toBeVisible();
  });

  test("Direct navigation with type=workout&mode=csv query parameters opens Workout CSV upload", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=workout&mode=csv");

    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการซ้อม");
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();
    await expect(page.getByText("รองรับ CSV กิจกรรมจาก Garmin หรือแหล่งอื่น")).toBeVisible();
  });
});
