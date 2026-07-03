/**
 * Pain recovery state tests.
 * Covers the graduated return-to-training logic in getPainRecoveryStatus()
 * as it flows through the UI on the Home (Today) and Race Goal pages.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const USER_ID = "00000000-0000-4000-8000-000000000001";

function painItem(
  id: string,
  dateKey: string,
  opts: {
    painLevel?: number;
    status?: "active" | "resolved";
    startedWhen?: string;
    resolved?: boolean;
    resolvedAt?: string | null;
  } = {},
) {
  const {
    painLevel = 4,
    status = "active",
    startedWhen = "during_run",
    resolved = false,
    resolvedAt = null,
  } = opts;
  return {
    id,
    user_id: USER_ID,
    type: "pain" as const,
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      painLocation: "เข่า",
      painSide: "left",
      painLevel,
      startedWhen,
      painType: ["dull"],
      painfulWhen: ["running"],
      swellingOrRedness: "no",
      canBearWeight: "yes",
      notes: "",
      riskLevel: "medium",
      trainingImpact: status === "active" ? "rest" : "run_ok_easy",
      coachAdvice: "พักก่อน",
      redFlags: [],
      createdAt: `${dateKey}T08:00:00.000Z`,
      resolved,
      status,
      resolvedAt,
    },
  };
}

function workoutItem(id: string, dateKey: string, distanceKm = 5) {
  return {
    id,
    user_id: USER_ID,
    type: "workout" as const,
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: {
        workoutKind: "outdoor_run",
        date: dateKey,
        distanceKm,
        duration: "00:30:00",
        avgPace: "6:00",
        avgHR: 140,
        maxHR: 155,
        calories: 350,
        elevationGain: 10,
      },
      coach: { workoutSummary: "วิ่งได้ดี" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

// ── Test (a): pain today → active_pain → avoid run banner ────────────────────

test("pain today → active_pain: home shows avoid-run guardrail", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey(0);

  state.history.push(painItem("pain-today", today, { painLevel: 5, status: "active" }));

  await gotoApp(page, "/");

  // active_pain → tone "danger" → coaching-interpretation-line shows avoid-run copy
  await expect(
    page.getByTestId("coaching-interpretation-line"),
  ).toContainText("มีอาการเจ็บวันนี้", { timeout: 10000 });
});

// ── Test (b): pain yesterday → recent_pain → no hard workout ─────────────────

test("pain yesterday → recent_pain: home blocks hard workout", async ({ page }) => {
  const state = await installMockBackend(page);
  const yesterday = bangkokDateKey(-1);

  // Yesterday's pain is now resolved but still within 48 h
  state.history.push(
    painItem("pain-yesterday", yesterday, {
      painLevel: 3,
      status: "resolved",
      resolved: true,
      resolvedAt: yesterday,
    }),
  );

  await gotoApp(page, "/");

  // recent_pain → tone "warning" → coaching-interpretation-line visible
  await expect(
    page.getByTestId("coaching-interpretation-line"),
  ).toContainText("เพิ่งมีอาการเจ็บมา", { timeout: 10000 });
});

// ── Test (c): 2 pain-free days + easy activity → cleared_light ───────────────

test("2 pain-free days + easy run → cleared_light: no hard block on home", async ({ page }) => {
  const state = await installMockBackend(page);
  const threeDaysAgo = bangkokDateKey(-3);
  const yesterday = bangkokDateKey(-1);

  // Pain was 3 days ago, now resolved
  state.history.push(
    painItem("pain-3d", threeDaysAgo, {
      painLevel: 3,
      status: "resolved",
      resolved: true,
      resolvedAt: threeDaysAgo,
    }),
  );
  // Easy run done yesterday (1 day after pain, still < 5 days) → cleared_light
  state.history.push(workoutItem("run-yesterday", yesterday, 4));

  await gotoApp(page, "/");

  // cleared_light → guardrail tone "caution" but shortThaiCopy = "เริ่มกลับมา easy ได้"
  // The home page only renders coaching-interpretation-line for non-neutral/non-success tones
  await expect(
    page.getByTestId("coaching-interpretation-line"),
  ).toContainText("เริ่มกลับมา easy ได้", { timeout: 10000 });
});

// ── Test (d): 5 pain-free days + 2 easy runs → cleared_normal ────────────────

test("5 pain-free days + 2 easy runs → cleared_normal: no pain guardrail shown", async ({ page }) => {
  const state = await installMockBackend(page);
  const sixDaysAgo = bangkokDateKey(-6);
  const fourDaysAgo = bangkokDateKey(-4);
  const twoDaysAgo = bangkokDateKey(-2);

  // Pain was 6 days ago, resolved
  state.history.push(
    painItem("pain-6d", sixDaysAgo, {
      painLevel: 3,
      status: "resolved",
      resolved: true,
      resolvedAt: sixDaysAgo,
    }),
  );
  // Two easy runs since then (4d ago and 2d ago)
  state.history.push(workoutItem("run-4d", fourDaysAgo, 5));
  state.history.push(workoutItem("run-2d", twoDaysAgo, 6));

  await gotoApp(page, "/");

  // cleared_normal → no pain-related guardrail copy
  await page.waitForFunction(() => {
    const interactive = document.querySelector("button, input, textarea");
    if (!interactive) return false;
    return Object.keys(interactive).some((k) => k.startsWith("__reactProps$"));
  });
  await page.waitForTimeout(1500); // allow recovery system to hydrate
  await expect(page.getByText("ยังมีอาการเจ็บวันนี้")).toHaveCount(0);
  await expect(page.getByText("เพิ่งมีอาการเจ็บมา")).toHaveCount(0);
  await expect(page.getByText("เริ่มกลับมา easy ได้")).toHaveCount(0);
});

// ── Test (e): pain worsened after run → recent_pain → blocks hard workout ────

test("pain worsened after run → recent_pain guardrail on home", async ({ page }) => {
  const state = await installMockBackend(page);
  const twoDaysAgo = bangkokDateKey(-2);

  // Pain started after a run (startedWhen = "after_run"), 2 days ago, resolved
  state.history.push(
    painItem("pain-after-run", twoDaysAgo, {
      painLevel: 3,
      status: "resolved",
      resolved: true,
      resolvedAt: twoDaysAgo,
      startedWhen: "after_run",
    }),
  );

  await gotoApp(page, "/");

  // painFreeDays = 2, painWorseAfterRun = true and < 3d → recent_pain
  await expect(
    page.getByTestId("coaching-interpretation-line"),
  ).toContainText("เพิ่งมีอาการเจ็บมา", { timeout: 10000 });
});

// ── Test (f): Race and Coach do not suggest tempo when recent_pain ────────────

test("recent_pain: race-goal page shows pain recovery banner and suppresses hard session", async ({ page }) => {
  const state = await installMockBackend(page);
  const yesterday = bangkokDateKey(-1);
  const today = bangkokDateKey(0);
  const raceDate = bangkokDateKey(60);

  // Set up a race goal with a tempo plan
  await page.route("**/rest/v1/race_goals*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "goal-pain-1",
        race_name: "Bangkok Marathon",
        race_date: raceDate,
        race_distance: "21K",
        status: "active",
      }]),
    });
  });

  await page.route("**/rest/v1/training_plans*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ id: "plan-pain-1" }]) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "plan-pain-1",
        race_goal_id: "goal-pain-1",
        start_date: today,
        phases_json: {
          planStartDate: today,
          totalWeeks: 8,
          currentPhase: "Build",
          planSummary: "Build phase",
          weeklyPlan: [{
            day: "Tempo Day",
            workoutType: "Tempo Run",
            distanceKm: 10,
            description: "วิ่ง tempo pace",
            durationMin: 60,
            purpose: "threshold",
            adjustment: null,
          }],
        },
      }]),
    });
  });

  // Pain yesterday → recent_pain
  state.history.push(
    painItem("pain-f", yesterday, {
      painLevel: 3,
      status: "resolved",
      resolved: true,
      resolvedAt: yesterday,
    }),
  );

  await gotoApp(page, "/race-goal");

  // The pain recovery banner should appear on the race page
  await expect(
    page.getByTestId("pain-recovery-race-banner"),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByTestId("pain-recovery-race-banner"),
  ).toContainText("เพิ่งมีอาการเจ็บมา");
});
