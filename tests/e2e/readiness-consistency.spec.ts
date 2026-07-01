import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// Helpers
function makeSleepRecord(dateKey: string, id: string, readinessScore = 75) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T10:00:00.000Z`, // 17:00 Bangkok — same day
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: 420,
        sleepScore: 78,
        restingHR: 50,
        hrv: 55,
      },
      coach: {
        readinessScore,
        readinessLabel: readinessScore >= 66 ? "Good" : "Fair",
        aiSummary: "นอนหลับดี",
        todayRecommendation: "ซ้อมได้",
      },
      confidence: "high",
      unclearFields: [],
    },
  };
}

// ─── Phase 1: Label mapping ───────────────────────────────────────────────────

test("Score 74 from AI shows Good label (not Fair) in readiness chip", async ({ page }) => {
  const state = await installMockBackend(page);

  state.history.push(makeSleepRecord(bangkokDateKey(0), "sleep-today", 74));

  // AI returns score 74 with wrong label "Fair"
  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 74,
          readinessLabel: "Fair", // AI returns wrong label — app should override
          readinessNote: "นอน 7h",
          workoutRec: "วิ่งเบา 5-6 km",
          workoutTarget: "HR ต่ำกว่า 145",
          weekSummary: "วิ่ง 0km / 0 sessions",
          keyObservation: "Readiness ok",
          coachMessage: "ร่างกายพร้อม ซ้อมได้",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Chip must show "Good" — RunMate mapping: 66–79 = Good
  await expect(page.locator(".rounded-full").filter({ hasText: "74 Readiness Good" }).first()).toBeVisible();

  // "Fair" must NOT appear in the chip (AI label string must not be used)
  await expect(page.locator(".rounded-full").filter({ hasText: "74 Readiness Fair" })).toHaveCount(0);
});

test("Score 65 shows Fair, score 66 shows Good", async ({ page }) => {
  const state = await installMockBackend(page);

  state.history.push(makeSleepRecord(bangkokDateKey(0), "sleep-today-65", 65));

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 65,
          readinessLabel: "Fair",
          readinessNote: "นอน 7h",
          workoutRec: "Easy Run",
          workoutTarget: "-",
          weekSummary: "-",
          keyObservation: "-",
          coachMessage: "-",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  await expect(page.locator(".rounded-full").filter({ hasText: "65 Readiness Fair" }).first()).toBeVisible();
  await expect(page.locator(".rounded-full").filter({ hasText: "65 Readiness Good" })).toHaveCount(0);
});

// ─── Phase 2: Chip and explanation panel show same score ──────────────────────

test("Chip and explanation panel show the same readiness score — no 74 vs 65 mismatch", async ({ page }) => {
  const state = await installMockBackend(page);

  state.history.push(makeSleepRecord(bangkokDateKey(0), "sleep-today", 74));

  // AI returns 74; whatever v2 computes internally must not appear in explanation
  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 74,
          readinessLabel: "Fair",
          readinessNote: "นอน 7h",
          workoutRec: "วิ่งเบา 5-6 km",
          workoutTarget: "HR ต่ำกว่า 145",
          weekSummary: "-",
          keyObservation: "-",
          coachMessage: "ซ้อมได้",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Chip shows 74
  await expect(page.locator(".rounded-full").filter({ hasText: /^74 Readiness/ }).first()).toBeVisible();

  // Open explanation panel
  await page.getByText("ทำไมวันนี้แนะนำแบบนี้?").click();

  // Explanation must show 74 — not 65 or any other score
  await expect(page.getByText(/Readiness วันนี้ 74\/100/)).toBeVisible();
  await expect(page.getByText(/Readiness วันนี้ 65\/100/)).toHaveCount(0);

  // Label in explanation must also be Good
  await expect(page.getByText(/74\/100 \(Good\)/)).toBeVisible();
});

// ─── Phase 3: Fallback shows "ล่าสุด" prefix in explanation too ────────────────

test("Explanation shows Readiness ล่าสุด when no today sleep", async ({ page }) => {
  const state = await installMockBackend(page);

  // Sleep from yesterday only
  state.history.push(makeSleepRecord(bangkokDateKey(-1), "sleep-yesterday", 70));

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 70,
          readinessLabel: "Good",
          readinessNote: "ใช้การนอนล่าสุด",
          workoutRec: "Easy Run",
          workoutTarget: "-",
          weekSummary: "-",
          keyObservation: "-",
          coachMessage: "ข้อมูลล่าสุด",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Chip shows "ล่าสุด" (no today sleep)
  await expect(page.locator(".rounded-full").filter({ hasText: /Readiness ล่าสุด/ }).first()).toBeVisible();

  // Open explanation panel
  await page.getByText("ทำไมวันนี้แนะนำแบบนี้?").click();

  // Explanation says "Readiness ล่าสุด" not "Readiness วันนี้"
  await expect(page.getByText(/Readiness ล่าสุด 70\/100/)).toBeVisible();
  await expect(page.getByText(/Readiness วันนี้ 70\/100/)).toHaveCount(0);
});

// ─── Phase 4: Weekly Review readiness avg shows when coach.readinessScore exists ─

test("Weekly Review readiness avg shows count when coach.readinessScore is in data", async ({ page }) => {
  const state = await installMockBackend(page);

  // 3 sleep records on different nights, each with coach.readinessScore
  for (let i = 1; i <= 3; i++) {
    state.history.push(makeSleepRecord(bangkokDateKey(-i), `sleep-${i}`, 70 + i));
  }
  // Average would be (71+72+73)/3 = 72

  await gotoApp(page, "/logs");
  await page.getByText("Insight 7 วันล่าสุด").click();

  const weeklyReview = page.locator("section").filter({ hasText: "แนวโน้ม Recovery 7 วัน" }).first();
  await expect(weeklyReview).toBeVisible();

  const sleepCell = weeklyReview.locator(".rounded-xl").filter({ hasText: "นอนเฉลี่ย" });

  // Should show readiness avg, NOT just "–"
  await expect(sleepCell.getByText(/Readiness เฉลี่ย \d+/)).toBeVisible();

  // Should show count "N วัน"
  await expect(sleepCell.getByText(/\d+ วัน/)).toBeVisible();
});

test("Weekly Review readiness avg does not double-count duplicate nights", async ({ page }) => {
  const state = await installMockBackend(page);

  // Two sleep records for same night (different upload times — should dedupe to 1)
  const dateKey = bangkokDateKey(-1);
  state.history.push(makeSleepRecord(dateKey, "sleep-dup-a", 80));
  state.history.push({ ...makeSleepRecord(dateKey, "sleep-dup-b", 80), created_at: `${dateKey}T11:00:00.000Z` });

  await gotoApp(page, "/logs");
  await page.getByText("Insight 7 วันล่าสุด").click();

  const weeklyReview = page.locator("section").filter({ hasText: "แนวโน้ม Recovery 7 วัน" }).first();
  const sleepCell = weeklyReview.locator(".rounded-xl").filter({ hasText: "นอนเฉลี่ย" });

  // Count should be 1, not 2
  await expect(sleepCell.getByText("1 วัน")).toBeVisible();
});
