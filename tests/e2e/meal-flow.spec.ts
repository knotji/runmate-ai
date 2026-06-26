import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend, saveManualBreakfast } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";
import { reportDayByDate } from "./helpers/selectors";

test("manual breakfast saves to Report without an image badge", async ({ page }) => {
  const state = await installMockBackend(page);
  await saveManualBreakfast(page, state);

  await gotoApp(page, "/logs");
  const today = reportDayByDate(page, bangkokDateKey());
  await expect(today).toBeVisible();

  // Today starts expanded by default — no toggle click needed
  await expect(today.getByRole("heading", { name: /มื้อเช้า/ })).toBeVisible();
  const mealCard = today.getByTestId("report-meal-card");
  await expect(mealCard.getByText("ข้าวไข่ต้ม, นมโปรตีน")).toBeVisible();
  await expect(mealCard.getByText(/2 รายการ|พิมพ์เอง/)).toBeVisible();
  await expect(mealCard.getByText(/\d+\s*รูป/)).toHaveCount(0);
});
