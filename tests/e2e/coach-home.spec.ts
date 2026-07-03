import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const VALID_STANCE_LABELS = [
  "ร่างกายพร้อมลุยเต็มที่",
  "วันนี้ยังไปตามแผนได้",
  "วันนี้โค้ชจะคุมเบาไว้ก่อน",
  "วันนี้เน้น recovery ก่อน",
  "โค้ชพร้อมแนะนำวันนี้",
];

test.describe("Coach home 10/10 polish", () => {
  test("1. Coach hero elements are visible and compact", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/coach");

    await expect(page.getByRole("heading", { name: "โค้ชพร้อมช่วยวันนี้" })).toBeVisible();
    await expect(page.getByText("ถามเรื่องซ้อม กิน นอน recovery หรืออาการเจ็บได้")).toBeVisible();
    await expect(page.getByRole("link", { name: "ลองถามโค้ช" })).toBeVisible();
    await expect(page.getByRole("link", { name: "แจ้งเจ็บ" })).toBeVisible();
    await expect(page.getByText("แชตนี้ไม่บันทึกเข้า Report อัตโนมัติ").first()).toBeVisible();
  });

  test("2. Suggested prompt section heading is not a duplicate of the CTA", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/coach");

    // Hero CTA uses "ลองถามโค้ช"
    await expect(page.getByRole("link", { name: "ลองถามโค้ช" })).toBeVisible();

    // Prompt section heading is different
    await expect(page.getByText("คำถามที่น่าลอง")).toBeVisible();

    // "ลองถามโค้ช" must NOT appear as a standalone p/span text node (only as link text)
    await expect(page.locator("p").filter({ hasText: /^ลองถามโค้ช$/ })).toHaveCount(0);
  });

  test("3. Context dashboard shows human coaching stance and score", async ({ page }) => {
    const state = await installMockBackend(page);
    const today = bangkokDateKey();

    state.history.push({
      id: "sleep-coach-home",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: { date: today, actualSleepDurationMinutes: 450, sleepScore: 80 },
        coach: { readinessScore: 78, readinessLabel: "Good" },
      },
    });

    await gotoApp(page, "/coach");

    const dashboard = page.locator('[data-testid="coach-context-dashboard"]');
    await expect(dashboard).toBeVisible();

    // Score badge visible
    await expect(dashboard.locator(".rounded-2xl").first()).toBeVisible();

    // A valid human stance label is shown
    let stanceFound = false;
    for (const stance of VALID_STANCE_LABELS) {
      const count = await dashboard.getByText(stance).count();
      if (count > 0) { stanceFound = true; break; }
    }
    expect(stanceFound).toBe(true);

    // "ดูบริบท" toggle expands details
    await page.getByText("ดูบริบท").click();
    await expect(dashboard.getByText("อ้างอิงจาก")).toBeVisible();
  });

  test("4. Prompt chips are visible and clickable", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/coach");

    // Without race data, non-race chips render: "วันนี้ควรซ้อมอะไร", "สรุปวันนี้", "Recovery", "กินหลังวิ่ง"
    await expect(page.locator("button.rounded-full").filter({ hasText: "กินหลังวิ่ง" })).toBeVisible();
  });

  test("5. Chat input, send button, and disclaimer are visible", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/coach");

    await expect(page.getByPlaceholder("ถามโค้ชได้เลย...")).toBeVisible();
    await expect(page.getByRole("button", { name: "แนบรูปเพื่อถามโค้ช" })).toBeVisible();
    await expect(page.getByRole("button", { name: "ส่ง" })).toBeVisible();
    await expect(page.getByText(/แชทนี้จะบันทึกประวัติ/)).toBeVisible();
  });

  test("6. Context dashboard source label reads 'โค้ชใช้ข้อมูลจาก Report'", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/coach");
    await expect(page.getByText("โค้ชใช้ข้อมูลจาก Report")).toBeVisible();
  });
});
