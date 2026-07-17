import { expect, test } from "@playwright/test";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

function makeSleep(dateKey: string, id: string, hours = 7) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: {
        date: dateKey,
        actualSleepDurationMinutes: hours * 60,
        sleepScore: 76,
        restingHR: 50,
        hrv: 55,
      },
      coach: { readinessScore: 74, readinessLabel: "Good", aiSummary: "นอนดี", todayRecommendation: "ซ้อมได้" },
      confidence: "high",
      unclearFields: [],
    },
  };
}

function makeRun(dateKey: string, id: string, distanceKm: number, durationMin = 40) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "workout",
    created_at: `${dateKey}T16:00:00.000Z`,
    data: {
      date: dateKey,
      extracted: {
        workoutKind: "outdoor_run",
        distanceKm,
        duration: `${String(Math.floor(durationMin / 60)).padStart(2, "0")}:${String(durationMin % 60).padStart(2, "0")}:00`,
      },
    },
  };
}

function makeMeal(dateKey: string, id: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "meal",
    created_at: `${dateKey}T12:00:00.000Z`,
    data: {
      mealType: "lunch",
      detectedFoods: [{ name: "ข้าวไก่ย่าง" }],
      nutrition: {
        caloriesKcal: 620,
        proteinG: 38,
        carbsG: 82,
        fatG: 18,
        fiberG: 4,
      },
      trainingFit: { coachNote: "มื้อนี้ช่วยเติมพลังได้ดี" },
    },
  };
}

// ─── Report defaults to Week mode ─────────────────────────────────────────────

test("Report page defaults to week mode", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-1"));

  await gotoApp(page, "/logs");

  await expect(page.getByTestId("calendar-nav")).toBeVisible();
  // Week mode active button is present (exact match to avoid matching aria-label variants)
  await expect(page.getByRole("button", { name: "สัปดาห์", exact: true })).toBeVisible();
  // 7 day slots rendered
  await expect(page.getByTestId("day-slot")).toHaveCount(7);
});

// ─── Week header shows Mon–Sun range ──────────────────────────────────────────

test("Week header shows a date range label", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-range"));

  await gotoApp(page, "/logs");

  const nav = page.getByTestId("calendar-nav");
  // Label contains a Thai month abbreviation — one of the 12 short month names
  await expect(nav).toContainText(/ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\./);
});

// ─── Week navigation prev/current/next ────────────────────────────────────────

test("Week navigation: going back and returning to current works", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-nav"));

  await gotoApp(page, "/logs");

  const nav = page.getByTestId("calendar-nav");

  // Going back one week shows "ปัจจุบัน" button
  await nav.getByRole("button", { name: "สัปดาห์ก่อน" }).click();
  await expect(page.getByTestId("nav-current-btn")).toBeVisible();

  // Clicking ปัจจุบัน goes back to current week — button disappears
  await page.getByTestId("nav-current-btn").click();
  await expect(page.getByTestId("nav-current-btn")).toHaveCount(0);
});

test("Calendar navigation uses subtle transition without loading copy", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-transition"));

  await gotoApp(page, "/logs");

  const nav = page.getByTestId("calendar-nav");
  const content = page.getByTestId("calendar-content");
  const previous = nav.getByRole("button", { name: "สัปดาห์ก่อน" });
  const initialLabel = (await nav.locator("div").filter({ hasText: /ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\./ }).last().textContent()) ?? "";

  await previous.click();
  await expect(page.getByText("กำลังเปลี่ยนช่วง...")).toHaveCount(0);
  await expect(page.getByTestId("calendar-transition-status")).toHaveCount(0);
  await expect(content).toHaveAttribute("aria-busy", "true");
  await expect(previous).toBeDisabled();
  await expect(page.getByTestId("nav-current-btn")).toBeVisible();
  await expect(nav.locator("div").filter({ hasText: /ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\./ }).last()).not.toHaveText(initialLabel);

  await expect(content).toHaveAttribute("aria-busy", "false");

  await page.getByTestId("nav-current-btn").click();
  await expect(page.getByText("กำลังเปลี่ยนช่วง...")).toHaveCount(0);
  await expect(page.getByTestId("nav-current-btn")).toHaveCount(0);
});

// ─── Daily logs show as DaySlot cards ─────────────────────────────────────────

test("Daily slots are collapsed by default (no full DayCard details)", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-slot"));
  state.history.push(makeRun(bangkokDateKey(), "run-rc-slot", 5));
  state.history.push(makeMeal(bangkokDateKey(), "meal-rc-slot"));

  await gotoApp(page, "/logs");

  // 7 DaySlot cards visible
  await expect(page.getByTestId("day-slot")).toHaveCount(7);
  // Today's slot shows run distance
  await expect(page.getByTestId("week-day-list").locator("summary").getByText(/5 กม\./)).toBeVisible();
  await expect(page.getByTestId("week-day-list").locator("summary").getByText(/อาหาร 1 มื้อ · โปรตีน 38g · คาร์บ 82g/)).toBeVisible();
  await expect(page.getByText("ข้าวไก่ย่าง")).not.toBeVisible();
  await expect(page.getByTestId("report-compact-item").first()).not.toBeVisible();

  const dataSlot = page.getByTestId("day-slot").filter({ hasText: /5 กม\./ }).first();
  await expect(dataSlot.getByText("รายละเอียด ˅")).toBeVisible();
  await expect(dataSlot.getByTestId("day-slot-details")).not.toBeVisible();
  await dataSlot.locator("summary").click();
  await expect(dataSlot.getByText("ซ่อนรายละเอียด ˄")).toBeVisible();
  await expect(dataSlot.getByTestId("day-slot-details")).toBeVisible();

  const emptySlot = page.getByTestId("day-slot").filter({ hasText: "ยังไม่มีข้อมูล" }).first();
  await expect(emptySlot.getByText("รายละเอียด ˅")).toHaveCount(0);
});

