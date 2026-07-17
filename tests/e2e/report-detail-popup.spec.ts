/**
 * Report page detail popups — quick win to surface already-captured sleep-stage
 * and workout-metric/coach data that wasn't shown anywhere in the UI. Triggered
 * by a "ดูรายละเอียดเพิ่มเติม" link inside the existing SleepDetail/WorkoutDetail
 * cards, only rendered when there's actually extra data to show.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeDetailedSleep(dateKey: string, id: string) {
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
        sleepStartTime: `${dateKey}T15:00:00.000Z`,
        sleepEndTime: `${dateKey}T22:00:00.000Z`,
        timeInBedText: "7 h 30 m",
        sleepStageMinutes: { deep: 90, light: 200, rem: 100, awake: 30 },
        energyScore: 68,
        avgSleepingHeartRate: 52,
        avgSleepingHrv: 58,
        avgRespiratoryRate: 14,
        sleepQualityLabel: "ดี",
      },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

function makeDetailedWorkout(dateKey: string, id: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T16:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm: 5.1,
        duration: "00:35:00",
        avgPace: "6:52",
        avgHR: 155,
        calories: 299,
        avgSpeedKmh: 8.7,
        cadence: 168,
        elevationGain: 42,
        vo2Max: 48.5,
      },
      coach: {
        workoutSummary: "วิ่งได้ดีวันนี้",
        intensityAssessment: "ความหนักปานกลาง",
        trainingLoadNote: "โหลดสะสมยังปกติ",
        wasTooHard: false,
        recoveryAdvice: "พักผ่อนให้พอ ดื่มน้ำเยอะๆ",
        nutritionAfterWorkout: "เติมโปรตีนและคาร์บ",
        nextWorkoutSuggestion: "พรุ่งนี้ซ้อมเบาหรือพัก",
        coachNote: "ฟอร์มการวิ่งดูดี",
      },
      confidence: "high",
      unclearFields: [],
    },
  };
}

test("sleep detail popup shows sleep stages and extra recovery metrics", async ({ page }) => {
  const state = await installMockBackend(page);
  const dateKey = bangkokDateKey();
  state.history.push(makeDetailedSleep(dateKey, "sleep-detail-1"));

  await gotoApp(page, "/logs");
  await page.getByText("รายการทั้งหมด").click();

  const item = page.getByTestId("report-compact-item").filter({ hasText: "นอน" }).first();
  await item.getByRole("button", { name: "ดู" }).click();

  await item.getByTestId("sleep-detail-more-button").click();

  const modal = page.getByTestId("sleep-detail-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("หลับลึก");
  await expect(modal).toContainText("REM");
  await expect(modal).toContainText("Energy score");
  await expect(modal).toContainText("HR ขณะนอน");

  await modal.getByLabel("ปิด").click();
  await expect(modal).not.toBeVisible();
});

test("workout detail popup shows extra metrics and full coach guidance", async ({ page }) => {
  const state = await installMockBackend(page);
  const dateKey = bangkokDateKey();
  state.history.push(makeDetailedWorkout(dateKey, "workout-detail-1"));

  await gotoApp(page, "/logs");
  await page.getByText("รายการทั้งหมด").click();

  const item = page.getByTestId("report-compact-item").filter({ hasText: "ซ้อม" }).first();
  await item.getByRole("button", { name: "ดู" }).click();

  await item.getByTestId("workout-detail-more-button").click();

  const modal = page.getByTestId("workout-detail-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("VO2max");
  await expect(modal).toContainText("Cadence");
  await expect(modal).toContainText("ซ้อมครั้งถัดไป");
  await expect(modal).toContainText("พรุ่งนี้ซ้อมเบาหรือพัก");

  await modal.getByLabel("ปิด").click();
  await expect(modal).not.toBeVisible();
});

test("detail-more button is not shown when there's no extra data to surface", async ({ page }) => {
  const state = await installMockBackend(page);
  const dateKey = bangkokDateKey();
  state.history.push({
    id: "sleep-plain-1",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: { date: dateKey, actualSleepDurationMinutes: 420, sleepScore: 76 },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  });

  await gotoApp(page, "/logs");
  await page.getByText("รายการทั้งหมด").click();

  const item = page.getByTestId("report-compact-item").filter({ hasText: "นอน" }).first();
  await item.getByRole("button", { name: "ดู" }).click();

  await expect(item.getByTestId("sleep-detail-more-button")).toHaveCount(0);
});
