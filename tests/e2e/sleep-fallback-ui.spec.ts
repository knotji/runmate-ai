import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

test.describe("Sleep Fallback UI and States", () => {
  test("1. No sleep today but latest sleep exists", async ({ page }) => {
    const state = await installMockBackend(page);
    const yesterday = bangkokDateKey(-1);

    // Push sleep log for yesterday (latest sleep exists, but not today)
    state.history.push({
      id: "yesterday-sleep",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${yesterday}T10:00:00.000Z`,
      data: {
        extracted: {
          date: yesterday,
          actualSleepDurationMinutes: 420, // 7 hours
          sleepScore: 70,
          restingHR: 50,
          hrv: 55,
        },
        coach: {
          readinessScore: 70,
          readinessLabel: "Good",
        },
      },
    });

    await gotoApp(page, "/");

    // Today should show "Readiness ล่าสุด"
    await expect(page.getByText("Readiness ล่าสุด")).toBeVisible();

    // Expand the Recovery System details to check axis texts
    await page.getByText("ดูรายละเอียด Recovery").click();

    // Sleep axis summary should explicitly say "ยังไม่มีการนอนวันนี้ · ใช้ข้อมูลล่าสุด"
    await expect(page.getByText("ยังไม่มีการนอนวันนี้ · ใช้ข้อมูลล่าสุด")).toBeVisible();

    // Main recommendation card shows sleep fallback note inside the details accordion
    await page.getByText("ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้").first().waitFor({ state: "attached" });
    await expect(page.getByText("ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้").first()).toBeVisible();

    // Used chips should include "ใช้การนอนล่าสุด"
    await expect(page.getByText("ใช้การนอนล่าสุด")).toBeVisible();

    // Missing chips should include "+บันทึกการนอน"
    await expect(page.getByText("+บันทึกการนอน")).toBeVisible();

    // Four numeric /100 axis scores should still be visible
    // We search for /100 to ensure the grid shows scores correctly
    await expect(page.getByText("/100").first()).toBeVisible();
  });

  test("2. Sleep today exists", async ({ page }) => {
    const state = await installMockBackend(page);
    const today = bangkokDateKey();

    // Push sleep log for today
    state.history.push({
      id: "today-sleep",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          actualSleepDurationMinutes: 440, // 7h 20m
          sleepScore: 80,
          restingHR: 52,
          hrv: 58,
        },
        coach: {
          readinessScore: 80,
          readinessLabel: "Excellent",
        },
      },
    });

    await gotoApp(page, "/");

    // Today should NOT show fallback note anywhere
    await expect(page.getByText("ยังไม่มีข้อมูลการนอนวันนี้ — คำแนะนำนี้อิงจากข้อมูลล่าสุด")).toHaveCount(0);
    await expect(page.getByText("ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้")).toHaveCount(0);

    // Expand Recovery System to check axis texts
    await page.getByText("ดูรายละเอียด Recovery").click();

    // Sleep axis summary should NOT say "ยังไม่มีการนอนวันนี้"
    await expect(page.getByText("ยังไม่มีการนอนวันนี้ · ใช้ข้อมูลล่าสุด")).toHaveCount(0);

    // Sleep axis summary should show today's sleep duration
    await expect(page.getByText("นอนวันนี้ 7 ชม. 20 นาที")).toBeVisible();

    // Used chips should show "การนอนวันนี้"
    await expect(page.getByText("การนอนวันนี้")).toBeVisible();

    // Missing chips should NOT include "บันทึกการนอน"
    await expect(page.getByText("+บันทึกการนอน")).toHaveCount(0);
  });

  test("3. No sleep data at all", async ({ page }) => {
    await installMockBackend(page);
    await gotoApp(page, "/");

    // Expand the Recovery System details to check axis texts
    await page.getByText("ดูรายละเอียด Recovery").click();

    // Sleep axis summary should show "ยังไม่มีข้อมูลการนอน"
    await expect(page.getByText("ยังไม่มีข้อมูลการนอน")).toBeVisible();
  });
});
