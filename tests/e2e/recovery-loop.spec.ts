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

test("Recovery Loop card shows human day load copy, not debug label", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-load"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  // No-activity copy: natural coaching language
  await expect(card.getByTestId("day-load-context")).toContainText("วันนี้ยังไม่มีโหลดซ้อมหลัก");
  // Must NOT show old debug-like prefix
  await expect(card.getByText("โหลดวันนี้")).toHaveCount(0);
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

// ─── Phase 6: Copy polish and ordering tests ──────────────────────────────────

test("Recovery Loop no-activity shows human copy, not debug label", async ({ page }) => {
  const state = await installMockBackend(page);
  // Only sleep, no workout today
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-noact"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  await expect(card.getByTestId("day-load-context")).toContainText("วันนี้ยังไม่มีโหลดซ้อมหลัก");
  // Must not show old debug fragment
  await expect(card.getByText(/ยังไม่มีกิจกรรม/)).toHaveCount(0);
});

test("Recovery Loop card shows sleep target before day load context", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-loop-order"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  // Both elements exist
  const sleepEl = card.getByText(/ควรนอน \d/);
  const loadEl = card.getByTestId("day-load-context");
  await expect(sleepEl).toBeVisible();
  await expect(loadEl).toBeVisible();

  // Sleep target's bounding box top should be higher (lower Y) than load context
  const sleepBox = await sleepEl.boundingBox();
  const loadBox = await loadEl.boundingBox();
  expect(sleepBox!.y).toBeLessThan(loadBox!.y);
});

test("Recovery Loop high load shows human copy with activity detail", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  // 15km today → very_high load
  state.history.push(makeRun(today, "run-loop-human-high", 15, 75));
  state.history.push(makeSleep(today, "sleep-loop-human-high"));

  await gotoApp(page, "/");

  const card = page.getByTestId("recovery-loop-card");
  // Human copy for very_high: "วันนี้โหลดสูงมาก ควรเน้นฟื้นตัว"
  await expect(card.getByTestId("day-load-context")).toContainText("วันนี้โหลดสูงมาก");
  // Activity detail appended
  await expect(card.getByTestId("day-load-context")).toContainText("15 km");
});
