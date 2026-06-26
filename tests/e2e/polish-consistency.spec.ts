import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

test("Polish consistency: Today recommendation decision, Coach readiness, Race strength card, and Upload helper context", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);

  // 1. Mock Today readiness and Coach context
  // Seed sleep history with readiness 65
  state.history.push({
    id: "sleep-1",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T22:00:00.000Z`,
    data: {
      extracted: {
        date: today,
        sleepDuration: "7h 0m",
        actualSleepDurationMinutes: 420,
        sleepScore: 70,
        energyScore: 60,
        restingHR: 52,
        hrv: 60,
      },
      coach: {
        readinessScore: 60,
        readinessLabel: "Fair",
        todayRecommendation: "Easy Run 5-6 km หรือปั่นเบา",
      }
    }
  });

  // Mock race plan with strength workout and a run
  const mockPlan = {
    raceCountdownText: "อีก 14 วัน",
    totalWeeks: 4,
    currentPhase: "Base",
    planSummary: "ฝึกความทนทาน",
    phases: [],
    planStartDate: today,
    weeklyPlan: [
      {
        day: "จันทร์",
        workoutType: "Strength",
        distanceKm: null,
        targetPace: null,
        targetHR: null,
        description: "เสริม Core & Abs ช่วยให้ทรงตัวดีขึ้น",
        durationMin: 30,
        purpose: "Core & Abs",
        adjustment: "เบา-ปานกลาง"
      },
      {
        day: "อังคาร",
        workoutType: "Long Run",
        distanceKm: 12,
        targetPace: "6:30-7:00",
        targetHR: "140-150",
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
        race_distance: "Half Marathon",
        goal_type: "time",
        target_time: "2:00:00",
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
        end_date: today,
        total_weeks: 4,
        phases_json: mockPlan
      }])
    });
  });

  // Mock coach-insight response with todayReadiness 65
  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 60,
          readinessLabel: "Fair",
          readinessNote: "นอน 7h, readiness 60",
          workoutRec: "Easy Run 5-6 km หรือปั่นเบา",
          workoutTarget: "HR ต่ำกว่า 145, pace สบาย",
          weekSummary: "วิ่ง 0km / 0 sessions",
          keyObservation: "Readiness Fair",
          coachMessage: "วันนี้มีประวัติเจ็บเท้าเพิ่งหาย ระบบเลยปรับเป็น Easy Run 5-6 km หรือปั่นเบา ถ้าขายังล้า ให้เลือก Recovery Strength แทน"
        }
      })
    });
  });

  // Test 1: Today Page shows clear primary recommendation
  await gotoApp(page, "/");
  await expect(page.getByText("วันนี้เลือกอย่างใดอย่างหนึ่งก่อน")).toBeVisible();
  await expect(page.getByText("แผน Race เดิมคือ")).toBeVisible();
  
  // Test 2: Readiness Chip shows Readiness 60 matching Coach readiness
  await expect(page.getByText("60 Readiness Fair")).toBeVisible();

  // Test 3: Go to Coach page, context card displays Readiness (average from 7d)
  await gotoApp(page, "/coach");
  await page.getByText("ดูบริบท").click();
  // avgReadiness is shown in the context card (may differ from today readiness)
  await expect(page.getByText(/Readiness \d+/).first()).toBeVisible();

  // Test 4: Race strength card hides pace/HR
  await gotoApp(page, "/race-goal");
  await expect(page.getByText("Strength").first()).toBeVisible();
  // Each individual workout card is a div with ring-1 ring-slate-100
  // Find the one that contains "Strength" workoutType
  const strengthCard = page.locator("div.ring-1").filter({ hasText: "Strength" }).first();
  await expect(strengthCard).toBeVisible();
  // Strength card should NOT have Pace label
  await expect(strengthCard.getByText("Pace")).toHaveCount(0);
  await expect(strengthCard.getByText("ไม่มี pace")).toHaveCount(0);
  await expect(strengthCard.getByText("ไม่มี HR")).toHaveCount(0);


  // Test 5: Today page after strength workout says "หลังเวท" / "หลังออกกำลังกาย"
  // Save a strength workout for today
  state.history.push({
    id: "workout-strength-today",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "strength",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      durationMin: 25,
      routineName: "Recovery Strength",
    }
  });

  await gotoApp(page, "/");
  await expect(page.getByText("ฟื้นตัวหลังเวทวันนี้").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("หลังวิ่งวันนี้แล้ว");

  // Test 6: Upload page helper copy matches tab context
  await gotoApp(page, "/upload?type=meal");
  await expect(page.getByText("ลองอัปโหลดเพื่อสร้าง Report")).toBeVisible();
  await expect(page.getByText("รูปอาหาร")).toBeVisible();
  await expect(page.getByText("ฉลากโภชนาการ")).toBeVisible();
  await expect(page.getByText("เมนูหรือใบเสร็จ")).toBeVisible();

  await gotoApp(page, "/upload?type=workout");
  await expect(page.getByText("รูปผลวิ่ง")).toBeVisible();
  await expect(page.getByText("รูปเวท")).toBeVisible();
  await expect(page.getByText("รูปกิจกรรมอื่น")).toBeVisible();

  await gotoApp(page, "/upload?type=sleep");
  await expect(page.getByText("รูปการนอน")).toBeVisible();
  await expect(page.getByText("รูป Energy score")).toBeVisible();

  await gotoApp(page, "/upload?type=body");
  await expect(page.getByText("รูปชั่งน้ำหนัก")).toBeVisible();

  await gotoApp(page, "/upload?type=health_check");
  await expect(page.getByText("PDF/รูปผลตรวจ")).toBeVisible();
});
