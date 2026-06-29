import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

test.describe("Coach Intelligence UX & Guardrails Polish", () => {
  test("1. Today page shows conditional Easy Run guidelines when caution factors exist", async ({ page }) => {
    const today = bangkokDateKey();
    const state = await installMockBackend(page);

    // Mock low sleep (sleep average 5.5 hours) + high load (49 km)
    state.history.push({
      id: "sleep-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          sleepDuration: "5h 30m",
          actualSleepDurationMinutes: 330,
          sleepScore: 70,
        },
        coach: {
          readinessScore: 70,
          readinessLabel: "Good",
        }
      }
    });

    const yesterday = bangkokDateKey(-1);
    state.history.push({
      id: "workout-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${yesterday}T08:00:00.000Z`,
      data: {
        extracted: {
          date: yesterday,
          workoutKind: "outdoor_run",
          distanceKm: 49,
          duration: "4h 0m",
        }
      }
    });

    await page.route("**/api/coach-insight", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 70,
            readinessLabel: "Good",
            readinessNote: "นอน 5.5h",
            workoutRec: "Easy Run 6 km",
            workoutTarget: "HR 130-145, paceสบาย",
            weekSummary: "วิ่ง 49km / 5 sessions",
            keyObservation: "โหลดสะสมสูง",
            coachMessage: "วิ่งเบา ๆ เพื่อรักษารอบขา วันนี้ไม่ใช่เวลากด pace หรือเร่งความเร็ว เน้นวิ่งแบบ easy หรือ recovery เท่านั้นครับ"
          }
        })
      });
    });

    await gotoApp(page, "/");
    await expect(page.getByText("คำแนะนำการซ้อมวันนี้")).toBeVisible();
    await expect(page.getByText("Sleep เฉลี่ยสะสมต่ำเกณฑ์ หากชีพจรลอยขณะวิ่งให้ตัดระยะลง 10-20% ทันที")).toBeVisible();
    await expect(page.getByText("พลังงานสะสมอาหารวันนี้ยังน้อย แนะนำทานคาร์บย่อยง่าย")).toBeVisible();
  });

  test("2. Coach page readiness card shows 'not a pace day' override when Good score has caution factors", async ({ page }) => {
    const today = bangkokDateKey();
    const state = await installMockBackend(page);

    // Mock Good score (70)
    state.history.push({
      id: "sleep-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          sleepDuration: "5h 30m",
          actualSleepDurationMinutes: 330,
          sleepScore: 70,
        },
        coach: {
          readinessScore: 70,
          readinessLabel: "Good",
        }
      }
    });

    await gotoApp(page, "/coach");
    await page.getByRole("button", { name: "ดูรายละเอียด" }).click();

    await expect(page.getByText("วิ่งประคองตัวคุมความเข้มข้น ห้ามกด Pace")).toBeVisible();
  });

  test("3. Race page renders adaptive note for Long Run when caution factors exist", async ({ page }) => {
    const today = bangkokDateKey();
    const state = await installMockBackend(page);

    // Mock sleep caution factor
    state.history.push({
      id: "sleep-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          sleepDuration: "5h 30m",
          actualSleepDurationMinutes: 330,
          sleepScore: 70,
        },
        coach: {
          readinessScore: 70,
          readinessLabel: "Good",
        }
      }
    });

    // Mock a 12 km Long Run on Tuesday
    const mockPlan = {
      planStartDate: today,
      weeklyPlan: [
        {
          day: "อังคาร",
          workoutType: "Long Run",
          distanceKm: 12,
          description: "วิ่งยาวคุมโซนแอโรบิก",
          durationMin: 90,
          purpose: "Aerobic Base",
          adjustment: null
        }
      ]
    };

    await page.route("**/rest/v1/race_goals*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "goal-1",
          race_name: "Bangkok Marathon",
          race_date: today,
          race_distance: "10K",
          status: "active"
        }])
      });
    });

    await page.route("**/rest/v1/training_plans*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "plan-1",
          race_goal_id: "goal-1",
          start_date: today,
          phases_json: mockPlan
        }])
      });
    });

    await gotoApp(page, "/race-goal");
    await expect(page.getByText("Long Run").first()).toBeVisible();
    await expect(page.getByText(/ปรับตามสภาพ: ถ้าฟื้นตัวไม่ดี ลดเหลือ 10–11 km/).first()).toBeVisible();
  });

  test("4. Workout fueling linking displays pre-run carbs and post-run recovery guidance", async ({ page }) => {
    const today = bangkokDateKey();
    const state = await installMockBackend(page);

    // Seed sleep to activate Today page
    state.history.push({
      id: "sleep-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          sleepScore: 80,
        },
        coach: {
          readinessScore: 80,
          readinessLabel: "Excellent",
        }
      }
    });

    await page.route("**/api/coach-insight", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 80,
            readinessLabel: "Excellent",
            readinessNote: "นอนเต็มอิ่ม",
            workoutRec: "Easy Run 5 km",
            workoutTarget: "HR 130-145",
            weekSummary: "วิ่ง 10km / 2 sessions",
            keyObservation: "-",
            coachMessage: "ซ้อมเบา ๆ วันนี้ครับ"
          }
        })
      });
    });

    // Case 1: Low fuel, workout not completed yet
    await gotoApp(page, "/");
    await expect(page.getByText("ก่อนวิ่งเติมคาร์บเบา ๆ 30–50g")).toBeVisible();

    // Case 2: Workout completed -> shows recovery nutrition instead
    state.history.push({
      id: "workout-run-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${today}T07:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          workoutKind: "outdoor_run",
          distanceKm: 5,
          durationMin: 30,
        }
      }
    });

    await gotoApp(page, "/");
    await expect(page.getByText("ก่อนวิ่งเติมคาร์บเบา ๆ 30–50g")).toHaveCount(0);
    await expect(page.getByText("หลังซ้อมเน้นโปรตีน + คาร์บเพื่อฟื้นตัว")).toBeVisible();
  });

  test("5. Today explanation panel lists caution factors and walk/jog fallback options correctly", async ({ page }) => {
    const today = bangkokDateKey();
    const state = await installMockBackend(page);

    // Mock low sleep (sleep average 5.5 hours) + high load (49 km)
    state.history.push({
      id: "sleep-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "sleep",
      created_at: `${today}T10:00:00.000Z`,
      data: {
        extracted: {
          date: today,
          sleepDuration: "5h 30m",
          actualSleepDurationMinutes: 330,
          sleepScore: 70,
        },
        coach: {
          readinessScore: 70,
          readinessLabel: "Good",
        }
      }
    });

    const yesterday = bangkokDateKey(-1);
    state.history.push({
      id: "workout-1",
      user_id: "00000000-0000-4000-8000-000000000001",
      type: "workout",
      created_at: `${yesterday}T08:00:00.000Z`,
      data: {
        extracted: {
          date: yesterday,
          workoutKind: "outdoor_run",
          distanceKm: 49,
          duration: "4h 0m",
        }
      }
    });

    await page.route("**/api/coach-insight", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 70,
            readinessLabel: "Good",
            readinessNote: "นอน 5.5h",
            workoutRec: "Easy Run 6 km",
            workoutTarget: "HR 130-145",
            weekSummary: "วิ่ง 49km / 5 sessions",
            keyObservation: "-",
            coachMessage: "ซ้อมเบา ๆ วันนี้"
          }
        })
      });
    });

    await gotoApp(page, "/");
    await page.getByText("ทำไมวันนี้แนะนำแบบนี้?").click();

    await expect(page.getByText("นอนเฉลี่ย 5.5 ชม. ยังควรเพิ่ม")).toBeVisible();
    await expect(page.getByText("โหลดสัปดาห์ 49 km สูงพอสมควร")).toBeVisible();
    await expect(page.getByText("เลยแนะนำ Easy Run ไม่ใช่ tempo/interval")).toBeVisible();
    await expect(page.getByText("ถ้า HR ลอยหรือขาหนัก ให้ลดเป็น walk/jog 30–40 นาที")).toBeVisible();
  });
});
