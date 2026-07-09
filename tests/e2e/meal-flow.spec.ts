import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend, saveManualBreakfast } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

test("manual breakfast saves to Report without an image badge", async ({ page }) => {
  const state = await installMockBackend(page);
  await saveManualBreakfast(page, state);

  await gotoApp(page, "/logs");
  // Expand the full history details
  await page.getByText("รายการทั้งหมด").click();
  // Find the breakfast compact item and expand it
  const breakfastItem = page.locator('[data-testid="report-compact-item"]').filter({ hasText: "มื้อเช้า" }).first();
  await expect(breakfastItem).toBeVisible({ timeout: 5000 });
  await breakfastItem.getByRole("button", { name: "ดู" }).click();
  const mealCard = breakfastItem.getByTestId("report-meal-card");
  await expect(mealCard.getByText("ข้าวไข่ต้ม, นมโปรตีน")).toBeVisible();
  await expect(mealCard.getByText(/2 รายการ|พิมพ์เอง/)).toBeVisible();
  await expect(mealCard.getByText(/\d+\s*รูป/)).toHaveCount(0);
});
