import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { intakeClassification } from "./helpers/testData";

test.describe("Universal intake classifier", () => {
  test("high-confidence image classification auto-routes into meal review without a second upload", async ({ page }) => {
    const state = await installMockBackend(page);
    await page.route("**/api/classify-intake", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(intakeClassification("meal", "high")) });
    });
    await gotoApp(page, "/upload");

    await page.getByTestId("universal-intake-file-input").setInputFiles({
      name: "meal.png",
      mimeType: "image/png",
      buffer: Buffer.from("e2e-meal-image"),
    });
    await page.getByTestId("universal-intake-submit").click();

    // Auto-routed straight into the meal review card — no manual type pick, no second file selection.
    await expect(page.getByRole("heading", { name: "ตรวจโภชนาการก่อนบันทึก" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("upload-type-selector")).toBeHidden();
    await expect(page.getByTestId("intake-classification-banner")).toContainText("อาหาร");

    await page.getByRole("button", { name: "บันทึก", exact: true }).click();
    await expect.poll(() => state.history.filter((row) => row.type === "meal").length).toBe(1);
  });

  test("low-confidence classification falls back to the manual chooser and preserves the captured file", async ({ page }) => {
    await installMockBackend(page);
    await page.route("**/api/classify-intake", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(intakeClassification("meal", "low")) });
    });
    await gotoApp(page, "/upload");

    await page.getByTestId("universal-intake-file-input").setInputFiles({
      name: "mystery.png",
      mimeType: "image/png",
      buffer: Buffer.from("e2e-mystery-image"),
    });
    await page.getByTestId("universal-intake-submit").click();

    await expect(page.getByTestId("intake-fallback-notice")).toBeVisible();
    await expect(page.getByTestId("upload-type-selector")).toBeVisible();

    // Tapping a type chip reuses the already-captured file — no re-upload needed, straight to review.
    await page.getByRole("button", { name: /อาหาร/ }).click();
    await expect(page.getByRole("heading", { name: "ตรวจโภชนาการก่อนบันทึก" })).toBeVisible({ timeout: 10_000 });
  });

  test("unknown classification (AI failure) also falls back to the manual chooser", async ({ page }) => {
    await installMockBackend(page);
    // No override — the default mock in installMockBackend returns unknown/low.
    await gotoApp(page, "/upload");

    await page.getByTestId("universal-intake-text-input").fill("ไม่รู้จะเรียกว่าอะไรดี");
    await page.getByTestId("universal-intake-submit").click();

    await expect(page.getByTestId("intake-fallback-notice")).toBeVisible();
    await expect(page.getByTestId("upload-type-selector")).toBeVisible();
  });

  test("text-only meal classification auto-analyzes without a second submit", async ({ page }) => {
    await installMockBackend(page);
    await page.route("**/api/classify-intake", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(intakeClassification("meal", "high")) });
    });
    await gotoApp(page, "/upload");

    await page.getByTestId("universal-intake-text-input").fill("ข้าวไข่ต้ม 2 ฟอง นมโปรตีน");
    await page.getByTestId("universal-intake-submit").click();

    await expect(page.getByRole("heading", { name: "ตรวจโภชนาการก่อนบันทึก" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("กรอกจากข้อความ")).toBeVisible();
  });

  test("CSV file short-circuits straight to settings data import without calling the classifier", async ({ page }) => {
    await installMockBackend(page);
    let classifyCalled = false;
    await page.route("**/api/classify-intake", async (route) => {
      classifyCalled = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(intakeClassification("unknown")) });
    });
    await gotoApp(page, "/upload");

    await page.getByTestId("universal-intake-file-input").setInputFiles({
      name: "history.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("date,value\n2026-01-01,1"),
    });
    await page.getByTestId("universal-intake-submit").click();

    await expect(page).toHaveURL(/\/settings\?tab=data/);
    expect(classifyCalled).toBe(false);
  });

  test("pain classification shows a confirm step and hands off the note to the pain page", async ({ page }) => {
    await installMockBackend(page);
    await page.route("**/api/classify-intake", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(intakeClassification("pain", "high")) });
    });
    await gotoApp(page, "/upload");

    await page.getByTestId("universal-intake-text-input").fill("เจ็บเข่าซ้ายหลังวิ่ง");
    await page.getByTestId("universal-intake-submit").click();

    await expect(page.getByTestId("intake-redirect-confirm")).toBeVisible();
    // Never auto-saves or auto-navigates without explicit confirmation.
    await expect(page).toHaveURL(/\/upload/);

    await page.getByTestId("intake-redirect-confirm-cta").click();
    await expect(page).toHaveURL(/\/pain/);
    await expect(page.getByTestId("pain-notes-input")).toHaveValue("เจ็บเข่าซ้ายหลังวิ่ง");
  });

  test("manual chooser grid still works untouched, without ever using the universal uploader", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload");

    await page.getByRole("button", { name: "นอน" }).click();
    await expect(page.getByTestId("upload-type-summary")).toContainText("บันทึกการนอน");
    await expect(page.getByTestId("intake-classification-banner")).toHaveCount(0);
  });

  test("meal quantity stepper lets the user correct the AI's food count before saving", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=meal");

    await page.locator('input[type="file"]').first().setInputFiles({
      name: "eggs.png",
      mimeType: "image/png",
      buffer: Buffer.from("e2e-eggs-image"),
    });
    await page.getByRole("button", { name: "วิเคราะห์อาหาร" }).click();

    await expect(page.getByRole("heading", { name: "ตรวจโภชนาการก่อนบันทึก" })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "แก้ไข" }).click();
    const qty = page.getByTestId("meal-food-qty-0");
    await expect(qty).toHaveText("2");

    await page.getByTestId("meal-food-qty-plus-0").click();
    await expect(qty).toHaveText("3");

    await page.getByTestId("meal-food-qty-minus-0").click();
    await page.getByTestId("meal-food-qty-minus-0").click();
    await expect(qty).toHaveText("1");
  });
});
