/**
 * HR Zone / Easy HR Cap Engine — e2e coverage:
 * 1. Settings shows the HR Zone section with method select + AT/AnT inputs, and saving persists them.
 * 2. Today's pace card shows an HR cap line when profile HR data + a race goal target time exist.
 * 3. Race page's pace bands card shows an HR cap line on Easy/Long rows.
 */

import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function mockProfileRoute(page: import("@playwright/test").Page, extraRow: Record<string, unknown> = {}) {
  let capturedBody: Record<string, unknown> | null = null;
  return {
    install: async () => {
      await page.route("**/e2e-supabase/rest/v1/profiles**", async (route) => {
        const method = route.request().method();
        if (method === "OPTIONS") {
          await route.fulfill({ status: 204, headers: CORS_HEADERS });
          return;
        }
        if (method === "GET") {
          await route.fulfill({
            status: 200,
            contentType: "application/vnd.pgrst.object+json",
            headers: CORS_HEADERS,
            body: JSON.stringify({ id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null, ...extraRow }),
          });
          return;
        }
        if (method === "POST" || method === "PATCH") {
          try {
            capturedBody = route.request().postDataJSON() as Record<string, unknown>;
          } catch { /* ignore */ }
          await route.fulfill({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: JSON.stringify({ id: "test-profile" }) });
          return;
        }
        await route.fulfill({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: "[]" });
      });
    },
    getBody: () => capturedBody,
  };
}

async function mockRaceGoalRoute(page: import("@playwright/test").Page) {
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
        id: "goal-hr-1",
        race_name: "Test Race",
        race_date: raceDate,
        race_distance: "10K",
        goal_type: "time",
        target_time: "50:00",
        current_longest_run_km: null,
        training_days_per_week: null,
        preferred_long_run_day: null,
        injury_notes: null,
        plan_preference: null,
        status: "active",
      }]),
    });
  });
}

test("Settings: HR Zone section renders and persists AT/AnT on save", async ({ page }) => {
  const profileMock = mockProfileRoute(page);
  await installMockBackend(page);
  await profileMock.install();

  await gotoApp(page, "/settings");
  await page.getByText("สมรรถภาพนักวิ่ง", { exact: true }).click();
  await page.getByRole("button", { name: "แก้ไข" }).first().click();

  await expect(page.getByLabel("วิธีคำนวณโซนหัวใจ")).toBeVisible();
  await page.getByLabel("วิธีคำนวณโซนหัวใจ").selectOption("at_ant");

  const atInput = page.getByPlaceholder("เช่น 146");
  const antInput = page.getByPlaceholder("เช่น 172");
  await atInput.fill("146");
  await antInput.fill("172");

  await page.getByRole("button", { name: "บันทึก", exact: true }).click();
  await page.getByRole("button", { name: "บันทึกโปรไฟล์" }).click();
  await page.waitForTimeout(500);

  const body = profileMock.getBody();
  expect(body).not.toBeNull();
  expect(body!.hr_zone_method).toBe("at_ant");
  expect(body!.aerobic_threshold_hr).toBe(146);
  expect(body!.anaerobic_threshold_hr).toBe(172);
});

test("Today: pace card shows HR cap line when profile HR data + race goal exist", async ({ page }) => {
  const profileMock = mockProfileRoute(page, {
    aerobic_threshold_hr: 146,
    anaerobic_threshold_hr: 172,
    hr_zone_method: "at_ant",
  });
  const state = await installMockBackend(page);
  await profileMock.install();
  await mockRaceGoalRoute(page);

  state.history.push({
    id: "sleep-hr-today",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${bangkokDateKey()}T10:00:00.000Z`,
    data: {
      extracted: { date: bangkokDateKey(), actualSleepDurationMinutes: 450, sleepScore: 82, restingHR: 48, hrv: 60 },
      coach: { readinessScore: 78, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  });

  await gotoApp(page, "/");

  const paceCard = page.getByTestId("today-pace-card");
  await expect(paceCard).toBeVisible();
  await expect(page.getByTestId("today-hr-cap-line")).toBeVisible();
  await expect(page.getByTestId("today-hr-cap-line")).toContainText("HR");
});

test("Race page: pace bands card shows HR cap line on Easy/Long rows", async ({ page }) => {
  const profileMock = mockProfileRoute(page, {
    aerobic_threshold_hr: 146,
    anaerobic_threshold_hr: 172,
    hr_zone_method: "at_ant",
  });
  await installMockBackend(page);
  await profileMock.install();
  await mockRaceGoalRoute(page);

  const mockPlan = {
    planStartDate: bangkokDateKey(),
    totalWeeks: 8,
    currentPhase: "Base",
    planSummary: "Test plan",
    weeklyPlan: [
      { day: "Long Run Day", workoutType: "Long Run", distanceKm: 10, description: "วิ่งยาว", durationMin: 60, purpose: "Endurance", adjustment: null },
    ],
  };
  await page.route("**/rest/v1/training_plans*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "plan-hr-1" }]) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{
        id: "plan-hr-1",
        race_goal_id: "goal-hr-1",
        start_date: bangkokDateKey(-7),
        phases_json: mockPlan,
      }]),
    });
  });

  await gotoApp(page, "/race-goal");

  const paceCard = page.getByTestId("pace-bands-card");
  await expect(paceCard).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("race-hr-cap-line").first()).toBeVisible();
});
