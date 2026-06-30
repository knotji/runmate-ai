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
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: 420,
        sleepScore: 78,
        restingHR: 50,
        hrv: 55,
      },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

// ─── Phase 7A: Today 4-axis grid ─────────────────────────────────────────────

test("Today axis grid shows four numeric /100 scores", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-today"));

  await gotoApp(page, "/");

  // Expand the recovery system details first
  await page.getByText("ดูรายละเอียด Recovery").click();

  // At least 4 texts matching NN/100 must be visible in the axis grid section
  const axisScores = page.locator("text=/\\d{1,3}\\/100/");
  await expect(axisScores.first()).toBeVisible();
  const count = await axisScores.count();
  expect(count).toBeGreaterThanOrEqual(4);
});

test("Today axis grid shows axis title labels ฟื้นตัว โหลดซ้อม การนอน พลังงาน", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-today-2"));

  await gotoApp(page, "/");

  // Expand the recovery system details first
  await page.getByText("ดูรายละเอียด Recovery").click();

  await expect(page.getByText("ฟื้นตัว", { exact: true })).toBeVisible();
  await expect(page.getByText("โหลดซ้อม", { exact: true })).toBeVisible();
  await expect(page.getByText("การนอน", { exact: true })).toBeVisible();
  await expect(page.getByText("พลังงาน", { exact: true })).toBeVisible();
});

test("Today axis grid does not render old combined text-only format", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-today-3"));

  await gotoApp(page, "/");

  // Old-style combined labels must NOT appear
  await expect(page.getByText("โหลดสูงสุด")).toHaveCount(0);
  // Labels must not appear without a /100 score nearby — validated by presence of /100 texts above
});

// ─── Phase 7B: Coach page numeric axes ───────────────────────────────────────

test("Coach page Recovery card shows /100 for all axes after expanding", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-coach"));

  await gotoApp(page, "/coach");

  // ReadinessCard starts collapsed — expand it first
  await page.getByRole("button", { name: "ดูรายละเอียด" }).first().click();

  // Axis grid under ReadinessCard should contain /100 texts
  const axisScores = page.locator("text=/\\d{1,3}\\/100/");
  await expect(axisScores.first()).toBeVisible();
  const count = await axisScores.count();
  expect(count).toBeGreaterThanOrEqual(4);

  // Axis title labels present
  await expect(page.getByText("ฟื้นตัว", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("โหลดซ้อม", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("การนอน", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("พลังงาน", { exact: true }).first()).toBeVisible();
});

// ─── Phase 7C: Report Recovery Trend ─────────────────────────────────────────

test("Report แนวโน้ม Recovery 7 วัน shows /100 numeric values", async ({ page }) => {
  const state = await installMockBackend(page);

  // Push a few sleep records to populate weekly review
  for (let i = 1; i <= 3; i++) {
    state.history.push(makeSleepRecord(bangkokDateKey(-i), `sleep-report-${i}`));
  }

  await gotoApp(page, "/logs");

  const trendCard = page.locator("section").filter({ hasText: "แนวโน้ม Recovery 7 วัน" }).first();
  await expect(trendCard).toBeVisible();

  // At least one /100 visible inside the trend card
  await expect(trendCard.locator("text=/\\d{1,3}\\/100/").first()).toBeVisible();
});
