import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey, formatThaiBuddhistDate } from "./helpers/testData";

test("suggested date is not applied until the user confirms it", async ({ page }) => {
  const today = bangkokDateKey();
  const yesterday = bangkokDateKey(-1);
  await installMockBackend(page, { suggestedSleepDate: yesterday });
  await gotoApp(page, "/upload?type=sleep");

  await page.locator('input[type="file"]').setInputFiles({
    name: "sleep.png",
    mimeType: "image/png",
    buffer: Buffer.from("e2e-image"),
  });
  await page.getByRole("button", { name: "วิเคราะห์การนอน", exact: true }).click();

  await expect(page.getByText(/วันที่ที่อ่านได้จากไฟล์/)).toContainText(formatThaiBuddhistDate(yesterday));
  await expect(page.getByText(`จะบันทึกเป็นวันที่: ${formatThaiBuddhistDate(today)}`)).toBeVisible();

  await page.getByRole("button", { name: "ใช้วันที่นี้" }).click();
  await expect(page.getByText(`จะบันทึกเป็นวันที่: ${formatThaiBuddhistDate(yesterday)}`).first()).toBeVisible();
  await page.getByRole("button", { name: "บันทึกผลการนอน" }).click();
  await expect(page.getByText("บันทึกเข้า Report แล้ว").first()).toBeVisible();

  await gotoApp(page, "/logs");
  await page.getByText("รายการทั้งหมด").click();
  // Verify the sleep saved under yesterday's date key (not today)
  await expect(page.locator(`[data-testid="report-compact-item"][data-date-key="${yesterday}"]`).first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator(`[data-testid="report-compact-item"][data-date-key="${today}"]`)).toHaveCount(0);
});
