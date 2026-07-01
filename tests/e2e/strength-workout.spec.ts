import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";
import { reportDayByDate } from "./helpers/selectors";

test("Strength workout image upload, review, and save flow", async ({ page }) => {
  const today = bangkokDateKey();
  const state = await installMockBackend(page);

  // Mock the analyze-workout endpoint
  await page.route("**/api/analyze-workout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "mock",
        data: {
          extracted: {
            workoutKind: "strength",
            date: today,
            distanceKm: null,
            duration: "36:36",
            avgPace: null,
            avgSpeedKmh: null,
            avgHR: 90,
            maxHR: 123,
            calories: 199,
            elevationGain: null,
            vo2Max: null,
            sweatLossMl: null,
            visibleMetrics: ["เวลา", "HR", "แคลอรี"],
            exercises: [
              { name: "Squats", sets: 3, reps: "24" },
              { name: "Push-ups", sets: 3, reps: "20" },
              { name: "Plank", sets: 3, reps: "3" }
            ],
            muscleGroups: ["ขา", "Core", "อก"],
            intensity: "moderate",
            rpe: 6
          },
          coach: {
            workoutSummary: "เวท Full Body วันนี้ทำได้ดีมากครับ",
            intensityAssessment: "ระดับความหนักปานกลาง",
            trainingLoadNote: "โหลดพอเหมาะกับการฟื้นตัว",
            wasTooHard: false,
            recoveryAdvice: "พักผ่อนให้เพียงพอและยืดกล้ามเนื้อ",
            nutritionAfterWorkout: "เติมโปรตีนและน้ำ",
            nextWorkoutSuggestion: "วันพรุ่งนี้วิ่ง easy สบายๆ",
            coachNote: "ซ้อมให้ต่อเนื่องและไม่ฝืนสำคัญกว่าตัวเลขสวยในวันเดียว"
          },
          confidence: "high",
          unclearFields: []
        }
      })
    });
  });

  // Navigate to Upload workout, strength subtype
  await gotoApp(page, "/upload?type=workout&subtype=strength");

  // Select Tab "อัปโหลดรูป" if not selected
  await page.getByRole("button", { name: "🖼️ อัปโหลดรูป" }).click();

  // Upload mock screenshot
  await page.locator('input[type="file"]').setInputFiles({
    name: "strength.png",
    mimeType: "image/png",
    buffer: Buffer.from("e2e-image"),
  });

  // Trigger analysis
  await page.getByRole("button", { name: "วิเคราะห์การซ้อม", exact: true }).click();

  // Verify strength card appears with correct metrics and no distance/pace
  await expect(page.getByText("🏋️ เวท / Strength")).toBeVisible();
  await expect(page.getByText("เวท Full Body วันนี้ทำได้ดีมากครับ")).toBeVisible();
  await expect(page.getByText("Squats")).toBeVisible();
  await expect(page.getByText("Push-ups")).toBeVisible();
  await expect(page.getByText("Plank")).toBeVisible();
  await expect(page.getByText("ขา · Core · อก")).toBeVisible();

  // Verify distance and pace are not visible on the card
  await expect(page.getByText("Distance")).toHaveCount(0);
  await expect(page.getByText("Avg pace")).toHaveCount(0);

  // Verify save button exists and has the correct label
  const saveBtn = page.getByRole("button", { name: "บันทึกเวทลง Report", exact: true });
  await expect(saveBtn).toBeVisible();
  await expect(saveBtn).toBeEnabled();

  // Save the workout
  await saveBtn.click();

  // Verify saved successfully
  await expect.poll(() => state.history.filter((row) => row.type === "workout").length).toBe(1);
  await expect(page.getByText("บันทึกเข้า Report แล้ว").first()).toBeVisible();

  // Verify in Report logs
  await gotoApp(page, "/logs");
  await page.getByText("รายการทั้งหมด").click();
  const reportDay = reportDayByDate(page, today);
  await expect(reportDay).toBeVisible();
  
  // Today starts expanded by default — no toggle click needed
  await expect(reportDay.getByText("เวท").first()).toBeVisible();
  await expect(reportDay.getByText("Squats, Push-ups, Plank")).toBeVisible();
});
