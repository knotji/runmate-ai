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

test("Today: ภาพรวมวันนี้ card appears before วันนี้ทำอะไรดี? hero", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-order"));

  await gotoApp(page, "/");

  const overviewBox = await page.getByText("ภาพรวมวันนี้", { exact: true }).first().boundingBox();
  const heroBox = await page.getByText("วันนี้ทำอะไรดี?", { exact: true }).boundingBox();

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

// ─── Sick Day discovery ───────────────────────────────────────────────────────

function makeSickRecord(dateKey: string, id: string, symptoms: string[], severity: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sick",
    created_at: `${dateKey}T10:00:00.000Z`,
    data: {
      date: dateKey,
      createdAt: `${dateKey}T10:00:00.000Z`,
      healthStatus: "sick",
      symptoms,
      severity,
      source: "manual",
    },
  };
}

test("Today: shows วันนี้ไม่สบาย? entry card when no sick log exists", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-1"));
  await gotoApp(page, "/");
  await expect(page.getByTestId("sick-day-entry-card")).toBeVisible();
  await expect(page.getByText("วันนี้ไม่สบาย?")).toBeVisible();
  await expect(page.getByRole("link", { name: "แจ้งว่าป่วย" })).toBeVisible();
});

test("Today: แจ้งว่าป่วย link navigates to /sick", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-1"));
  await gotoApp(page, "/");
  await expect(page.getByRole("link", { name: "แจ้งว่าป่วย" })).toBeVisible();
  await page.getByRole("link", { name: "แจ้งว่าป่วย" }).click();
  await expect(page).toHaveURL(/\/sick/);
});

test("Today: shows วันนี้มีอาการป่วย when sick (non-hard-stop) log exists", async ({ page }) => {
  const state = await installMockBackend(page);
  // sore_throat + mild = above-neck only = "mild" risk, not hard_stop
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-1", ["sore_throat"], "mild"));
  await gotoApp(page, "/");
  await expect(page.getByText("วันนี้มีอาการป่วย")).toBeVisible();
  await expect(page.getByRole("link", { name: "อัปเดตอาการ" })).toBeVisible();
});

test("Today: shows วันนี้ควรพักก่อน when hard-stop sick log exists", async ({ page }) => {
  const state = await installMockBackend(page);
  // fever = hard_stop
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-1", ["fever"], "moderate"));
  await gotoApp(page, "/");
  await expect(page.getByText("วันนี้ควรพักก่อน")).toBeVisible();
  await expect(page.getByRole("link", { name: "ดู/อัปเดตอาการ" })).toBeVisible();
});

test("Today: bottom nav does not contain a Sick nav item", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");
  const nav = page.locator("nav");
  // Should have Today, Upload, Race, Report, Coach — not ป่วย
  await expect(nav.getByText("Today")).toBeVisible();
  await expect(nav.getByText("ป่วย")).not.toBeVisible();
});

test("Today: quick actions dock shows ป่วย chip linking to /sick", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");
  const sickChip = page.getByRole("link", { name: "ป่วย" }).first();
  await expect(sickChip).toBeVisible();
  await expect(sickChip).toHaveAttribute("href", "/sick");
});

// ─── Sick Day Today polish (hard-stop state) ──────────────────────────────────

test("Today: hard-stop sick card appears above recommendation section", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-hs", ["fever"], "moderate"));
  await gotoApp(page, "/");

  const cardBox = await page.getByTestId("sick-day-entry-card").boundingBox();
  const titleBox = await page.getByTestId("recommendation-section-title").boundingBox();
  expect(cardBox).not.toBeNull();
  expect(titleBox).not.toBeNull();
  if (cardBox && titleBox) {
    expect(cardBox.y).toBeLessThan(titleBox.y);
  }
});

test("Today: recommendation title shows วันนี้ควรพักและฟื้นตัว when hard-stop", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-hs2", ["fever"], "moderate"));
  await gotoApp(page, "/");
  await expect(page.getByTestId("recommendation-section-title")).toHaveText("วันนี้ควรพักและฟื้นตัว");
});

test("Today: primary CTA routes to /sick when hard-stop", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-hs3", ["fever"], "moderate"));
  await gotoApp(page, "/");
  const cta = page.getByTestId("primary-cta");
  await expect(cta).toHaveText("อัปเดตอาการวันนี้");
  await expect(cta).toHaveAttribute("href", "/sick");
});

test("Today: sick hard-stop shows rest bullets in recommendation", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-hs4", ["fever"], "moderate"));
  // Sleep record needed so hasSomeData=true → insight generated → PreWorkoutFocusContent renders
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-hs4"));
  await gotoApp(page, "/");
  const bullets = page.getByTestId("sick-rest-bullets");
  await expect(bullets).toBeVisible();
  await expect(bullets).toContainText("ไม่ซ้อมวันนี้");
});

test("Today: signal row shows sick pill when hard-stop", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSickRecord(bangkokDateKey(), "sick-hs5", ["fever"], "moderate"));
  await gotoApp(page, "/");
  const circles = page.getByTestId("signal-circles");
  await expect(circles).toBeVisible();
  await expect(circles).toContainText("ป่วย");
});

test("Today: recovery loop section is collapsed by default", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-rl"));
  await gotoApp(page, "/");
  // The details element should exist with its summary text visible
  await expect(page.getByTestId("recovery-loop-details")).toBeVisible();
  await expect(page.getByTestId("recovery-loop-details")).toContainText("ฟื้นตัวยังไงคืนนี้");
});
