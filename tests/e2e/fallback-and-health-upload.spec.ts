import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

test.describe("Health Check Upload and Today Fallback/Timeout", () => {
  test("Health Check custom uploader hides browser-default file text and validates wrong file types immediately", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/upload?type=health_check");

    // Check custom file uploader is visible
    await expect(page.getByText("กดเพื่อเลือกไฟล์ผลตรวจ")).toBeVisible();
    await expect(page.getByText("รองรับ PDF ผลตรวจสุขภาพ")).toBeVisible();

    // The raw file input must be hidden from view (uses sr-only)
    const input = page.locator('input[type="file"]');
    await expect(input).toBeHidden();

    // Select a non-PDF file to trigger wrong type validation immediately
    await input.setInputFiles({
      name: "report.png",
      mimeType: "image/png",
      buffer: Buffer.from("test-image-data"),
    });

    // Check error message is shown immediately
    await expect(page.getByText("ไฟล์นี้ยังไม่รองรับ ลองเลือก PDF ผลตรวจสุขภาพอีกครั้ง")).toBeVisible();
  });

  test("Today page immediately renders local fallback recommendation and recovers from timeout", async ({ page }) => {
    await installMockBackend(page);

    const today = bangkokDateKey();
    const mockState = {
      history: [
        {
          id: "sleep-1",
          user_id: "00000000-0000-4000-8000-000000000001",
          type: "sleep",
          created_at: new Date().toISOString(),
          dateKey: today,
          data: {
            extracted: {
              date: today,
              sleepScore: 65,
              energyScore: 65,
            },
            coach: {
              readinessScore: 65,
              readinessLabel: "Fair",
            },
          },
        },
      ],
    };

    // Override Supabase route to return our mock sleep history item
    await page.route("**/e2e-supabase/rest/v1/history_items*", async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "access-control-allow-origin": "*",
            "content-range": "0-0/0",
          },
          body: JSON.stringify(mockState.history),
        });
      } else {
        await route.fallback();
      }
    });

    // Override coach-insight endpoint to delay 12 seconds to force a timeout client-side
    await page.route("**/api/coach-insight", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 12000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 65,
            readinessLabel: "Fair",
            workoutRec: "Rest Day",
            workoutTarget: "Rest",
          },
        }),
      });
    });

    // Navigate to Today page
    await page.goto("/");

    // Check loading indicator shows "รอข้อมูลล่าสุด"
    await expect(page.getByText("รอข้อมูลล่าสุด")).toBeVisible();

    // Today page should immediately render local fallback recommendations while loading
    await expect(page.getByText("วันนี้เน้นฟื้นตัวเบา ๆ")).toBeVisible();

    // Verify error banner and retry appear after 10 seconds client-timeout
    // "คำแนะนำสำรอง" appears immediately in the fallback keyObservation; the error banner
    // with the insightErrorMessage body text only appears after the 10s abort fires.
    await expect(page.getByText("ระบบยังประเมินด้วยโค้ชไม่สำเร็จ แต่ใช้ข้อมูลจาก Report เพื่อแนะนำเบื้องต้นให้ก่อน")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "วิเคราะห์ใหม่" }).first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("ใช้ข้อมูลล่าสุด")).toBeVisible({ timeout: 15000 });
  });
});