test("Rolling 7d insight and full history are collapsed by default", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-rolling"));
  state.history.push(makeRun(bangkokDateKey(), "run-rc-rolling", 5));

  await gotoApp(page, "/logs");

  await expect(page.getByTestId("rolling-insight")).toBeVisible();
  await expect(page.getByText("Insight 7 วันล่าสุด")).toBeVisible();
  await expect(page.getByText("แนวโน้ม Recovery 7 วัน")).not.toBeVisible();
  await expect(page.getByText("ตัวเลขสรุป 7 วันล่าสุด")).not.toBeVisible();
  await expect(page.getByTestId("full-history-details")).toBeVisible();
  await expect(page.getByTestId("report-compact-item").first()).not.toBeVisible();
  await expect(page.getByRole("button", { name: "ทั้งหมด" })).not.toBeVisible();

  await page.getByText("ดู insight เต็ม").click();
  await expect(page.getByText("แนวโน้ม Recovery 7 วัน")).toBeVisible();
  await expect(page.getByText("ตัวเลขสรุป 7 วันล่าสุด")).toBeVisible();

  await page.getByText("รายการทั้งหมด").click();
  await expect(page.getByRole("button", { name: "ทั้งหมด" })).toBeVisible();
  await expect(page.getByTestId("report-compact-item").first()).toBeVisible();
});

test("all-items section compact layout and lazy loading", async ({ page }) => {
  const state = await installMockBackend(page);
  // Inject 10 sleep logs
  for (let i = 0; i < 10; i++) {
    state.history.push(makeSleep(bangkokDateKey(), `sleep-lazy-${i}`));
  }

  await gotoApp(page, "/logs");

  // Verify full-history details summary has "เปิด"
  await expect(page.getByTestId("full-history-details").getByText("เปิด")).toBeVisible();

  // Open "รายการทั้งหมด"
  await page.getByText("รายการทั้งหมด").click();

  // Verify button changes to "ซ่อนรายการ"
  await expect(page.getByTestId("full-history-details").getByText("ซ่อนรายการ")).toBeVisible();

  // Initial visible compact items should be 7
  await expect(page.getByTestId("report-compact-item")).toHaveCount(7);

  // Verify "ดูเพิ่ม" is visible
  const loadMoreBtn = page.getByRole("button", { name: "ดูเพิ่ม" });
  await expect(loadMoreBtn).toBeVisible();

  // Click "ดูเพิ่ม"
  await loadMoreBtn.click();

  // Now all 10 compact items should be visible
  await expect(page.getByTestId("report-compact-item")).toHaveCount(10);
  await expect(loadMoreBtn).not.toBeVisible();

  // Expand one item
  const firstItem = page.getByTestId("report-compact-item").first();
  await expect(firstItem.getByTestId("compact-item-details")).not.toBeVisible();
  await firstItem.getByRole("button", { name: "ดู" }).click();
  await expect(firstItem.getByTestId("compact-item-details")).toBeVisible();
  
  // Collapse it
  await firstItem.getByRole("button", { name: "ย่อ" }).click();
  await expect(firstItem.getByTestId("compact-item-details")).not.toBeVisible();
});

// ─── Month mode shows monthly summary ─────────────────────────────────────────

test("Switching to month mode shows month week blocks", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-month"));

  await gotoApp(page, "/logs");

  // Switch to month mode
  await page.getByRole("button", { name: "เดือน", exact: true }).click();

  await expect(page.getByTestId("month-week-list")).toBeVisible();
  // At least one week block is rendered
  await expect(page.getByTestId("month-week-block").first()).toBeVisible();
  // Period metrics visible
  await expect(page.getByTestId("period-metrics")).toBeVisible();
  await expect(page.getByTestId("report-compact-item").first()).not.toBeVisible();
});

// ─── Month navigation ──────────────────────────────────────────────────────────

test("Month navigation: going back a month and returning to current", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-monnav"));

  await gotoApp(page, "/logs");

  // Switch to month
  await page.getByRole("button", { name: "เดือน", exact: true }).click();

  const nav = page.getByTestId("calendar-nav");

  // Go back one month
  await nav.getByRole("button", { name: "เดือนก่อน" }).click();
  await expect(page.getByTestId("nav-current-btn")).toBeVisible();

  // Return to current
  await page.getByTestId("nav-current-btn").click();
  await expect(page.getByTestId("nav-current-btn")).toHaveCount(0);
});

// ─── Tapping month week block switches to week mode ───────────────────────────

test("Tapping a month week block switches to week mode", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-tap"));

  await gotoApp(page, "/logs");

  await page.getByRole("button", { name: "เดือน", exact: true }).click();
  await expect(page.getByTestId("month-week-block").first()).toBeVisible();

  // Click first week block
  await page.getByTestId("month-week-block").first().click();

  // Should now be in week mode with 7 day slots
  await expect(page.getByTestId("day-slot")).toHaveCount(7);
  await expect(page.getByTestId("month-week-list")).toHaveCount(0);
});

// ─── No horizontal overflow ────────────────────────────────────────────────────

test("Report page has no horizontal overflow on mobile viewport", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-rc-overflow"));

  await page.setViewportSize({ width: 375, height: 812 });
  await gotoApp(page, "/logs");

  const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  expect(bodyWidth).toBeLessThanOrEqual(viewportWidth);
});
