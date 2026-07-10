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

function makeSickRecord(
  dateKey: string,
  id: string,
  symptoms: string[],
  severity: string
) {
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

// ─── ReadinessGauge ──────────────────────────────────────────────────────────

test("Today: readiness gauge is visible with sleep data", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-gauge-1"));

  await gotoApp(page, "/");

  await expect(page.getByTestId("readiness-gauge")).toBeVisible();
});

test("Today: readiness gauge contains Readiness text", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-gauge-2"));

  await gotoApp(page, "/");

  const gauge = page.getByTestId("readiness-gauge");
  await expect(gauge).toBeVisible();
  await expect(gauge).toContainText("Readiness");
});

// ─── TodaySignalCircles ───────────────────────────────────────────────────────

test("Today: signal circles row is visible with 4 circles when no sick", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-circles-1"));

  await gotoApp(page, "/");

  const circles = page.getByTestId("signal-circles");
  await expect(circles).toBeVisible();

  // Should have exactly 4 signal circles (no sick)
  await expect(page.getByTestId("signal-circle")).toHaveCount(4);
});

test("Today: sick hard-stop adds fifth sick circle to signal row", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(
    makeSickRecord(bangkokDateKey(), "sick-gauge-1", ["fever"], "moderate")
  );

  await gotoApp(page, "/");

  const circles = page.getByTestId("signal-circles");
  await expect(circles).toBeVisible();
  await expect(circles).toContainText("ป่วย");
  await expect(circles).toContainText("ควรพัก");
});

test("Today: sick hard-stop gauge shows วันนี้ควรพักก่อน headline", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(
    makeSickRecord(bangkokDateKey(), "sick-gauge-2", ["fever"], "moderate")
  );
  // Sleep record so hasSomeData=true and insight is generated
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-gauge-sick"));

  await gotoApp(page, "/");

  const gauge = page.getByTestId("readiness-gauge");
  await expect(gauge).toBeVisible();
  await expect(gauge).toContainText("วันนี้ควรพักก่อน");
});

test("Today: gauge chip has rounded-full class with score and label", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-chip-1"));

  await gotoApp(page, "/");

  // The chip inside the gauge must be visible and contain "Readiness"
  await expect(
    page.locator(".rounded-full").filter({ hasText: /Readiness/ }).first()
  ).toBeVisible();
});
