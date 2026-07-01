import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend, saveManualBreakfast } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";
import { reportDayByDate } from "./helpers/selectors";

test("editing a meal moves it to yesterday and removes it from Today context", async ({ page }) => {
  const state = await installMockBackend(page);
  await saveManualBreakfast(page, state);
  const todayKey = bangkokDateKey();
  const yesterdayKey = bangkokDateKey(-1);

  await gotoApp(page, "/logs");
  await page.getByTestId("full-history-details").evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const today = reportDayByDate(page, todayKey);
  // Today starts expanded by default — no toggle click needed
  await today.getByTestId("report-meal-card").getByRole("button", { name: "แก้ไข" }).click();

  const modal = page.getByTestId("meal-edit-modal");
  await expect(modal).toBeVisible();
  await modal.getByTestId("meal-edit-kcal").fill("500");
  await modal.getByRole("button", { name: "มื้อกลางวัน" }).click();
  await modal.getByTestId("meal-edit-date").fill(yesterdayKey);
  await modal.getByRole("button", { name: "บันทึกการแก้ไข" }).click();

  await expect(page.getByRole("heading", { name: "แก้ไขมื้ออาหาร" })).toHaveCount(0);
  await page.getByTestId("full-history-details").evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  const yesterday = reportDayByDate(page, yesterdayKey);
  await expect(yesterday).toBeVisible();
  // Yesterday starts expanded by default — no toggle click needed
  await expect(yesterday.getByRole("heading", { name: /มื้อกลางวัน/ })).toBeVisible();
  await expect(yesterday.getByTestId("report-meal-card").getByText("500 kcal", { exact: true })).toBeVisible();
  await expect(reportDayByDate(page, todayKey)).toHaveCount(0);

  await gotoApp(page, "/");
  await expect(page.getByText(/Protein 30/)).toHaveCount(0);
});
