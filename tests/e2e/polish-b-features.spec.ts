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
  await page.getByText("รายการทั้งหมด").click();
  const compactItem = page.locator(`[data-testid="report-compact-item"][data-date-key="${today}"]`).first();
  await expect(compactItem).toBeVisible();
  await compactItem.getByRole("button", { name: "ดู" }).click();
  const mealCard = compactItem.getByTestId("report-meal-card");
  await expect(mealCard.getByText("กินโปรตีนแล้ว · 25g")).toBeVisible();
  await expect(mealCard.getByText("บันทึกไว ๆ")).toBeVisible();
  await expect(mealCard.getByText("450 kcal")).toHaveCount(0);
});

// ─── Phase B2: Report day collapse ────────────────────────────────────────────

test("all items start collapsed by default and can be expanded", async ({ page }) => {
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
  await page.getByText("รายการทั้งหมด").click();

  // Today item
  const todayItem = page.locator(`[data-testid="report-compact-item"][data-date-key="${bangkokDateKey()}"]`).first();
  await expect(todayItem).toBeVisible();
  await expect(todayItem.getByTestId("report-meal-card")).not.toBeVisible();

  // Old item (3 days ago)
  const oldItem = page.locator(`[data-testid="report-compact-item"][data-date-key="${oldDate}"]`).first();
  await expect(oldItem).toBeVisible();
  await expect(oldItem.getByTestId("report-workout-card")).not.toBeVisible();

  // Expand old item
  await oldItem.getByRole("button", { name: "ดู" }).click();
  await expect(oldItem.getByTestId("report-workout-card")).toBeVisible();
});

test("yesterday starts collapsed by default and can be expanded", async ({ page }) => {
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
  await page.getByText("รายการทั้งหมด").click();

  // Yesterday card — collapsed by default
  const yesterdayItem = page.locator(`[data-testid="report-compact-item"][data-date-key="${yesterdayKey}"]`).first();
  await expect(yesterdayItem).toBeVisible();
  await expect(yesterdayItem.getByTestId("report-workout-card")).not.toBeVisible();

  // Expand
  await yesterdayItem.getByRole("button", { name: "ดู" }).click();
  await expect(yesterdayItem.getByTestId("report-workout-card")).toBeVisible();
});

// ─── Phase B2b: Expand / collapse an older day ───────────────────────────────

test("older day can be expanded then collapsed with ดู / ย่อ", async ({ page }) => {
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
  await page.getByText("รายการทั้งหมด").click();

  const oldItem = page.locator(`[data-testid="report-compact-item"][data-date-key="${oldDate}"]`).first();
  await expect(oldItem).toBeVisible();

  // Collapsed: toggle shows "ดู"
  const toggle = oldItem.getByRole("button", { name: "ดู" });
  await expect(toggle).toBeVisible();

  // Expand
  await toggle.click();
  // Now button says "ย่อ"
  const collapseToggle = oldItem.getByRole("button", { name: "ย่อ" });
  await expect(collapseToggle).toBeVisible();
  await expect(oldItem.getByTestId("report-workout-card")).toBeVisible();

  // Collapse again
  await collapseToggle.click();
  await expect(toggle).toBeVisible();
  await expect(oldItem.getByTestId("report-workout-card")).not.toBeVisible();
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
  await page.getByText("Insight 7 วันล่าสุด").click();

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
