import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

// ─── Phase 1: Summary card (EndOfDaySummaryCard) ─────────────────────────────

test("End of day summary card shows สรุปท้ายวัน when no summary exists", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");

  // "สรุปท้ายวัน" text appears in the end-of-day card (as button during evening, as summary text during daytime)
  await expect(page.locator("#end-of-day-summary").getByText("สรุปท้ายวัน").first()).toBeVisible();
});

// ─── Phase 2: Today section headings ─────────────────────────────────────────

test("Today page shows ภาพรวมวันนี้ and วันนี้ควรทำอะไร headings in correct order", async ({ page }) => {
  await installMockBackend(page);
  await gotoApp(page, "/");

  // ภาพรวมวันนี้ is now the first card (recovery-first)
  await expect(page.getByText("ภาพรวมวันนี้", { exact: true }).first()).toBeVisible();
  // วันนี้ควรทำอะไร is the internal heading of the hero card (second card)
  await expect(page.getByText("วันนี้ควรทำอะไร", { exact: true })).toBeVisible();
  // ภาพรวมวันนี้ must appear before วันนี้ควรทำอะไร in the DOM
  const overviewPos = await page.getByText("ภาพรวมวันนี้", { exact: true }).first().boundingBox();
  const heroPos = await page.getByText("วันนี้ควรทำอะไร", { exact: true }).boundingBox();
  if (overviewPos && heroPos) {
    expect(overviewPos.y).toBeLessThan(heroPos.y);
  }
  // "สรุป" section still present
  await expect(page.getByText("สรุป", { exact: true })).toBeVisible();
});

