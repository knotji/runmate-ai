/**
 * Beta polish tests for race-goal page:
 * 1. TodayWorkoutCard shows completed state when today's run meets >= 80% of planned km
 * 2. Race names with colon syntax are cleaned in display (formatRaceDisplayName)
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const GOAL_ID = "goal-polish-1";
const PLAN_ID = "plan-polish-1";

async function setupRacePlanWithTodayRun(
  page: Parameters<typeof gotoApp>[0],
  raceName: string,
  plannedKm: number,
) {
  const today = bangkokDateKey();
  const raceDate = bangkokDateKey(60);

  await page.route("**/rest/v1/race_goals*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: GOAL_ID,
        race_name: raceName,
        race_date: raceDate,
        race_distance: "Half Marathon",
        goal_type: "finish",
        target_time: "1:45:00",
        current_longest_run_km: null,
        training_days_per_week: null,
        preferred_long_run_day: null,
        injury_notes: null,
        plan_preference: null,
        status: "active",
      }]),
    });
  });

  const mockPlan = {
    // planStartDate = today so offsetDays=0 → selectTodayFromWeeklyPlan returns weeklyPlan[0]
    planStartDate: today,
    totalWeeks: 8,
    currentPhase: "Base",
    planSummary: "Test plan",
    weeklyPlan: [
      {
        day: "Long Run Day",
        workoutType: "Long Run",
        distanceKm: plannedKm,
        description: "วิ่งยาวสะสมเวลา",
        durationMin: 90,
        purpose: "Endurance base",
        adjustment: null,
      },
    ],
  };

  await page.route("**/rest/v1/training_plans*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ id: PLAN_ID }]) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: PLAN_ID,
        race_goal_id: GOAL_ID,
        start_date: bangkokDateKey(-7),
        phases_json: mockPlan,
      }]),
    });
  });

  return today;
}

function workoutItem(id: string, dateKey: string, distanceKm: number) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        date: dateKey,
        distanceKm,
        duration: "01:15:00",
        avgPace: "5:00",
        avgHR: 155,
        maxHR: 170,
        calories: 800,
        elevationGain: 50,
      },
      coach: {
        workoutSummary: "วิ่งได้ดี",
        intensityAssessment: "สูง",
        trainingLoadNote: "โหลดสูง",
        wasTooHard: false,
        recoveryAdvice: "พักผ่อน",
        nutritionAfterWorkout: "เติมคาร์บ",
        nextWorkoutSuggestion: "easy run",
        coachNote: "ดีมาก",
      },
      confidence: "high",
      unclearFields: [],
    },
  };
}

test("TodayWorkoutCard shows completed state when run >= 80% of planned", { timeout: 60000 }, async ({ page }) => {
  const state = await installMockBackend(page);
  const today = await setupRacePlanWithTodayRun(page, "Bangkok Marathon", 15);

  // Add a today run of 13 km (= 86.7% of 15, above 80% threshold)
  state.history.push(workoutItem("run-today-1", today, 13));

  await gotoApp(page, "/race-goal");

  // Use testid for reliable targeting — cold dev server may take 20s to compile on first test
  const completedCard = page.getByTestId("today-workout-completed-card");
  await expect(completedCard).toBeVisible({ timeout: 30000 });
  await expect(completedCard.getByText(/13\.0 กม\./).first()).toBeVisible();
  // Pre-workout card should be gone
  await expect(page.getByText("วันนี้แผนซ้อมปรับตามร่างกาย")).toHaveCount(0);
});

test("TodayWorkoutCard shows pre-workout card when run < 80% of planned", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = await setupRacePlanWithTodayRun(page, "Bangkok Marathon", 15);

  // Add a today run of 8 km (= 53%, below 80% threshold)
  state.history.push(workoutItem("run-today-short", today, 8));

  await gotoApp(page, "/race-goal");

  // Should still show pre-workout card
  await expect(page.getByText("วันนี้แผนซ้อมปรับตามร่างกาย")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("วันนี้ทำแล้ว")).toHaveCount(0);
});

test("TodayWorkoutCard shows completed state with exceeded km when run > planned", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = await setupRacePlanWithTodayRun(page, "Bangkok Marathon", 10);

  // Add a run that exceeds the plan (12 km vs 10 planned)
  state.history.push(workoutItem("run-today-exceeded", today, 12));

  await gotoApp(page, "/race-goal");

  const completedCard = page.getByTestId("today-workout-completed-card");
  await expect(completedCard).toBeVisible({ timeout: 10000 });
  await expect(completedCard.getByText(/12\.0 กม\./)).toBeVisible();
  await expect(completedCard.getByText("เกินแผน!")).toBeVisible();
});

test("Race title with colons is cleaned in display", async ({ page }) => {
  await installMockBackend(page);
  await setupRacePlanWithTodayRun(page, "ASICS : META : Time : Trials Thailand 2026", 10);

  await gotoApp(page, "/race-goal");

  // Cleaned version should appear in the countdown card
  await expect(page.getByText("ASICS META Time Trials Thailand 2026").first()).toBeVisible({ timeout: 10000 });
  // Raw colon-heavy version should not appear
  await expect(page.getByText("ASICS : META : Time : Trials Thailand 2026")).toHaveCount(0);
});

// ─── Sick hard-stop on Race page ──────────────────────────────────────────────

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

test("Race: sick hard-stop shows วันนี้ไม่ใช้แผนซ้อม advisory", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = await setupRacePlanWithTodayRun(page, "Bangkok Marathon", 15);
  state.history.push(makeSickRecord(today, "sick-race-1", ["fever"], "moderate"));

  await gotoApp(page, "/race-goal");

  await expect(page.getByTestId("sick-hard-stop-race-advisory")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("วันนี้ไม่ใช้แผนซ้อม")).toBeVisible();
  await expect(page.getByRole("link", { name: "ดู/อัปเดตอาการ" })).toBeVisible();
});

test("Race: sick hard-stop pace bands show sick note", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = await setupRacePlanWithTodayRun(page, "Bangkok Marathon", 15);
  state.history.push(makeSickRecord(today, "sick-race-2", ["fever"], "moderate"));

  await gotoApp(page, "/race-goal");

  await expect(page.getByTestId("pace-bands-sick-note")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("วันนี้ยังไม่แนะนำให้ซ้อม")).toBeVisible();
});
