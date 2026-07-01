import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const MOCK_PLAN = {
  planStartDate: "2026-07-01",
  totalWeeks: 8,
  currentPhase: "Base",
  planSummary: "แผนทดสอบ",
  weeklyPlan: [
    {
      day: "จันทร์",
      workoutType: "Easy Run",
      distanceKm: 5,
      description: "วิ่งเบา",
      durationMin: 30,
      purpose: "Aerobic base",
      adjustment: null,
    },
  ],
};

async function setupExistingRacePlan(
  page: Parameters<typeof gotoApp>[0],
  raceName: string,
  raceDistance: string,
  raceDate: string,
) {
  await page.route("**/rest/v1/race_goals*", async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }
    if (method === "POST") {
      // Upsert: echo back the request body so the new goal name is preserved in state
      const body = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "goal-new",
          race_name: body.race_name ?? raceName,
          race_date: body.race_date ?? raceDate,
          race_distance: body.race_distance ?? raceDistance,
          status: "active",
        }]),
      });
      return;
    }
    // GET — return existing mock goal
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "goal-1", race_name: raceName, race_date: raceDate, race_distance: raceDistance, status: "active" }]),
    });
  });

  await page.route("**/rest/v1/training_plans*", async (route) => {
    const method = route.request().method();
    if (method === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([{ id: "plan-2" }]) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "plan-1", race_goal_id: "goal-1", start_date: raceDate, phases_json: MOCK_PLAN }]),
    });
  });
}

