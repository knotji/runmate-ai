/**
 * Training guardrail consistency tests — Task 9
 *
 * Verifies that getTodayTrainingGuardrail() returns the correct values for each scenario,
 * and that Today + Coach pages reflect the shared guardrail state.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSleep(dateKey: string, id: string, sleepScore: number, sleepMinutes = 300) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T10:00:00.000Z`,
    data: {
      extracted: { date: dateKey, actualSleepDurationMinutes: sleepMinutes, sleepScore },
      coach: { readinessScore: 65, readinessLabel: "Fair" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

function makeWorkout(dateKey: string, id: string, distanceKm = 10) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T16:00:00.000Z`,
    data: {
      date: dateKey,
      extracted: { workoutKind: "outdoor_run", distanceKm, duration: "01:00:00", avgHR: 140 },
    },
  };
}

function makePain(dateKey: string, id: string, painLevel = 5) {
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
      riskLevel: painLevel >= 5 ? "high" : "medium",
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

// ─── Scenario 1: Low recovery + very low sleep, no pain ───────────────────────

test("Guardrail 1: recovery 37 / sleep 15 / no pain → caution/warning, no hard workout", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // sleep score 15 (well below 40 threshold) — drives low recovery + low sleep
  state.history.push(makeSleep(today, "sleep-g1", 15, 90));
  state.history.push(makeWorkout(bangkokDateKey(-1), "w-g1-1", 10));
  state.history.push(makeWorkout(bangkokDateKey(-2), "w-g1-2", 10));

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 55,
          readinessLabel: "Fair",
          readinessNote: "นอนน้อยและฟื้นตัวต่ำ",
          workoutRec: "Easy Run",
          workoutTarget: "HR ต่ำกว่า 140",
          weekSummary: "สะสม 20km",
          keyObservation: "sleep ต่ำ",
          coachMessage: "วันนี้คุมเบาไว้",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Coaching interpretation line must appear (not null/success state)
  const coachLine = page.getByTestId("coaching-interpretation-line");
  await expect(coachLine).toBeVisible();

  // Line must express caution — not a push/hard stance
  const text = await coachLine.textContent();
  expect(text).not.toMatch(/ลุยเต็มที่|กด pace|ชนแผนหนัก/i);

  // Factor bars must not show danger (no active pain)
  const bars = await page.getByTestId("today-factor-bar").all();
  for (const bar of bars) {
    const tone = await bar.getAttribute("data-tone");
    expect(tone).not.toBe("danger");
  }
});

// ─── Scenario 2: Low sleep, no pain → no hard workout recommended ─────────────

test("Guardrail 2: low sleep, no pain → no Tempo/Intervals recommendation", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push(makeSleep(today, "sleep-g2", 20, 90)); // very low sleep

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 60,
          readinessLabel: "Fair",
          readinessNote: "นอนน้อย",
          workoutRec: "Easy Run 5km",
          workoutTarget: "HR ต่ำกว่า 140",
          weekSummary: "สะสม 5km",
          keyObservation: "นอนน้อย",
          coachMessage: "คุมเบา",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Coaching line should be visible
  await expect(page.getByTestId("coaching-interpretation-line")).toBeVisible();

  // Coach context dashboard should NOT show "ร่างกายพร้อมลุยเต็มที่" stance
  const dashboard = page.getByTestId("coach-context-dashboard");
  // Navigate to coach page to check
  await gotoApp(page, "/coach");
  const coachDashboard = page.getByTestId("coach-context-dashboard");
  await expect(coachDashboard).toBeVisible();
  const dashText = await coachDashboard.textContent();
  expect(dashText).not.toContain("ร่างกายพร้อมลุยเต็มที่");
});

// ─── Scenario 3: Active pain → avoids run, danger/warning tone ───────────────

test("Guardrail 3: active pain → coaching line shows rest/avoid copy", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Low sleep + active pain
  state.history.push(makeSleep(today, "sleep-g3", 20, 90));
  state.history.push(makePain(today, "pain-g3", 6));

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 50,
          readinessLabel: "Fair",
          readinessNote: "เจ็บ",
          workoutRec: "งดวิ่ง / พัก",
          workoutTarget: "Recovery Day",
          weekSummary: "สะสม 5km",
          keyObservation: "เจ็บเข่า",
          coachMessage: "ยังมีอาการเจ็บ ควรเลี่ยงวิ่ง",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Coaching interpretation line must appear
  const coachLine = page.getByTestId("coaching-interpretation-line");
  await expect(coachLine).toBeVisible();

  // Line must contain pain-relevant language
  const text = await coachLine.textContent();
  const hasPainCopy = text?.includes("เจ็บ") || text?.includes("เลี่ยง") || text?.includes("recovery") ||
    text?.includes("พัก") || text?.includes("ลด");
  expect(hasPainCopy).toBe(true);
});

// ─── Scenario 4: Critical combined risk → danger allowed ─────────────────────

test("Guardrail 4: critical combined (low rec + very low sleep + high load) → coaching line warns strongly", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Very low sleep + 5 heavy workouts = high load
  state.history.push(makeSleep(today, "sleep-g4", 15, 60)); // sleep score 15
  for (let i = 0; i < 5; i++) {
    state.history.push(makeWorkout(bangkokDateKey(-i), `workout-g4-${i}`, 15));
  }

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 40,
          readinessLabel: "Low",
          readinessNote: "ความล้าสูง",
          workoutRec: "พักเต็มวัน",
          workoutTarget: "Rest",
          weekSummary: "สะสม 75km",
          keyObservation: "load สูงมาก sleep ต่ำ",
          coachMessage: "ต้องพัก",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Factor bars are inside recovery-details collapse (v0.2.2) — expand first
  await page.locator('[data-testid="recovery-details"]').locator("summary").first().click();

  // Factor bars visible
  await expect(page.getByTestId("today-factor-bar").first()).toBeVisible();

  // Coaching interpretation line should appear (critical combined may trigger danger or warning)
  const coachLine = page.getByTestId("coaching-interpretation-line");
  await expect(coachLine).toBeVisible();

  // Should express caution / warning / danger — not push
  const text = await coachLine.textContent();
  const isCalm = text != null && !text.match(/ลุยเต็มที่|กดแรง|ชนแผนหนัก/i);
  expect(isCalm).toBe(true);
});

// ─── Scenario 5: Coach guardrail message visible for low recovery state ───────

test("Guardrail 5: Coach page shows guardrail message when sleep low", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push(makeSleep(today, "sleep-g5", 15, 90));

  await gotoApp(page, "/coach");

  const dashboard = page.getByTestId("coach-context-dashboard");
  await expect(dashboard).toBeVisible();

  // Guardrail message should appear in coach dashboard when not neutral/success state
  const guardrailMsg = page.getByTestId("coach-guardrail-message");
  await expect(guardrailMsg).toBeVisible();

  const msgText = await guardrailMsg.textContent();
  expect(msgText?.length).toBeGreaterThan(5);
});

// ─── Scenario 6: Suggested question chips appear on coach page ────────────────

test("Guardrail 6: Coach page shows suggested question chips", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push(makeSleep(today, "sleep-g6", 20, 90));

  await gotoApp(page, "/coach");

  await expect(page.getByTestId("coach-context-dashboard")).toBeVisible();

  // Suggested chips should appear
  const chips = page.getByTestId("coach-suggested-chip");
  const count = await chips.count();
  expect(count).toBeGreaterThanOrEqual(2);
});

// ─── Scenario 7: Report shows weekly coach insight when review has data ───────

test("Guardrail 7: Report shows weekly coach insight inside rolling insight", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Add sleep + workouts so review has useful data
  state.history.push(makeSleep(today, "sleep-rep", 15, 90));
  state.history.push(makeSleep(bangkokDateKey(-1), "sleep-rep-2", 20, 100));
  state.history.push(makeWorkout(bangkokDateKey(-1), "workout-rep", 10));
  state.history.push(makeWorkout(bangkokDateKey(-2), "workout-rep-2", 10));

  await gotoApp(page, "/logs");

  // Expand the rolling insight section
  const rollingInsight = page.getByTestId("rolling-insight");
  await expect(rollingInsight).toBeVisible();

  // Open the details (use the first summary inside rolling-insight)
  const summary = rollingInsight.locator("summary").first();
  await summary.click();

  // Weekly coach insight should appear
  const coachInsight = page.getByTestId("weekly-coach-insight");
  await expect(coachInsight).toBeVisible();

  // Insight text should be meaningful
  const text = await coachInsight.textContent();
  expect(text?.length).toBeGreaterThan(10);
});

// ─── Scenario 8: Upload empty guide shows type-level helper copy ──────────────

test("Guardrail 8: Upload empty guide shows sleep helper copy", async ({ page }) => {
  await installMockBackend(page);
  // The empty guide only renders in focused mode — deep-link straight into the sleep type.
  await gotoApp(page, "/upload?type=sleep");

  const helpGuide = page.getByTestId("upload-help").first();
  await expect(helpGuide).toBeVisible();

  const text = await helpGuide.textContent();
  // The helper copy should mention Samsung Health or sleep-related terms
  const hasSleepCopy = text?.includes("Samsung Health") || text?.includes("sleep") ||
    text?.includes("HRV") || text?.includes("นอน");
  expect(hasSleepCopy).toBe(true);
});
