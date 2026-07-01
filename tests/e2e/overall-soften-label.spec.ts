import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

test.describe("Readiness Label Softening with Caution Axes", () => {
  test("1. Mixed caution axes: overall score 80 becomes Good · คุมเบา instead of Excellent", async ({ page }) => {
    const state = await installMockBackend(page);
    const today = bangkokDateKey();
    const d1 = bangkokDateKey(-1);
    const d2 = bangkokDateKey(-2);
    const d3 = bangkokDateKey(-3);

    // Mock coach-insight to return raw readiness 80 and Excellent label
    await page.route("**/api/coach-insight", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 80,
            readinessLabel: "Excellent",
            readinessNote: "คะแนนรวมฟื้นตัวดีมาก",
            workoutRec: "Easy Run 5km",
            workoutTarget: "วิ่งเหยาะสบาย 30 นาที",
            weekSummary: "วิ่งสะสม 45 km",
            keyObservation: "โหลดสะสมสูงและการนอนยังพอใช้",
            coachMessage: "วันนี้สะสมโหลดซ้อมสูงและการนอนยังไม่เต็มอิ่ม ควรคุมความเข้มข้นครับ",
          },
        }),
      });
    });

    // 1. Pushing preceding sleeps to keep average duration high, but today sleep low (5 hours)
    state.history.push({
      id: "sleep-d3",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${d3}T10:00:00.000Z`,
      data: {
        extracted: { date: d3, actualSleepDurationMinutes: 480, sleepScore: 80 },
        coach: { readinessScore: 80, readinessLabel: "Excellent" },
      },
    });
    state.history.push({
      id: "sleep-d2",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${d2}T10:00:00.000Z`,
      data: {
        extracted: { date: d2, actualSleepDurationMinutes: 480, sleepScore: 80 },
        coach: { readinessScore: 80, readinessLabel: "Excellent" },
      },
    });
    // Yesterday sleep score is 76 (baseline for today's recovery axis)
    state.history.push({
      id: "sleep-yesterday",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${d1}T10:00:00.000Z`,
      data: {
        extracted: { date: d1, actualSleepDurationMinutes: 480, sleepScore: 76 },
        coach: { readinessScore: 76, readinessLabel: "Good" },
      },
    });
    // Today sleep duration is 300 minutes (5 hours) -> Sleep score should be Fair (around 55)
    state.history.push({
      id: "sleep-today",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: { date: today, actualSleepDurationMinutes: 300, sleepScore: 55 },
        coach: { readinessScore: 80, readinessLabel: "Excellent" }, // Mocked raw overall score 80
      },
    });

    // 2. Workouts to produce Load Axis = 70
    // Total runs = 4. Distance = 20 + 10 + 10 + 5 = 45km. Long run = 20km. Today completed = 5km.
    state.history.push({
      id: "workout-d3",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${d3}T16:00:00.000Z`,
      data: {
        date: d3,
        extracted: {
          workoutKind: "outdoor_run",
          distanceKm: 10,
          duration: "01:00:00",
          avgHR: 140,
          calories: 600,
        },
      },
    });
    state.history.push({
      id: "workout-d2",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${d2}T16:00:00.000Z`,
      data: {
        date: d2,
        extracted: {
          workoutKind: "outdoor_run",
          distanceKm: 20,
          duration: "02:00:00",
          avgHR: 145,
          calories: 1200,
        },
      },
    });
    state.history.push({
      id: "workout-d1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${d1}T16:00:00.000Z`,
      data: {
        date: d1,
        extracted: {
          workoutKind: "outdoor_run",
          distanceKm: 10,
          duration: "01:00:00",
          avgHR: 140,
          calories: 600,
        },
      },
    });
    state.history.push({
      id: "workout-today",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${today}T16:00:00.000Z`,
      data: {
        date: today,
        extracted: {
          workoutKind: "outdoor_run",
          distanceKm: 5,
          duration: "00:30:00",
          avgHR: 135,
          calories: 350,
        },
      },
    });

    // 3. Meals today: 1 meal -> Fuel score = 50
    state.history.push({
      id: "meal-today",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "meal",
      created_at: `${today}T08:00:00.000Z`,
      data: {
        date: today,
        extracted: {
          mealType: "breakfast",
          mealSlot: "breakfast",
          caloriesKcal: 500,
          proteinG: 20,
          carbsG: 50,
          fatG: 15,
          foods: ["ข้าวมันไก่"],
        },
      },
    });

    await gotoApp(page, "/");

    // Top chip overall score should show 80
    // But label must NOT say "Excellent". Instead, it must say "Good · คุมเบา"
    await expect(page.getByText("80 Readiness Good · คุมเบา")).toBeVisible();

    // Check that the background color class is Blue (bg-[#e7f0fa]) instead of Green
    const chip = page.locator("span:has-text('Readiness')").first();
    await expect(chip).toHaveClass(/bg-\[#e7f0fa\]/);

    // Moderate caution: heavy card NOT shown, soft note shown instead
    await expect(page.getByText("ข้อแนะนำความพร้อม")).toHaveCount(0);
    await expect(page.getByText(/วันนี้สะสมโหลดซ้อมสูงและการนอนยังไม่เต็มอิ่ม/).first()).toBeVisible();

    // Now navigate to Coach page and verify consistency
    await page.getByRole("link", { name: "Coach" }).click();
    await page.waitForURL("**/coach");

    // CoachContextDashboard score badge (rounded-2xl) should show the recovery score and "Fair" label
    const dashboard = page.locator('[data-testid="coach-context-dashboard"]');
    await expect(dashboard).toBeVisible();
    await expect(dashboard.locator(".rounded-2xl").getByText("55")).toBeVisible();
    await expect(dashboard.locator(".rounded-2xl").getByText("Fair")).toBeVisible();

    // Coaching stance for "maintain" state
    await expect(page.getByText("วันนี้ยังไปตามแผนได้")).toBeVisible();
  });

  test("2. Truly excellent day can show Excellent", async ({ page }) => {
    const state = await installMockBackend(page);
    const today = bangkokDateKey();

    // Mock coach-insight to return raw readiness 85 and Excellent label
    await page.route("**/api/coach-insight", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 85,
            readinessLabel: "Excellent",
            readinessNote: "ฟื้นตัวดีเยี่ยม",
            workoutRec: "Tempo Run 8km",
            workoutTarget: "วิ่งเทมโปคุมโซนความหนัก",
            weekSummary: "วิ่งสะสม 10 km",
            keyObservation: "ร่างกายฟื้นตัวเต็มที่",
            coachMessage: "สภาพร่างกายพร้อมเต็มร้อยลุยซ้อมหนักตามแผนได้เลยครับ",
          },
        }),
      });
    });

    // Pushing healthy sleeps and meals
    state.history.push({
      id: "sleep-yesterday",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${bangkokDateKey(-1)}T10:00:00.000Z`,
      data: {
        extracted: { date: bangkokDateKey(-1), actualSleepDurationMinutes: 480, sleepScore: 85 },
        coach: { readinessScore: 85, readinessLabel: "Excellent" },
      },
    });
    state.history.push({
      id: "sleep-today",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: { date: today, actualSleepDurationMinutes: 480, sleepScore: 85 },
        coach: { readinessScore: 85, readinessLabel: "Excellent" },
      },
    });

    // 2 meals, good carbs/protein
    state.history.push({
      id: "meal-today-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "meal",
      created_at: `${today}T08:00:00.000Z`,
      data: {
        date: today,
        extracted: {
          mealType: "breakfast",
          mealSlot: "breakfast",
          caloriesKcal: 1000,
          proteinG: 60,
          carbsG: 120,
          fatG: 30,
          foods: ["อาหารหลัก"],
        },
      },
    });

    await gotoApp(page, "/");

    // Top chip overall score should show 85 Excellent
    await expect(page.getByText("85 Readiness Excellent")).toBeVisible();

    // Check that background is Green (bg-[#eef7f0])
    const chip = page.locator("span:has-text('Readiness')").first();
    await expect(chip).toHaveClass(/bg-\[#eef7f0\]/);

    // No Caution Note banner
    await expect(page.getByText("ข้อแนะนำความพร้อม")).toHaveCount(0);
  });
});
