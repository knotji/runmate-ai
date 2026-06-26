import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend, saveManualBreakfast } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";
import { reportDayByDate } from "./helpers/selectors";

// ─── Phase B1: Protein quick-log modal ────────────────────────────────────────

test("protein quick-log shows amount modal instead of window.confirm", async ({ page }) => {
  const state = await installMockBackend(page);
  await gotoApp(page, "/");

  // Click the protein quick-log button
  await page.getByRole("button", { name: /กินโปรตีนแล้ว/ }).click();

  // Modal must appear with the correct title
  await expect(page.getByRole("heading", { name: "กินโปรตีนประมาณเท่าไหร่?" })).toBeVisible();
  // Hint text visible
  await expect(page.getByText(/ถ้าไม่แน่ใจ เลือกคร่าว ๆ ได้/)).toBeVisible();
  // Preset buttons visible
  for (const g of ["15g", "25g", "30g"]) {
    await expect(page.getByRole("button", { name: g, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "กรอกเอง" })).toBeVisible();

  // Select 25 g and confirm
  await page.getByRole("button", { name: "25g", exact: true }).click();
  await page.getByRole("button", { name: /บันทึกโปรตีน 25g/ }).click();

  // Modal dismissed
  await expect(page.getByRole("heading", { name: "กินโปรตีนประมาณเท่าไหร่?" })).toHaveCount(0);

  // Exactly one meal record saved, with proteinG=25 and null kcal
  await expect.poll(() => state.history.filter((r) => r.type === "meal").length).toBe(1);
  const saved = state.history.find((r) => r.type === "meal")!;
  const extracted = (saved.data as Record<string, unknown>).extracted as Record<string, unknown>;
  expect(extracted.proteinG).toBe(25);
  expect(extracted.caloriesKcal).toBeNull();
  expect(extracted.carbsG).toBeNull();
  expect(extracted.fatG).toBeNull();
});

test("protein quick log appears in Report without guessed kcal/carbs/fat", async ({ page }) => {
  const state = await installMockBackend(page);
  await gotoApp(page, "/");

  await page.getByRole("button", { name: /กินโปรตีนแล้ว/ }).click();
  await page.getByRole("button", { name: "25g", exact: true }).click();
  await page.getByRole("button", { name: /บันทึกโปรตีน 25g/ }).click();
  await expect.poll(() => state.history.filter((r) => r.type === "meal").length).toBe(1);

  await gotoApp(page, "/logs");
  const today = reportDayByDate(page, bangkokDateKey());
  const mealCard = today.getByTestId("report-meal-card");
  await expect(mealCard.getByText("กินโปรตีนแล้ว · 25g")).toBeVisible();
  await expect(mealCard.getByText("บันทึกไว ๆ")).toBeVisible();
  await expect(mealCard.getByText("450 kcal")).toHaveCount(0);
  await expect(today.getByText("25 /").first()).toBeVisible();
});

test("protein modal cancel discards without saving", async ({ page }) => {
  const state = await installMockBackend(page);
  await gotoApp(page, "/");

  await page.getByRole("button", { name: /กินโปรตีนแล้ว/ }).click();
  await expect(page.getByRole("heading", { name: "กินโปรตีนประมาณเท่าไหร่?" })).toBeVisible();
  await page.getByRole("button", { name: "ยกเลิก" }).click();

  await expect(page.getByRole("heading", { name: "กินโปรตีนประมาณเท่าไหร่?" })).toHaveCount(0);
  expect(state.history.filter((r) => r.type === "meal").length).toBe(0);
});

// ─── Phase B2: Report day collapse ────────────────────────────────────────────

test("today starts expanded and 3-day-old card starts collapsed", async ({ page }) => {
  const state = await installMockBackend(page);

  // Inject a workout 3 days ago (falls within recentDays slice but not today/yesterday)
  const oldDate = bangkokDateKey(-3);
  state.history.push({
    id: "old-workout-001",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${oldDate}T06:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm: 5,
        duration: "00:30:00",
        intensity: "easy",
        rpe: 5,
      },
    },
  });

  // Save a breakfast for today so today card has content
  await saveManualBreakfast(page, state);

  await gotoApp(page, "/logs");

  // Today card — expanded by default: meal card visible without clicking toggle
  const today = reportDayByDate(page, bangkokDateKey());
  await expect(today).toBeVisible();
  await expect(today.getByTestId("report-meal-card")).toBeVisible();

  // Old day card (3 days ago) — collapsed by default: no meal/workout cards visible
  const oldDay = reportDayByDate(page, oldDate);
  await expect(oldDay).toBeVisible();
  await expect(oldDay.getByText("ดูรายละเอียด")).toBeVisible();
  await expect(oldDay.getByTestId("report-workout-card").or(oldDay.getByTestId("report-meal-card"))).toHaveCount(0);

  // After toggle, content becomes visible
  await oldDay.getByTestId("report-day-toggle").click();
  // Content area appears (border-t div becomes visible)
  await expect(oldDay.locator(".border-t").first()).toBeVisible();
});

test("yesterday starts expanded by default", async ({ page }) => {
  const state = await installMockBackend(page);

  // Save a breakfast today, then also inject yesterday's workout
  const yesterdayKey = bangkokDateKey(-1);
  state.history.push({
    id: "yesterday-workout-001",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${yesterdayKey}T06:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm: 5,
        duration: "00:30:00",
        intensity: "easy",
        rpe: 5,
      },
    },
  });

  await gotoApp(page, "/logs");

  // Yesterday card — expanded by default, so border-t content div is in DOM
  const yesterday = reportDayByDate(page, yesterdayKey);
  await expect(yesterday).toBeVisible();
  // The expanded content area has class "border-t" and is only rendered when expanded
  await expect(yesterday.locator(".border-t").first()).toBeVisible();
});

// ─── Phase B3: Weekly Review focus visibility ──────────────────────────────────

test("Weekly Review shows โฟกัสถัดไป section when history is present", async ({ page }) => {
  const state = await installMockBackend(page);

  // Inject a run so weeklyReview has runCount > 0 (triggers strength recommendation)
  const today = bangkokDateKey();
  state.history.push({
    id: "run-today",
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
    },
  });

  await gotoApp(page, "/logs");

  // WeeklyReviewCard section label
  await expect(page.getByText("สรุปสัปดาห์นี้")).toBeVisible();

  // "โฟกัสถัดไป" heading inside the highlighted blue-grey box
  await expect(page.getByText("โฟกัสถัดไป").first()).toBeVisible();

  // The section contains focus item text (mealCount < 7 triggers this message)
  await expect(
    page.getByText(/บันทึกอาหารให้สม่ำเสมอ|เพิ่ม strength|นอนให้ได้|รักษาความสม่ำเสมอต่ออีกสัปดาห์/).first()
  ).toBeVisible();

  // Numbered badge: a span with text "1" inside the focus section
  await expect(page.locator("span.rounded-full").filter({ hasText: "1" }).first()).toBeVisible();
});