test.describe("Race Goal safety — non-destructive create/replace", () => {
  test("1. Existing plan is safe: clicking 'สร้างแผนใหม่' enters draft mode without deleting data", async ({ page }) => {
    const today = bangkokDateKey();
    await installMockBackend(page);
    await setupExistingRacePlan(page, "Bangkok Marathon", "10K", today);

    await gotoApp(page, "/race-goal");
    // Existing plan is visible
    await expect(page.getByText("Bangkok Marathon").first()).toBeVisible();

    // Click the create-new button
    await page.getByRole("button", { name: /สร้างแผนใหม่/ }).click();

    // Form appears in draft mode
    await expect(page.getByRole("heading", { name: "สร้าง Race Goal" })).toBeVisible();

    // Compact hint still shows the existing plan name — data is safe
    const hint = page.getByTestId("draft-mode-hint");
    await expect(hint).toBeVisible();
    await expect(hint.getByText("Bangkok Marathon")).toBeVisible();
    await expect(hint).toContainText("การสร้างใหม่จะยังไม่แทนที่แผนเดิมจนกว่าจะยืนยัน");

    // Cancel button visible
    await expect(page.getByRole("button", { name: /กลับไปแผนเดิม/ })).toBeVisible();
  });

  test("2. Cancel draft returns to existing plan view", async ({ page }) => {
    const today = bangkokDateKey();
    await installMockBackend(page);
    await setupExistingRacePlan(page, "Bangkok Marathon", "10K", today);

    await gotoApp(page, "/race-goal");
    await expect(page.getByText("Bangkok Marathon").first()).toBeVisible();

    // Enter draft mode
    await page.getByRole("button", { name: /สร้างแผนใหม่/ }).click();
    await expect(page.getByRole("heading", { name: "สร้าง Race Goal" })).toBeVisible();

    // Cancel — should return to existing plan
    await page.getByRole("button", { name: /กลับไปแผนเดิม/ }).click();

    await expect(page.getByRole("heading", { name: "สร้าง Race Goal" })).toBeHidden();
    await expect(page.getByTestId("draft-mode-hint")).toBeHidden();
    await expect(page.getByText("Bangkok Marathon").first()).toBeVisible();
  });

  test("3. Submitting form shows confirmation — old plan not yet replaced", async ({ page }) => {
    const today = bangkokDateKey();
    await installMockBackend(page);
    await setupExistingRacePlan(page, "Bangkok Marathon", "10K", today);

    await page.route("**/api/generate-race-plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...MOCK_PLAN, planStartDate: today } }),
      });
    });

    await gotoApp(page, "/race-goal");
    await page.getByRole("button", { name: /สร้างแผนใหม่/ }).click();

    // Fill required fields
    await page.getByPlaceholder("เช่น ก้าวท้าใจ 5K").fill("Chiang Mai Marathon");
    await page.getByPlaceholder("dd/mm/yyyy").fill("01/08/2027");

    await page.getByRole("button", { name: "สร้างแผนซ้อม" }).click();

    // Confirmation section appears
    const confirmSection = page.getByTestId("confirm-replace-section");
    await expect(confirmSection).toBeVisible();
    await expect(confirmSection.getByText("สร้างแผนใหม่แทนแผนเดิม?")).toBeVisible();

    // Both old and new race names are shown
    await expect(confirmSection.getByText("Bangkok Marathon")).toBeVisible();
    await expect(confirmSection.getByText("Chiang Mai Marathon")).toBeVisible();

    // The old plan reminder hint still visible above the confirmation
    await expect(page.getByTestId("draft-mode-hint").getByText("Bangkok Marathon")).toBeVisible();
  });

  test("4. Cancelling confirmation returns to form in draft mode", async ({ page }) => {
    const today = bangkokDateKey();
    await installMockBackend(page);
    await setupExistingRacePlan(page, "Bangkok Marathon", "10K", today);

    await page.route("**/api/generate-race-plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...MOCK_PLAN, planStartDate: today } }),
      });
    });

    await gotoApp(page, "/race-goal");
    await page.getByRole("button", { name: /สร้างแผนใหม่/ }).click();
    await page.getByPlaceholder("เช่น ก้าวท้าใจ 5K").fill("Chiang Mai Marathon");
    await page.getByPlaceholder("dd/mm/yyyy").fill("01/08/2027");
    await page.getByRole("button", { name: "สร้างแผนซ้อม" }).click();
    await expect(page.getByTestId("confirm-replace-section")).toBeVisible();

    // Click cancel in confirmation
    await page.getByTestId("confirm-replace-section").getByRole("button", { name: "ยกเลิก" }).click();

    // Confirmation gone — form reappears (still in draft mode)
    await expect(page.getByTestId("confirm-replace-section")).toBeHidden();
    await expect(page.getByRole("heading", { name: "สร้าง Race Goal" })).toBeVisible();

    // Hint still visible — plan still safe
    await expect(page.getByTestId("draft-mode-hint")).toBeVisible();
  });

  test("5. Confirming replacement saves new plan and exits draft mode", async ({ page }) => {
    const today = bangkokDateKey();
    await installMockBackend(page);
    await setupExistingRacePlan(page, "Bangkok Marathon", "10K", today);

    await page.route("**/api/generate-race-plan", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { ...MOCK_PLAN, planStartDate: today } }),
      });
    });

    await gotoApp(page, "/race-goal");
    await page.getByRole("button", { name: /สร้างแผนใหม่/ }).click();
    await page.getByPlaceholder("เช่น ก้าวท้าใจ 5K").fill("Chiang Mai Marathon");
    await page.getByPlaceholder("dd/mm/yyyy").fill("01/08/2027");
    await page.getByRole("button", { name: "สร้างแผนซ้อม" }).click();
    await expect(page.getByTestId("confirm-replace-section")).toBeVisible();

    // Confirm replacement
    await page.getByRole("button", { name: "ยืนยันสร้างแผนใหม่" }).click();

    // Page exits draft mode: confirmation and hint are gone, form is hidden
    await expect(page.getByTestId("confirm-replace-section")).toBeHidden();
    await expect(page.getByTestId("draft-mode-hint")).toBeHidden();
    await expect(page.getByRole("heading", { name: "สร้าง Race Goal" })).toBeHidden();

    // View mode active: the new plan's workout is visible in the 7-day section
    await expect(page.getByText("Easy Run").first()).toBeVisible();
  });

  test("6. First-time create needs no confirmation or draft warning", async ({ page }) => {
    await installMockBackend(page);
    // No existing race goal
    await page.route("**/rest/v1/race_goals*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });
    await page.route("**/rest/v1/training_plans*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    });

    await gotoApp(page, "/race-goal");

    // Form appears directly — no draft hint, no cancel button
    await expect(page.getByRole("heading", { name: "สร้าง Race Goal" })).toBeVisible();
    await expect(page.getByTestId("draft-mode-hint")).toBeHidden();
    await expect(page.getByRole("button", { name: /กลับไปแผนเดิม/ })).toBeHidden();
  });
});
