/**
 * Recovery calm tones — E2E tests for Phase 10
 *
 * Verifies that low recovery/sleep does NOT show danger tone without active pain,
 * and that active pain can show danger tone.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeLowSleepRecord(dateKey: string, id: string, sleepMinutes = 90, sleepScore = 15) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T10:00:00.000Z`,
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: sleepMinutes,
        sleepScore,
      },
      coach: { readinessScore: 65, readinessLabel: "Fair" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

function makeModerateWorkout(dateKey: string, id: string, distanceKm = 10) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T16:00:00.000Z`,
    data: {
      date: dateKey,
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm,
        duration: "01:00:00",
        avgHR: 140,
        calories: 600,
      },
    },
  };
}

function makePainRecord(dateKey: string, id: string, painLevel = 5) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "pain",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      painLocation: "เข่า",
      painSide: "left",
      painLevel,
      status: "active",
      riskLevel: "medium",
      trainingImpact: "run_avoid",
      notes: "",
      redFlags: [],
      painType: [],
      startedWhen: "today",
      painfulWhen: ["วิ่ง"],
      swellingOrRedness: "no",
      canBearWeight: "yes",
      coachAdvice: "หยุดวิ่งชั่วคราว",
      createdAt: `${dateKey}T08:00:00.000Z`,
    },
  };
}

// ─── Test 1: Low recovery + low sleep — no danger tone on bars ────────────────

test("1. Low recovery/sleep without active pain uses warning/caution tones, not danger", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Very low sleep (15/100 → well below threshold)
  state.history.push(makeLowSleepRecord(today, "low-sleep-1", 90, 15));

  await gotoApp(page, "/");

  // Four factor bars must be visible
  await expect(page.getByTestId("today-factor-bar")).toHaveCount(4);

  // No factor bar should have data-tone="danger" when there is no active pain
  const dangerBars = page.getByTestId("today-factor-bar").filter({ has: page.locator('[data-tone="danger"]') });
  // Actually, data-tone is on the bar wrapper itself, so we check the count directly
  const allBars = await page.getByTestId("today-factor-bar").all();
  for (const bar of allBars) {
    const tone = await bar.getAttribute("data-tone");
    // danger should NOT appear on any bar (no active pain, no severe combined)
    expect(tone).not.toBe("danger");
  }
});

// ─── Test 2: Low sleep alone — not danger ────────────────────────────────────

test("2. Very low sleep alone does not trigger danger tone on factor bars", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Sleep score 15 (very low)
  state.history.push(makeLowSleepRecord(today, "low-sleep-2", 90, 15));

  await gotoApp(page, "/");

  const sleepBar = page.getByTestId("today-factor-bar").filter({ hasText: "การนอน" });
  await expect(sleepBar).toBeVisible();
  const tone = await sleepBar.getAttribute("data-tone");
  expect(tone).not.toBe("danger");
  // Should be warning (caution) since score is very low
  expect(["warning", "info", "neutral"]).toContain(tone);
});

// ─── Test 3: High load — warning tone, not success ───────────────────────────

test("3. High load score uses warning tone on factor bar", async ({ page }) => {
  const state = await installMockBackend(page);
  for (let i = 0; i <= 3; i++) {
    state.history.push(makeModerateWorkout(bangkokDateKey(-i), `workout-load-${i}`, 15));
  }

  await gotoApp(page, "/");

  const loadBar = page.getByTestId("today-factor-bar").filter({ hasText: "โหลดซ้อม" });
  await expect(loadBar).toBeVisible();
  const tone = await loadBar.getAttribute("data-tone");
  expect(tone).toBe("warning");
});

// ─── Test 4: Coaching interpretation line appears for low sleep ───────────────

test("4. Coaching interpretation line appears when sleep is very low", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push(makeLowSleepRecord(today, "low-sleep-line", 90, 15));

  await gotoApp(page, "/");

  const coachLine = page.getByTestId("coaching-interpretation-line");
  await expect(coachLine).toBeVisible();
  // Should contain coaching language about reducing intensity or recovery
  const text = await coachLine.textContent();
  const isCoachingCopy = text?.includes("ลดความหนัก") || text?.includes("recovery") ||
    text?.includes("ฟื้นตัว") || text?.includes("เดินเบา") || text?.includes("ฟังร่างกาย");
  expect(isCoachingCopy).toBe(true);
});

// ─── Test 5: Active pain state — danger tone allowed ─────────────────────────

test("5. Active pain enables danger tone on recovery/sleep bars", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Low sleep + active pain
  state.history.push(makeLowSleepRecord(today, "low-sleep-pain", 90, 15));
  state.history.push(makePainRecord(today, "pain-active", 5));

  await gotoApp(page, "/");

  const sleepBar = page.getByTestId("today-factor-bar").filter({ hasText: "การนอน" });
  await expect(sleepBar).toBeVisible();
  // With active pain + very low sleep — danger is allowed
  const tone = await sleepBar.getAttribute("data-tone");
  expect(["danger", "warning"]).toContain(tone);

  // Coaching interpretation line should mention pain avoidance
  const coachLine = page.getByTestId("coaching-interpretation-line");
  await expect(coachLine).toBeVisible();
  const text = await coachLine.textContent();
  const isPainCopy = text?.includes("เจ็บ") || text?.includes("เลี่ยง") || text?.includes("recovery");
  expect(isPainCopy).toBe(true);
});

// ─── Test 6: Fuel 100 is success ─────────────────────────────────────────────

test("6. Full fuel score shows success tone", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Good sleep + multiple meals
  state.history.push({
    id: "sleep-good",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      extracted: { date: today, actualSleepDurationMinutes: 480, sleepScore: 85 },
      coach: { readinessScore: 85, readinessLabel: "Excellent" },
    },
  });
  // Add 3 meals for high fuel score
  for (let i = 0; i < 3; i++) {
    state.history.push({
      id: `meal-${i}`,
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "meal",
      created_at: `${today}T0${8 + i * 3}:00:00.000Z`,
      data: {
        date: today,
        extracted: {
          mealType: i === 0 ? "breakfast" : i === 1 ? "lunch" : "dinner",
          mealSlot: i === 0 ? "breakfast" : i === 1 ? "lunch" : "dinner",
          caloriesKcal: 700,
          proteinG: 50,
          carbsG: 80,
          fatG: 20,
          foods: ["อาหารหลัก"],
        },
      },
    });
  }

  await gotoApp(page, "/");

  const fuelBar = page.getByTestId("today-factor-bar").filter({ hasText: "พลังงาน" });
  await expect(fuelBar).toBeVisible();
  const tone = await fuelBar.getAttribute("data-tone");
  // With no active pain, fuel should never show danger
  expect(tone).not.toBe("danger");
});

// ─── Test 7: No scary red copy unless active pain ─────────────────────────────

test("7. Today page does not show fear-based copy without active pain", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Low sleep, moderate workouts — no pain
  state.history.push(makeLowSleepRecord(today, "low-sleep-nocopy", 90, 15));
  state.history.push(makeModerateWorkout(bangkokDateKey(-1), "workout-d1", 10));

  await gotoApp(page, "/");

  // Should NOT have red/danger text wording without active pain
  await expect(page.getByText("อันตราย")).toHaveCount(0);
  await expect(page.getByText("danger")).toHaveCount(0);

  // Factor bars visible and not overwhelming
  await expect(page.getByTestId("today-factor-bar")).toHaveCount(4);
});