test("Today page shows อาหารวันนี้ section heading when nutrition data is present", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Inject a meal so the nutrition section renders
  state.history.push({
    id: "meal-today",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "meal",
    created_at: `${today}T08:00:00.000Z`,
    data: {
      extracted: { mealType: "breakfast", items: [{ name: "ข้าวต้ม", calories: 200, protein: 10, carbs: 30, fat: 3 }] },
      nutrition: { totalCalories: 200, totalProtein: 10, totalCarbs: 30, totalFat: 3 },
    },
  });

  await gotoApp(page, "/");

  // อาหารวันนี้ heading appears when nutrition data is available
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

  await expect(page.getByText(/ตอบทุกเรื่องซ้อม กิน นอน recovery/)).toBeVisible();
  // Old texts must not appear
  await expect(page.getByText("ใช้ข้อมูลจาก Report เป็นพื้นหลัง แต่คุยได้เหมือนโค้ชส่วนตัว")).toHaveCount(0);
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

test("Hero pre-workout has only one secondary details toggle visible", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  state.history.push({
    id: "sleep-single-toggle",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T08:00:00.000Z`,
    data: {
      extracted: { date: today, actualSleepDurationMinutes: 420, sleepScore: 72, restingHR: 53, hrv: 56 },
      coach: { readinessScore: 72, readinessLabel: "Good" },
      confidence: "high", unclearFields: [],
    },
  });

  await page.route("**/api/coach-insight", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, data: { todayReadiness: 72, readinessLabel: "Good", readinessNote: "นอน 7h", workoutRec: "Easy Run", workoutTarget: "-", weekSummary: "-", keyObservation: "-", coachMessage: "ซ้อมได้" } }),
    });
  });

  await gotoApp(page, "/");

  // Old "ดูเหตุผลและข้อแนะนำเพิ่มเติม" toggle must NOT appear (merged into outer toggle)
  await expect(page.getByText("ดูเหตุผลและข้อแนะนำเพิ่มเติม")).toHaveCount(0);

  // Single secondary control: "ทำไมวันนี้แนะนำแบบนี้?" visible and clickable
  await expect(page.getByText("ทำไมวันนี้แนะนำแบบนี้?")).toBeVisible();

  // CTA still prominent
  await expect(page.getByRole("link", { name: "บันทึกกิจกรรมวันนี้" })).toBeVisible();

  // Clicking the toggle opens the reasons section
  await page.getByText("ทำไมวันนี้แนะนำแบบนี้?").click();
  await expect(page.getByText("ซ่อนเหตุผล")).toBeVisible();
  await expect(page.getByText("เหตุผลของคำแนะนำวันนี้")).toBeVisible();
});

// ─── Today UX and Readiness Polish (Phases 1-4) ─────────────────────────────

test("Completed strength routine shows completed state on Today page", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Set up mock data: planned strength routine for today in racePlan
  state.racePlan = {
    planId: "mock-plan-id",
    planName: "Mock Marathon Plan",
    planStartDate: today,
    todayWorkout: {
      day: "Today",
      workoutType: "Strength",
      description: "Recovery Strength",
      distanceKm: null,
      durationMin: 25,
    },
    weeklyPlan: [
      {
        day: "Today",
        workoutType: "Strength",
        description: "Recovery Strength",
        distanceKm: null,
        durationMin: 25,
        dateKey: today,
      }
    ],
  };

  // Add logged strength workout for today to context history
  state.history.push({
    id: "strength-completed-today",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "strength",
    created_at: `${today}T10:00:00.000Z`,
    data: {
      routineId: "recovery",
      routineName: "Recovery Strength",
      source: "saved_routine",
      intensity: "easy",
      durationMin: 25,
      exercises: [
        { name: "Squats", sets: 3, reps: 10 },
        { name: "Push-ups", sets: 3, reps: 8 },
      ],
      notes: "done",
      createdAt: `${today}T10:00:00.000Z`,
    },
  });

  await gotoApp(page, "/");

  // Today shows completed title and completed banner/metrics
  await expect(page.getByText("Recovery Strength เสร็จแล้ว")).toBeVisible();
  await expect(page.getByText("ต่อจากนี้เน้นฟื้นตัว เดินเบา ๆ ยืดเบา ๆ และนอนให้พอ")).toBeVisible();

  // Logging duration metric badge should be visible
  await expect(page.getByText("25 นาที", { exact: true })).toBeVisible();

  // Full exercise list is hidden by default: check that "Squats" is not visible
  await expect(page.getByText("Squats")).toHaveCount(0);

  // Toggle "ดูรายละเอียดที่ทำ" reveals details
  await page.getByText("ดูรายละเอียดที่ทำ").click();
  await expect(page.getByText("Squats")).toBeVisible();

  // Toggle "ซ่อนรายละเอียด" collapses details (use the button, not the Recovery span)
  await page.getByRole("button").filter({ hasText: "ซ่อนรายละเอียด" }).click();
  await expect(page.getByText("Squats")).toHaveCount(0);

  // CTA should be secondary "ดูใน Report"
  const cta = page.getByRole("link", { name: "ดูใน Report" });
  await expect(cta).toBeVisible();
  // Ensure primary CTA "บันทึกว่าเสร็จแล้ว" or "ปรับเป็นเวอร์ชันวันนี้" is NOT visible
  await expect(page.getByRole("button", { name: "บันทึกว่าเสร็จแล้ว" })).toHaveCount(0);
});

test("Post-workout recommendation uses recovery wording and avoids suggesting duplicate workout", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Log a run workout today
  state.history.push({
    id: "run-logged-today",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${today}T08:00:00.000Z`,
    data: {
      date: today,
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm: 5,
        duration: "00:30:00",
        avgHR: 145,
        calories: 350,
      },
      coach: {
        workoutSummary: "วิ่งดีมาก",
      },
    },
  });

  await gotoApp(page, "/");

  // Title uses recovery wording: "ฟื้นตัวหลังวิ่ง 5 km" or "หลังซ้อมวันนี้ควรทำอะไรต่อ"
  await expect(page.getByText("หลังซ้อมวันนี้ควรทำอะไรต่อ")).toBeVisible();
  await expect(page.getByText("ฟื้นตัวหลังวิ่ง 5 km")).toBeVisible();

  // Recovery note is inside "ดูสิ่งที่ควรทำต่อ" accordion — expand first
  await page.getByText("ดูสิ่งที่ควรทำต่อ").click();
  await expect(page.getByText("บันทึกกิจกรรมวันนี้แล้ว ไม่จำเป็นต้องซ้อมหนักซ้ำอีก")).toBeVisible();
});

