import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// ─── Phase 1: "ของเสียง" typo guard ──────────────────────────────────────────

test("Today page never contains ของเสียง", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");
  // Wait for content to settle
  await expect(page.locator("body")).not.toContainText("ของเสียง");
});

// ─── Phase 2: Context-aware Quick Log rest button ─────────────────────────────

test("Quick Log shows วันนี้พัก when no workout today", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");

  // No workout in history → rest button should say วันนี้พัก
  await expect(page.getByRole("button", { name: /วันนี้พัก/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /พักต่อวันนี้/ })).toHaveCount(0);
});

test("Quick Log shows พักต่อวันนี้ after a workout exists today", async ({ page }) => {
  const state = await installMockBackend(page);

  // Inject a workout for today into history
  const today = bangkokDateKey();
  state.history.push({
    id: "workout-today-001",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${today}T06:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm: 5,
        duration: "00:30:00",
        intensity: "easy",
        rpe: 5,
      },
      coach: {
        workoutSummary: "วิ่ง 5 km",
        intensityAssessment: "easy",
        trainingLoadNote: "Low",
        wasTooHard: false,
        recoveryAdvice: "พักให้เต็มที่",
        nutritionAfterWorkout: "เติมโปรตีน",
        nextWorkoutSuggestion: "วิ่งต่อพรุ่งนี้",
        coachNote: "ซ้อมดีมาก",
      },
    },
  });

  await gotoApp(page, "/");

  // With workout today → rest button says พักต่อวันนี้
  await expect(page.getByRole("button", { name: /พักต่อวันนี้/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /วันนี้พัก/ })).toHaveCount(0);
});

test("พักต่อวันนี้ saves quickLogKind recovery and does not overwrite the existing workout", async ({ page }) => {
  const state = await installMockBackend(page);

  const today = bangkokDateKey();
  state.history.push({
    id: "workout-today-002",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${today}T06:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm: 8,
        duration: "00:45:00",
        intensity: "easy",
        rpe: 5,
      },
    },
  });

  await gotoApp(page, "/");
  await expect(page.getByRole("button", { name: /พักต่อวันนี้/ })).toBeVisible();

  // Register dialog handler before clicking (dialog fires synchronously on click)
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: /พักต่อวันนี้/ }).click();

  // Wait for a new workout to be saved
  await expect.poll(() =>
    state.history.filter((r) => r.type === "workout").length
  ).toBe(2);

  // Original workout still present
  expect(state.history.find((r) => r.id === "workout-today-002")).toBeDefined();

  // New recovery entry has quickLogKind:"recovery"
  const recovery = state.history.find(
    (r) => r.type === "workout" && r.id !== "workout-today-002"
  );
  expect(recovery).toBeDefined();
  expect((recovery!.data as Record<string, unknown>).quickLogKind).toBe("recovery");
});
