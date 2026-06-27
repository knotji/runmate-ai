import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSleepRecord(dateKey: string, id: string, overrides: Partial<{ created_at: string }> = {}) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    // T10:00:00Z = 17:00 Bangkok — safely within the same Bangkok day
    created_at: overrides.created_at ?? `${dateKey}T10:00:00.000Z`,
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: 420, // 7h
        sleepScore: 78,
        restingHR: 50,
        hrv: 55,
      },
      coach: {
        readinessScore: 75,
        readinessLabel: "Good",
        aiSummary: "นอนหลับดี",
        todayRecommendation: "ซ้อมได้",
        nutritionFocus: "กินให้ครบ",
        recoveryFocus: "",
        sleepFocus: "",
        warningNotes: "",
      },
      confidence: "high",
      unclearFields: [],
    },
  };
}

// ─── Phase 1: Weekly Review sleep avg matches 7 Day Overview ─────────────────

test("Weekly Review shows sleep avg when sleep records exist", async ({ page }) => {
  const state = await installMockBackend(page);

  // Inject 3 sleep records over 3 different nights
  for (let i = 1; i <= 3; i++) {
    state.history.push(makeSleepRecord(bangkokDateKey(-i), `sleep-00${i}`));
  }

  await gotoApp(page, "/logs");

  // 7 Day Overview shows sleep avg somewhere on the page
  await expect(page.getByText(/\d+\.?\d* ชม\./).first()).toBeVisible();

  // Weekly Review card is present and shows sleep avg (not "–")
  const weeklyReview = page.locator("section").filter({ hasText: "โค้ชสรุปจาก 7 วันล่าสุด" }).first();
  await expect(weeklyReview).toBeVisible();
  // Sleep cell shows hours value, not just a dash
  const sleepCell = weeklyReview.locator(".rounded-2xl").filter({ hasText: "นอนเฉลี่ย" });
  await expect(sleepCell.getByText(/\d+\.?\d* ชม\./)).toBeVisible();
  // Nights count shown
  await expect(sleepCell.getByText(/\d+ คืน/)).toBeVisible();
});

test("Weekly Review sleep avg counts unique nights only (no double-count)", async ({ page }) => {
  const state = await installMockBackend(page);

  // Two sleep records for the SAME night (duplicates — should be deduped)
  const dateKey = bangkokDateKey(-1);
  state.history.push(makeSleepRecord(dateKey, "sleep-dup-1"));
  state.history.push(makeSleepRecord(dateKey, "sleep-dup-2", { created_at: `${dateKey}T11:00:00.000Z` }));

  await gotoApp(page, "/logs");

  const weeklyReview = page.locator("section").filter({ hasText: "โค้ชสรุปจาก 7 วันล่าสุด" }).first();
  const sleepCell = weeklyReview.locator(".rounded-2xl").filter({ hasText: "นอนเฉลี่ย" });
  // Should count 1 night (deduped), not 2
  await expect(sleepCell.getByText("1 คืน")).toBeVisible();
});

// ─── Phase 2: Card heading copy ───────────────────────────────────────────────

test("Report shows correct heading copy for 7 Day Overview and Weekly Review", async ({ page }) => {
  const state = await installMockBackend(page);

  // Add a workout so the /logs page has content and interactive elements render
  state.history.push({
    id: "workout-heading-test",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${bangkokDateKey(0)}T10:00:00.000Z`,
    data: {
      extracted: { workoutKind: "outdoor_run", distanceKm: 5, duration: "00:30:00", intensity: "easy", rpe: 5 },
    },
  });

  await gotoApp(page, "/logs");

  // 7 Day Overview card uses new headings
  await expect(page.getByText("ตัวเลข 7 วันล่าสุด")).toBeVisible();
  await expect(page.getByText("สรุป metrics หลักจาก Report")).toBeVisible();

  // Weekly Review card uses new headings
  await expect(page.getByText("โค้ชสรุปจาก 7 วันล่าสุด")).toBeVisible();
  await expect(page.getByText("แปลจากตัวเลขเพื่อหา pattern และโฟกัสถัดไป")).toBeVisible();

  // Old copy must NOT appear
  await expect(page.getByText("ภาพรวมสัปดาห์ล่าสุด")).toHaveCount(0);
  await expect(page.getByText("สรุปสัปดาห์นี้")).toHaveCount(0);
});

// ─── Phase 3+4: Today readiness fallback labels ───────────────────────────────

test("Today shows normal Readiness label when today sleep exists", async ({ page }) => {
  const state = await installMockBackend(page);

  // Sleep for today
  state.history.push(makeSleepRecord(bangkokDateKey(0), "sleep-today"));

  await gotoApp(page, "/");

  // Readiness chip should show the normal label (not "ล่าสุด")
  await expect(page.locator(".rounded-full").filter({ hasText: /Readiness/ }).first()).toBeVisible();
  await expect(page.locator(".rounded-full").filter({ hasText: /Readiness ล่าสุด/ })).toHaveCount(0);

  // Coverage should show "การนอนวันนี้" not "ใช้การนอนล่าสุด"
  await expect(page.getByText("การนอนวันนี้")).toBeVisible();
  await expect(page.getByText("ใช้การนอนล่าสุด")).toHaveCount(0);

  // Daily check: sleep should be marked done (today sleep exists)
  await page.getByRole("button", { name: /Daily check/ }).click();
  const sleepRow = page.locator("a").filter({ hasText: "บันทึกการนอน" });
  await expect(sleepRow.getByText("เสร็จ")).toBeVisible();
});

test("Today shows Readiness ล่าสุด and fallback note when only yesterday sleep exists", async ({ page }) => {
  const state = await installMockBackend(page);

  // Sleep from yesterday only (not today)
  state.history.push(makeSleepRecord(bangkokDateKey(-1), "sleep-yesterday"));

  await gotoApp(page, "/");

  // Readiness chip should say "ล่าสุด"
  await expect(page.locator(".rounded-full").filter({ hasText: /Readiness ล่าสุด/ }).first()).toBeVisible();

  // Coverage should show "ใช้การนอนล่าสุด"
  await expect(page.getByText("ใช้การนอนล่าสุด")).toBeVisible();

  // Fallback note appears
  await expect(page.getByText(/อิงจากข้อมูลการนอนล่าสุด/)).toBeVisible();

  // Daily check: sleep should still be marked MISSING (today sleep not uploaded)
  await page.getByRole("button", { name: /Daily check/ }).click();
  const sleepRow = page.locator("a").filter({ hasText: "บันทึกการนอน" });
  await expect(sleepRow.getByText("ยัง")).toBeVisible();
});

test("Today shows missing coverage for sleep when no sleep data at all", async ({ page }) => {
  await installMockBackend(page);
  // No sleep records at all

  await gotoApp(page, "/");

  // Missing chips include "บันทึกการนอน"
  await expect(page.getByText("+บันทึกการนอน").first()).toBeVisible();

  // Daily check: sleep missing
  await page.getByRole("button", { name: /Daily check/ }).click();
  const sleepRow = page.locator("a").filter({ hasText: "บันทึกการนอน" });
  await expect(sleepRow.getByText("ยัง")).toBeVisible();
});
