import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeSleepRecord(dateKey: string, id: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T10:00:00.000Z`,
    data: {
      extracted: { date: dateKey, actualSleepDurationMinutes: 420, sleepScore: 78, restingHR: 50, hrv: 55 },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

// ─── Page order ───────────────────────────────────────────────────────────────

test("Today: ภาพรวมวันนี้ card appears before วันนี้ควรทำอะไร hero", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-order"));

  await gotoApp(page, "/");

  const overviewBox = await page.getByText("ภาพรวมวันนี้", { exact: true }).first().boundingBox();
  const heroBox = await page.getByText("วันนี้ควรทำอะไร", { exact: true }).boundingBox();

  expect(overviewBox).not.toBeNull();
  expect(heroBox).not.toBeNull();
  if (overviewBox && heroBox) {
    expect(overviewBox.y).toBeLessThan(heroBox.y);
  }
});

// ─── 2×2 ring layout ──────────────────────────────────────────────────────────

test("Today: 4 recovery factor bars visible inside recovery accordion (v0.2.2)", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-rings"));

  await gotoApp(page, "/");

  // Factor bars moved inside recovery-details collapse in v0.2.2 — expand first
  await page.locator('[data-testid="recovery-details"]').locator("summary").first().click();

  await expect(page.getByTestId("today-factor-bar")).toHaveCount(4);
  await expect(page.getByText("ฟื้นตัว", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("โหลดซ้อม", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("การนอน", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("พลังงาน", { exact: true }).first()).toBeVisible();
});

test("Today: no /100/100 duplicate in ring grid", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-nodup2"));

  await gotoApp(page, "/");
  await page.getByText("ดูรายละเอียด Recovery").click();

  await expect(page.getByText(/\d{1,3}\/100\/100/)).toHaveCount(0);
});

// ─── Details collapsed by default ─────────────────────────────────────────────

test("Today: coverage chips hidden until ดูรายละเอียด Recovery clicked", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-detail-default"));

  await gotoApp(page, "/");

  // Coverage text must NOT be visible by default
  await expect(page.getByText("ข้อมูลที่ใช้ประเมิน:")).toBeHidden();

  // After expanding, it appears
  await page.getByText("ดูรายละเอียด Recovery").click();
  await expect(page.getByText("ข้อมูลที่ใช้ประเมิน:")).toBeVisible();
});

// ─── Hero reason line ─────────────────────────────────────────────────────────

test("Today: hero card shows a reason line referencing recovery summary", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Push workouts to make Load high (reason line should mention Load สูง)
  for (let i = 0; i <= 3; i++) {
    state.history.push({
      id: `workout-reason-${i}`,
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${bangkokDateKey(-i)}T16:00:00.000Z`,
      data: { date: bangkokDateKey(-i), extracted: { workoutKind: "outdoor_run", distanceKm: 15, duration: "01:20:00" } },
    });
  }
  state.history.push(makeSleepRecord(today, "sleep-reason"));

  await gotoApp(page, "/");

  // Hero shows reason line containing Load (use first() to handle multiple matches)
  await expect(page.getByText(/Load (สูงมาก|สูง|ปานกลาง)/).first()).toBeVisible();
});

// ─── Upload page overflow ─────────────────────────────────────────────────────

test("Upload page has no horizontal overflow on mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await installMockBackend(page);
  await gotoApp(page, "/upload");

  // scrollWidth should not exceed viewport width
  const hasOverflow = await page.evaluate(() => document.body.scrollWidth > document.body.clientWidth);
  expect(hasOverflow).toBe(false);
});
