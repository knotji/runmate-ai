/**
 * Tests for the rolling 7-day insight card on the logs/report page.
 *
 * Covers:
 * - "วิ่ง 7 วัน" label (not "Load") in insight preview
 * - outdoor_run and treadmill both contribute to the 7-day total
 * - No runs → distance part is omitted entirely
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeRun(
  dateKey: string,
  id: string,
  distanceKm: number,
  workoutKind: "outdoor_run" | "treadmill" = "outdoor_run",
) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T16:00:00.000Z`,
    data: {
      date: dateKey,
      extracted: {
        workoutKind,
        distanceKm,
        duration: "00:40:00",
      },
    },
  };
}

function makeSleep(dateKey: string, id: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: 420,
        sleepScore: 76,
        restingHR: 50,
        hrv: 55,
      },
      coach: {
        readinessScore: 74,
        readinessLabel: "Good",
        aiSummary: "นอนดี",
        todayRecommendation: "ซ้อมได้",
      },
      confidence: "high",
      unclearFields: [],
    },
  };
}

// ─── Insight label must not say "Load" ────────────────────────────────────────

test("rolling insight shows 'วิ่ง 7 วัน' not 'Load'", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  state.history.push(makeRun(today, "run-wi-1", 10, "outdoor_run"));
  state.history.push(makeSleep(today, "sleep-wi-1"));

  await gotoApp(page, "/logs");

  const insight = page.getByTestId("rolling-insight");
  await expect(insight).toBeVisible();

  // Must use Thai label, not the old English "Load" label
  await expect(insight).toContainText("วิ่ง 7 วัน");
  await expect(insight).not.toContainText("Load 10");
});

// ─── treadmill is counted ──────────────────────────────────────────────────────

test("insight counts treadmill runs alongside outdoor runs", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  // outdoor_run: 6 km + treadmill: 4 km → total 10 km
  state.history.push(makeRun(today, "run-wi-outdoor", 6, "outdoor_run"));
  state.history.push(makeRun(today, "run-wi-treadmill", 4, "treadmill"));
  state.history.push(makeSleep(today, "sleep-wi-2"));

  await gotoApp(page, "/logs");

  const insight = page.getByTestId("rolling-insight");
  await expect(insight).toBeVisible();
  await expect(insight).toContainText("วิ่ง 7 วัน");
  // Both kinds contribute → should show 10 km total
  await expect(insight).toContainText("10");
});

// ─── No runs → insight omits distance entirely ────────────────────────────────

test("insight omits วิ่ง 7 วัน part when no runs in 7 days", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  state.history.push(makeSleep(today, "sleep-wi-3"));

  await gotoApp(page, "/logs");

  const insight = page.getByTestId("rolling-insight");
  await expect(insight).toBeVisible();
  // With only sleep data, no run distance section
  await expect(insight).not.toContainText("วิ่ง 7 วัน");
  await expect(insight).not.toContainText("Load");
});
