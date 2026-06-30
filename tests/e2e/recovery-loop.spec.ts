import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeSleep(dateKey: string, id: string, hours = 7) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: hours * 60,
        sleepScore: 76,
        restingHR: 50,
        hrv: 55,
      },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

function makeRun(dateKey: string, id: string, distanceKm: number, durationMin = 60) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T16:00:00.000Z`,
    data: {
      date: dateKey,
      extracted: { workoutKind: "outdoor_run", distanceKm, duration: `${String(Math.floor(durationMin / 60)).padStart(2, "0")}:${String(durationMin % 60).padStart(2, "0")}:00` },
    },
  };
}

// ─── Recovery Loop card visibility ───────────────────────────────────────────

test("Recovery Loop card is visible on Today page", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-vis"));

  await gotoApp(page, "/");

  await expect(page.getByTestId("recovery-loop-card")).toBeVisible();
});

test("Recovery Loop card shows sleep need label", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-sleep"));

  await gotoApp(page, "/");

  // Sleep need label always starts with "ควรนอน"
  await expect(page.getByText(/ควรนอน \d+(\.\d)?–\d+(\.\d)? ชม\./)).toBeVisible();
});

test("Recovery Loop card shows Day Load label", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-load"));

  await gotoApp(page, "/");

  // Card should show โหลดวันนี้ prefix
  await expect(page.getByTestId("recovery-loop-card").getByText("โหลดวันนี้")).toBeVisible();
});

test("Recovery Loop shows high Day Load with today run", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  // 15km today → score ≈ 15*6 + 60*0.4 = 90+24 = 114 → capped 90 → "สูงมาก"
  state.history.push(makeRun(today, "run-loop-high", 15, 75));
  state.history.push(makeSleep(today, "sleep-loop-high"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  // High or very_high load label should appear
  await expect(card.getByText(/สูงมาก|สูง/)).toBeVisible();
});

test("Recovery Loop tomorrow preview is visible", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-tomorrow"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  // Tomorrow preview headline always visible (not behind accordion)
  await expect(card.getByText(/พรุ่งนี้/)).toBeVisible();
});

test("Recovery Loop detail expands on ดูเหตุผล click", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  state.history.push(makeRun(today, "run-loop-expand", 12, 70));
  state.history.push(makeSleep(today, "sleep-loop-expand"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  // Detail section hidden by default
  await expect(card.getByText("ซ่อนเหตุผล")).toHaveCount(0);

  // Click to expand
  await card.getByText("ดูเหตุผล").click();

  // Now shows collapse label
  await expect(card.getByText("ซ่อนเหตุผล")).toBeVisible();
});
