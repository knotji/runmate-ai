import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeSleepRecord(dateKey: string, id: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T10:00:00.000Z`,
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: 420,
        sleepScore: 75,
        restingHR: 52,
        hrv: 56,
      },
      coach: { readinessScore: 72, readinessLabel: "Good" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

function makeSickRecord(dateKey: string, id: string, symptoms: string[], severity: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sick",
    created_at: `${dateKey}T10:00:00.000Z`,
    data: {
      date: dateKey,
      createdAt: `${dateKey}T10:00:00.000Z`,
      healthStatus: "sick",
      symptoms,
      severity,
      source: "manual",
    },
  };
}

test.describe("Today simplified UI", () => {
  test("1. Hero details toggle is collapsed by default (reasons not visible)", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-1"));
    await gotoApp(page, "/");

    // Toggle summary text is visible (collapsed state)
    await expect(page.getByText("ดูเหตุผล").first()).toBeVisible();

    // Reasons heading inside details should NOT be visible when collapsed
    const reasonsHeading = page.getByText("เหตุผลของคำแนะนำวันนี้");
    await expect(reasonsHeading).toBeHidden();
  });

  test("2. Expanding hero details shows reasons section", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-2"));
    await gotoApp(page, "/");

    await page.getByText("ดูเหตุผล").first().click();
    await expect(page.getByText("เหตุผลของคำแนะนำวันนี้")).toBeVisible();
    await expect(page.getByText("ซ่อนเหตุผล").first()).toBeVisible();
  });

  test("3. Sick hard-stop replaces เจ็บ signal with ป่วย (no active pain)", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSickRecord(bangkokDateKey(), "sick-simp-1", ["fever"], "moderate"));
    await gotoApp(page, "/");

    const circles = page.getByTestId("signal-circles");
    await expect(circles).toBeVisible();
    // ป่วย signal should be present in the circle row
    await expect(circles).toContainText("ป่วย");
    await expect(circles).toContainText("ควรพัก");
    // เจ็บ label should NOT appear in the signal circles when sick replaces it
    await expect(circles).not.toContainText("เจ็บ");
  });

  test("4. Signal circles always show exactly 4 when sick and no pain", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-3"));
    state.history.push(makeSickRecord(bangkokDateKey(), "sick-simp-2", ["fever"], "moderate"));
    await gotoApp(page, "/");

    // Should always be 4 signal circles (sick replaces pain, not adds a 5th)
    await expect(page.getByTestId("signal-circle")).toHaveCount(4);
  });

  test("5. Sick hard-stop hides pace guidance above fold", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-4"));
    state.history.push(makeSickRecord(bangkokDateKey(), "sick-simp-3", ["fever"], "moderate"));

    // Provide a pace target via mocked insight
    await page.route("**/api/coach-insight", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          data: {
            todayReadiness: 40,
            readinessLabel: "Low",
            readinessNote: "ป่วย",
            workoutRec: "พักฟื้นตัว",
            workoutTarget: "HR Zone 2 / pace 6:30",
            weekSummary: "-",
            keyObservation: "-",
            coachMessage: "ควรพัก",
          },
        }),
      });
    });

    await gotoApp(page, "/");

    // Pace target pill must NOT be visible above fold (it's hidden for sick hard-stop)
    const pacePill = page.getByTestId("pace-target-pill");
    await expect(pacePill).toBeHidden();
  });

  test("6. Gauge subline shows ป่วย · ควรพัก when sick hard-stop", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-5"));
    state.history.push(makeSickRecord(bangkokDateKey(), "sick-simp-4", ["fever"], "moderate"));
    await gotoApp(page, "/");

    const gauge = page.getByTestId("readiness-gauge");
    await expect(gauge).toBeVisible();
    await expect(gauge).toContainText("ป่วย · ควรพัก");
  });

  test("7. Recommendation section title is วันนี้ทำอะไรดี? for normal day", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-6"));
    await gotoApp(page, "/");

    await expect(page.getByTestId("recommendation-section-title")).toHaveText("วันนี้ทำอะไรดี?");
  });

  test("8. Sick recommendation title remains ควรพักและฟื้นตัว", async ({ page }) => {
    const state = await installMockBackend(page);
    state.history.push(makeSleepRecord(bangkokDateKey(), "sleep-simp-7"));
    state.history.push(makeSickRecord(bangkokDateKey(), "sick-simp-5", ["fever"], "moderate"));
    await gotoApp(page, "/");

    await expect(page.getByTestId("recommendation-section-title")).toHaveText("ควรพักและฟื้นตัว");
  });
});
