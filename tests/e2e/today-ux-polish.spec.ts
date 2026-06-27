import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// ─── Phase 1: Summary card (EndOfDaySummaryCard) ─────────────────────────────

test("End of day summary card shows สรุปท้ายวัน when no summary exists", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");

  // Button label should be "สรุปท้ายวัน" when no summary saved yet
  await expect(page.getByRole("button", { name: "สรุปท้ายวัน" })).toBeVisible();
});

// ─── Phase 2: Today section headings ─────────────────────────────────────────

test("Today page shows section headings แผนวันนี้ and ภาพรวมวันนี้", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");

  await expect(page.getByText("แผนวันนี้", { exact: true })).toBeVisible();
  await expect(page.getByText("ภาพรวมวันนี้", { exact: true }).first()).toBeVisible();
  // "สรุป" exact match targets section heading
  await expect(page.getByText("สรุป", { exact: true })).toBeVisible();
});

test("Today page shows อาหารวันนี้ section heading when coachCtx is loaded", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");

  // อาหารวันนี้ heading is gated on coachCtx being non-null
  await expect(page.getByText("อาหารวันนี้", { exact: true })).toBeVisible();
});

test("Today page shows Recovery / อาการ section heading when pain exists", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push({
    id: "pain-rec",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "pain",
    created_at: `${today}T10:00:00.000Z`,
    data: { painLocation: "เท้า", painSide: "unknown", painLevel: 2, status: "active", riskLevel: "low", trainingImpact: "run_ok_easy", notes: "", redFlags: [], painType: [], startedWhen: "unknown", painfulWhen: [], swellingOrRedness: "no", canBearWeight: "yes", coachAdvice: "", createdAt: `${today}T10:00:00.000Z` },
  });

  await gotoApp(page, "/");

  await expect(page.getByText("Recovery / อาการ")).toBeVisible();
});

// ─── Phase 2b: CompactPainCard actions ───────────────────────────────────────

test("CompactPainCard shows อัปเดต action when active pain exists", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push({
    id: "pain-active",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "pain",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      painLocation: "เข่าซ้าย",
      painSide: "left",
      painLevel: 4,
      status: "active",
      riskLevel: "medium",
      trainingImpact: "reduce_load",
      notes: "ปวดตอนซ้อม",
      redFlags: [],
      painType: [],
      startedWhen: "unknown",
      painfulWhen: [],
      swellingOrRedness: "no",
      canBearWeight: "yes",
      coachAdvice: "",
      createdAt: `${today}T10:00:00.000Z`,
    },
  });

  await gotoApp(page, "/");

  // CompactPainCard renders when pain exists and shows อัปเดต link
  await expect(page.getByText("🩹 เข่าซ้าย")).toBeVisible();
  await expect(page.getByRole("link", { name: "อัปเดต" })).toBeVisible();
});

// ─── Phase 3: Coach context card cleanup ─────────────────────────────────────

test("Coach context compact summary does not show standalone Readiness label", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Add sleep so context card has data
  state.history.push({
    id: "sleep-coach",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      extracted: { date: today, actualSleepDurationMinutes: 420, sleepScore: 78, restingHR: 50, hrv: 55 },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high", unclearFields: [],
    },
  });

  await gotoApp(page, "/coach");

  // The compact summary badge (next to "ดูบริบท") should NOT start with "Good" or "Fair" standalone
  // (readiness label has been removed; it now starts with "นอนล่าสุด")
  const summaryBadge = page.locator("summary").filter({ hasText: "ดูบริบท" });
  await expect(summaryBadge).toBeVisible();

  // Compact text should contain sleep info, not isolated "Good"/"Fair" readiness label
  await expect(page.locator("summary p").filter({ hasText: /^(Good|Fair|Excellent|Low)$/ })).toHaveCount(0);
  await expect(page.locator("summary").filter({ hasText: /นอนล่าสุด/ })).toBeVisible();
});

// ─── Phase 4: Wording polish ──────────────────────────────────────────────────

test("Coach chat helper text is updated", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/coach");

  await expect(page.getByText("ใช้ข้อมูลจาก Report เป็นพื้นหลัง แต่คุยได้เหมือนโค้ชส่วนตัว")).toBeVisible();
  // Old text must not appear
  await expect(page.getByText("โค้ชใช้ Report เป็นบริบท แต่ตอบแบบคุยกันธรรมชาติ")).toHaveCount(0);
});

test("Explanation toggle shows ซ่อนเหตุผล when expanded and original text when collapsed", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push({
    id: "sleep-toggle",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      extracted: { date: today, actualSleepDurationMinutes: 420, sleepScore: 75, restingHR: 52, hrv: 58 },
      coach: { readinessScore: 70, readinessLabel: "Good" },
      confidence: "high", unclearFields: [],
    },
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
          readinessNote: "นอน 7h",
          workoutRec: "Easy Run",
          workoutTarget: "-",
          weekSummary: "-",
          keyObservation: "-",
          coachMessage: "ซ้อมได้",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Collapsed state shows original question text
  await expect(page.getByText("ทำไมวันนี้แนะนำแบบนี้?")).toBeVisible();

  // Click to expand
  await page.getByText("ทำไมวันนี้แนะนำแบบนี้?").click();

  // Expanded state shows ซ่อนเหตุผล
  await expect(page.getByText("ซ่อนเหตุผล")).toBeVisible();
  await expect(page.getByText("ทำไมวันนี้แนะนำแบบนี้?")).toHaveCount(0);

  // Click again to collapse
  await page.getByText("ซ่อนเหตุผล").click();
  await expect(page.getByText("ทำไมวันนี้แนะนำแบบนี้?")).toBeVisible();
});
