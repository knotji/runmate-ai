import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";

test.describe("Meal Upload UX Improvements", () => {
  test("Meal manual mode has a simplified form with no note field and submits single input", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=meal");

    // Click on "พิมพ์เอง" (Manual mode)
    await page.getByRole("button", { name: "พิมพ์เอง" }).click();

    // Verify correct label and placeholder
    await expect(page.getByText("พิมพ์เมนูของมื้อนี้")).toBeVisible();
    const textarea = page.locator('textarea[placeholder*="เช่น ข้าวเหนียว 1 ห่อ"]');
    await expect(textarea).toBeVisible();

    // Verify "หมายเหตุ" is NOT visible
    await expect(page.getByText("หมายเหตุ (ไม่บังคับ)")).toBeHidden();
    await expect(page.locator('textarea[placeholder*="เช่น หลังวิ่ง, หิวมาก"]')).toBeHidden();

    // Type input and submit
    await textarea.fill("ข้าวเหนียว + ไก่แดง 2 ไม้");

    // Mock API response intercept for manual meal analysis
    await page.route("/api/analyze-meal", async (route) => {
      const requestBody = route.request().postDataJSON();
      // Ensure note is passed empty and mealText has the input
      expect(requestBody.note).toBe("");
      expect(requestBody.mealText).toBe("ข้าวเหนียว + ไก่แดง 2 ไม้");

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "gemini",
          data: {
            mealType: "breakfast",
            detectedFoods: [
              { name: "ข้าวเหนียว", portionEstimate: "1 serving", confidence: "high" },
              { name: "ไก่แดง", portionEstimate: "2 ไม้", confidence: "high" }
            ],
            nutrition: { caloriesKcal: 350, proteinG: 20, carbsG: 45, fatG: 8, fiberG: 1 },
            trainingFit: {
              bestFor: ["Recovery"],
              carbAdequacy: "ok",
              proteinAdequacy: "ok",
              fatLoad: "low",
              hydrationNote: "ดื่มน้ำตามปกติ",
              coachNote: "วิเคราะห์จากข้อความ"
            },
            confidence: "high",
            unclearFields: [],
            needsReview: false
          }
        }),
      });
    });

    await page.getByRole("button", { name: "ให้โค้ชประเมิน" }).click();

    // Verify analysis results are rendered (MealReviewCard should appear)
    await expect(page.getByText("ข้าวเหนียว, ไก่แดง")).toBeVisible();
  });

  test("Meal image upload supports up to 4 images and optional context input", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=meal");

    // Dropzone helper copy for meal should specify 4 images
    await expect(page.getByText("สูงสุด 4 รูป · ใช้เพื่อวิเคราะห์มื้อนี้เท่านั้น")).toBeVisible();

    // Text context "เพิ่มเติม" should be visible
    await expect(page.getByText("เพิ่มเติม", { exact: true })).toBeVisible();
    const contextTextarea = page.locator('textarea[placeholder*="เช่น กินข้าวครึ่งจาน"]');
    await expect(contextTextarea).toBeVisible();

    // Populate optional context
    await contextTextarea.fill("กินเหลือครึ่งจาน");

    // Upload multiple files and verify thumbnails grid
    const file1 = { name: "meal1.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image1") };
    const file2 = { name: "meal2.jpg", mimeType: "image/jpeg", buffer: Buffer.from("image2") };
    
    await page.locator('input[type="file"]').first().setInputFiles([file1, file2]);

    // Check thumbnails grid has 2 items
    await expect(page.getByTestId("upload-thumbnails-grid")).toBeVisible();
    await expect(page.getByTestId("remove-image-0")).toBeVisible();
    await expect(page.getByTestId("remove-image-1")).toBeVisible();

    // Remove first file
    await page.getByTestId("remove-image-0").click();

    // Check grid has only 1 item remaining
    await expect(page.getByTestId("remove-image-0")).toBeVisible();
    await expect(page.getByTestId("remove-image-1")).toBeHidden();
  });
});
