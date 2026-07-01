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

// ─── Today factor bars + expanded axis details ───────────────────────────────

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

test("Today factor bars show the four axis title labels", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-today-2"));

  await gotoApp(page, "/");

  await expect(page.getByTestId("today-factor-bar")).toHaveCount(4);
  await expect(page.getByText("ฟื้นตัว", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("โหลดซ้อม", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("การนอน", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("พลังงาน", { exact: true }).first()).toBeVisible();
});

test("Today axis grid does not render old combined text-only format", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-today-3"));

  await gotoApp(page, "/");

  // Old-style combined labels must NOT appear
  await expect(page.getByText("โหลดสูงสุด")).toHaveCount(0);
  // Labels must not appear without a /100 score nearby — validated by presence of /100 texts above
});

// ─── Factor bars always visible, no Daily Check chip ─────────────────────────

test("Today recovery factor bars are visible without expanding accordion", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-ring-1"));

  await gotoApp(page, "/");

  await expect(page.getByTestId("today-factor-bar")).toHaveCount(4);
  await expect(page.getByText("ฟื้นตัว", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("โหลดซ้อม", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("การนอน", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("พลังงาน", { exact: true }).first()).toBeVisible();

  // Daily Check chip must NOT be visible in the overview card
  await expect(page.getByText(/Daily check/)).toHaveCount(0);
});

test("Today Load factor bar has data-tone warning when load is high", async ({ page }) => {
  const state = await installMockBackend(page);
  // 4 past runs + 1 today = 60km total, freq 5 → load score ≥ 70 (สูง → warning)
  for (let i = 0; i <= 3; i++) {
    state.history.push({
      id: `workout-load-${i}`,
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${bangkokDateKey(-i)}T16:00:00.000Z`,
      data: {
        date: bangkokDateKey(-i),
        extracted: { workoutKind: "outdoor_run", distanceKm: 15, duration: "01:20:00" },
      },
    });
  }

  await gotoApp(page, "/");

  // The โหลดซ้อม factor bar should have data-tone="warning" (amber, not success)
  const loadBar = page.getByTestId("today-factor-bar").filter({ hasText: "โหลดซ้อม" });
  await expect(loadBar).toHaveAttribute("data-tone", "warning");
});

// ─── Phase 7B: Coach page numeric axes ───────────────────────────────────────

test("Coach page Recovery card shows /100 for all axes after expanding", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-coach"));

  await gotoApp(page, "/coach");

  // CoachContextDashboard uses "ดูบริบท" details toggle
  await page.getByText("ดูบริบท").first().click();

  // Axis grid in "Recovery วันนี้" section should contain X/100 scores
  const axisScores = page.locator("text=/\\d{1,3}\\/100/");
  await expect(axisScores.first()).toBeVisible();
  const count = await axisScores.count();
  expect(count).toBeGreaterThanOrEqual(4);

  // Axis title labels present (matching ReadinessCard label convention)
  await expect(page.getByText("ฟื้นตัว", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("โหลดซ้อม", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("การนอน", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("พลังงาน", { exact: true }).first()).toBeVisible();
});

// ─── Phase 7B+: No duplicate /100/100 anywhere ───────────────────────────────

test("No duplicated /100/100 score appears on Today page", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-nodup"));

  await gotoApp(page, "/");

  // Expand the recovery axis details
  await page.getByText("ดูรายละเอียด Recovery").click();

  // Must not contain any /100/100 format
  await expect(page.getByText(/\d{1,3}\/100\/100/)).toHaveCount(0);
});

// ─── Phase 7C: Report Recovery Trend ─────────────────────────────────────────

test("Report แนวโน้ม Recovery 7 วัน shows /100 numeric values", async ({ page }) => {
  const state = await installMockBackend(page);

  // Push a few sleep records to populate weekly review
  for (let i = 1; i <= 3; i++) {
    state.history.push(makeSleepRecord(bangkokDateKey(-i), `sleep-report-${i}`));
  }

  await gotoApp(page, "/logs");
  await page.getByText("Insight 7 วันล่าสุด").click();

  const trendCard = page.locator("section").filter({ hasText: "แนวโน้ม Recovery 7 วัน" }).first();
  await expect(trendCard).toBeVisible();

  // At least one /100 visible inside the trend card
  await expect(trendCard.locator("text=/\\d{1,3}\\/100/").first()).toBeVisible();
});
