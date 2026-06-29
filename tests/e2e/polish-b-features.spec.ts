import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend, saveManualBreakfast } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";
import { reportDayByDate } from "./helpers/selectors";

// ─── Phase B1: Historical quick-log records in Report ────────────────────────

test("protein quick log record appears in Report without guessed kcal/carbs/fat", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Pre-inject a quick-log protein meal record (simulates historical Quick Log data)
  state.history.push({
    id: "meal-protein-quicklog-001",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "meal",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      extracted: {
        mealType: "lunch",
        mealSlot: "lunch",
        date: today,
        foods: ["โปรตีน 25g (quick log)"],
        caloriesKcal: null,
        proteinG: 25,
        carbsG: null,
        fatG: null,
        fiberG: null,
        sodiumMg: null,
        confidence: "low",
        visibleItems: ["โปรตีน 25g"],
        portionNotes: "Quick log: โปรตีน 25g",
        rawText: null,
      },
      coach: {
        mealSummary: "กินโปรตีนแล้ว 25g",
        nutritionHighlights: "โปรตีน 25g",
        improvementTips: "",
        portionFeedback: "",
        coachNote: "บันทึกไว ๆ: โปรตีน 25g",
      },
      quickLog: true,
      quickLogKind: "protein",
      quickLogProteinG: 25,
    },
  });

  await gotoApp(page, "/logs");
  const day = reportDayByDate(page, today);
  const mealCard = day.getByTestId("report-meal-card");
  await expect(mealCard.getByText("กินโปรตีนแล้ว · 25g")).toBeVisible();
  await expect(mealCard.getByText("บันทึกไว ๆ")).toBeVisible();
  await expect(mealCard.getByText("450 kcal")).toHaveCount(0);
  await expect(day.getByText("25 /").first()).toBeVisible();
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

// ─── Phase B2b: Expand / collapse an older day ───────────────────────────────

test("older day can be expanded then collapsed with ดูรายละเอียด / ย่อ", async ({ page }) => {
  const state = await installMockBackend(page);

  // Inject a workout 3 days ago
  const oldDate = bangkokDateKey(-3);
  state.history.push({
    id: "old-run-002",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${oldDate}T06:00:00.000Z`,
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

  await gotoApp(page, "/logs");

  const oldDay = reportDayByDate(page, oldDate);
  await expect(oldDay).toBeVisible();

  // Collapsed: toggle shows "ดูรายละเอียด"
  const toggle = oldDay.getByTestId("report-day-toggle");
  await expect(toggle.getByText("ดูรายละเอียด")).toBeVisible();

  // Expand
  await toggle.click();
  await expect(toggle.getByText("ย่อ")).toBeVisible();
  // Expanded content area is present
  await expect(oldDay.locator(".border-t").first()).toBeVisible();

  // Collapse again
  await toggle.click();
  await expect(toggle.getByText("ดูรายละเอียด")).toBeVisible();
  await expect(oldDay.locator(".border-t")).toHaveCount(0);
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
  await expect(page.getByText("แนวโน้ม Recovery 7 วัน")).toBeVisible();

  // "โฟกัสถัดไป" heading inside the highlighted blue-grey box
  await expect(page.getByText("โฟกัสถัดไป").first()).toBeVisible();

  // The section contains focus item text (mealCount < 7 triggers this message)
  await expect(
    page.getByText(/บันทึกอาหารให้สม่ำเสมอ|เพิ่ม strength|นอนให้ได้|รักษาความสม่ำเสมอต่ออีกสัปดาห์/).first()
  ).toBeVisible();

  // Numbered badge: a span with text "1" inside the focus section
  await expect(page.locator("span.rounded-full").filter({ hasText: "1" }).first()).toBeVisible();
});
