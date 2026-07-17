/**
 * Sleep/readiness trend charts inside the Report page's "Insight 7 วันล่าสุด"
 * section — a 21-day view built from data already loaded for the page (no new
 * fetch), reusing the same per-day aggregation the Calendar day slots use.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeSleep(dateKey: string, id: string, hours: number, readiness: number) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    // 08:00 UTC = 15:00 Bangkok — safely the same calendar day, unlike a UTC
    // evening hour which would roll into the next Bangkok day and silently
    // shift the item out of the plotted trend window.
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      dateKey,
      extracted: { date: dateKey, actualSleepDurationMinutes: Math.round(hours * 60), sleepScore: 76, restingHR: 50, hrv: 55 },
      coach: { readinessScore: readiness, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

async function openInsight(page: Parameters<typeof gotoApp>[0]) {
  await gotoApp(page, "/logs");
  await page.getByTestId("rolling-insight").locator("summary").first().click();
}

test("trend charts render when there is recent sleep history", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  const yesterday = bangkokDateKey(-1);
  state.history.push(makeSleep(today, "sleep-t1", 7.5, 74));
  state.history.push(makeSleep(yesterday, "sleep-t2", 6.8, 68));

  await openInsight(page);

  const charts = page.getByTestId("trend-mini-chart-svg");
  await expect(charts).toHaveCount(2);
});

test("tapping a point shows a date + value tooltip", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  state.history.push(makeSleep(today, "sleep-t1", 7.5, 74));

  await openInsight(page);

  const sleepChart = page.getByTestId("trend-mini-chart-svg").first();
  const hitTargets = sleepChart.locator('[data-testid="trend-mini-chart-hit-target"]');
  await hitTargets.last().click();

  const tooltip = page.getByTestId("trend-mini-chart-tooltip").first();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("7.5");
});

test("chart section is absent when there is history but none of it is sleep/readiness data", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  // A meal-only week: enough history for the normal Report/Insight layout to
  // render (not the separate "no data at all" empty state), but nothing the
  // trend chart can plot.
  state.history.push({
    id: "meal-only",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "meal",
    created_at: `${today}T05:00:00.000Z`,
    data: { mealType: "lunch", detectedFoods: [{ name: "ข้าวผัด" }], nutrition: { caloriesKcal: 500, proteinG: 20, carbsG: 60, fatG: 15, fiberG: 2 } },
  });

  await openInsight(page);

  await expect(page.getByTestId("trend-mini-chart-svg")).toHaveCount(0);
});