test("Today snapshot shows Readiness explanation details and correct coverage label", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Add sleep so we have readiness score
  state.history.push({
    id: "sleep-rec",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T07:00:00.000Z`,
    data: {
      extracted: { date: today, actualSleepDurationMinutes: 450, sleepScore: 82, restingHR: 52, hrv: 60 },
      coach: { readinessScore: 80, readinessLabel: "Excellent" },
    },
  });

  await gotoApp(page, "/");

  const overviewReason = page.getByTestId("today-overview-reason");
  await expect(overviewReason).toBeVisible();
  const reasonText = (await overviewReason.textContent())?.trim() ?? "";
  expect(reasonText.length).toBeGreaterThan(0);
  expect(reasonText.split(" · ").filter(Boolean).length).toBeLessThanOrEqual(3);

  // Coverage chips and explanation are inside the Recovery accordion — expand first
  await page.getByText("ดูรายละเอียด Recovery").click();

  // Coverage chip container prefix label
  await expect(page.getByText("ข้อมูลที่ใช้ประเมิน:")).toBeVisible();

  // Target explanation details (nested inside Recovery accordion)
  await expect(page.getByText("ระบบ Recovery วันนี้คืออะไร?")).toBeVisible();
  await page.getByText("ระบบ Recovery วันนี้คืออะไร?").click();
  await expect(page.getByText("แต่ละแกนให้คะแนน 0–100 เพื่อช่วยดูว่าร่างกายพร้อมแค่ไหน")).toBeVisible();
});

test("Report page shows updated readiness labels and disclaimers", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();

  // Add sleep record with readiness
  state.history.push({
    id: "sleep-rep",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T07:00:00.000Z`,
    data: {
      extracted: { date: today, actualSleepDurationMinutes: 420, sleepScore: 75, restingHR: 55, hrv: 50 },
      coach: { readinessScore: 74, readinessLabel: "Good" },
    },
  });

  await gotoApp(page, "/logs");

  // 7-Day Overview labels — inside WeeklyDashboard accordion, expand first
  await page.getByText("Insight 7 วันล่าสุด").click();
  await page.getByText("ตัวเลขสรุป 7 วันล่าสุด").click();
  await expect(page.getByText("Readiness เฉลี่ย", { exact: true })).toBeVisible();
  await expect(page.getByText("จากวันที่มีข้อมูล")).toBeVisible();

  // Collapsed Day card badge: Thai readiness label
  await expect(page.getByText("ความพร้อม", { exact: true }).first()).toBeVisible();

  // Expanded Sleep Detail shows the warning disclaimer
  await page.getByTestId("full-history-details").evaluate((el) => {
    (el as HTMLDetailsElement).open = true;
  });
  await expect(page.getByText("* Readiness เป็นคะแนนความพร้อมจากข้อมูล recovery ของวันนั้น ไม่ใช่คะแนนสรุปทั้งวัน")).toBeVisible();
});

// ─── Today Insight Timeout Handling Tests (Phases 1-5) ──────────────────────

test("Today page does not abort successful responses around 10-11s", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  state.history.push({
    id: "sleep-1",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T07:00:00.000Z`,
    data: {
      extracted: { date: today, sleepScore: 75, energyScore: 75 },
      coach: { readinessScore: 75, readinessLabel: "Good" },
    },
  });

  // Intercept the API to simulate an 11s response delay
  await page.route("**/api/coach-insight", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 11000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          todayReadiness: 75,
          readinessLabel: "Good",
          readinessNote: "ดีมาก",
          workoutRec: "Tempo Run 8km",
          workoutTarget: "Pace 5:30",
          weekSummary: "-",
          keyObservation: "-",
          coachMessage: "วิ่งเลยวันนี้",
        },
      }),
    });
  });

  await gotoApp(page, "/");

  // Verify that the final response is successfully displayed
  // (We use a larger timeout here for the expect since there is a deliberate 11s delay)
  await expect(page.getByText("Tempo Run 8km")).toBeVisible({ timeout: 15000 });
});

test("Today page handles client timeout gracefully and uses fallback", async ({ page }) => {
  const state = await installMockBackend(page);
  const today = bangkokDateKey();
  state.history.push({
    id: "sleep-1",
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${today}T07:00:00.000Z`,
    data: {
      extracted: { date: today, sleepScore: 75, energyScore: 75 },
      coach: { readinessScore: 75, readinessLabel: "Good" },
    },
  });

  const consoleLogs: string[] = [];
  page.on("console", (msg) => {
    consoleLogs.push(msg.text());
  });

  // Intercept API with a 25s delay (longer than the 18s client timeout)
  await page.route("**/api/coach-insight", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 25000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, data: {} }),
    });
  });

  await gotoApp(page, "/");

  // Fallback error banner should appear due to client timeout (18s)
  await expect(page.getByText("ระบบยังประเมินด้วยโค้ชไม่สำเร็จ แต่ใช้ข้อมูลจาก Report เพื่อแนะนำเบื้องต้นให้ก่อน")).toBeVisible({ timeout: 21000 });

  // Verify that AbortError was NOT logged as generic fetch-error but as [today-analysis-timeout]
  expect(consoleLogs.some((log) => log.includes("[today-analysis-timeout]"))).toBe(true);
  expect(consoleLogs.some((log) => log.includes("[today-analysis-fetch-error]"))).toBe(false);
});
