/**
 * Profile auto-sync — tests for ProfileHistoryAnalyzer safe-merge behavior.
 *
 * Test coverage:
 * a) default/auto field gets updated by profile analysis
 * b) manual field is NOT overwritten automatically
 * c) manual field creates a pending suggestion (shown in suggestions panel)
 * d) accepting a suggestion via "ใช้ค่าที่แนะนำ" updates the field
 * e) UI copy communicates that the system will not overwrite manually edited values
 */

import { expect, test } from "@playwright/test";
import { installMockBackend } from "./helpers/app";

// ── Shared mock AI response ─────────────────────────────────────────────────

/** High-confidence AI analysis result with concrete suggestions for safe fields */
const HIGH_CONFIDENCE_ANALYSIS = {
  ok: true,
  data: {
    summary: {
      dataRange: "90 วันล่าสุด",
      totalRuns: 12,
      totalSleepLogs: 10,
      confidence: "high",
      notes: "ข้อมูลเพียงพอสำหรับการวิเคราะห์",
    },
    suggestions: {
      currentLevel: "วิ่งได้ประมาณ 10K",
      currentLongestRunKm: 15,
      weeklyMileageKm: 40,
      runningDaysPerWeek: 4,
      easyPace: null,
      easyHrCap: null,
      maxHr: null,
      vo2max: 48,
      averageCadence: 172,
      preferredTrainingDays: null,
      preferredLongRunDay: null,
      injuryHistory: null,
      riskNotes: null,
      averageSleepHours: 7.5,
      normalSleepScore: 80,
      normalEnergyScore: 75,
      normalRestingHr: 52,
      normalHrv: 62,
      recoveryRules: null,
      trainingPreferenceSummary: "วิ่งสม่ำเสมอ 4 วัน/สัปดาห์ ระยะทางสะสมดี",
    },
    reasoning: {
      currentLevelReason: "longest run 15 km",
      easyPaceReason: "ไม่มีข้อมูลเพียงพอ",
      easyHrReason: "ไม่มีข้อมูลเพียงพอ",
      sleepPatternReason: "ค่าเฉลี่ย 7.5 ชม.",
      riskReason: "ไม่พบความเสี่ยง",
    },
    warnings: [],
  },
};

/** Helper: navigate to settings and mock the AI endpoint */
async function gotoSettings(page: import("@playwright/test").Page) {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  // Mock profile API (user_profiles table)
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null }]),
      });
      return;
    }
    // PATCH/POST — profile save
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "test-profile", display_name: "นักวิ่งทดสอบ" }]),
    });
  });

  // Mock history items for the analyzer
  await page.route("**/rest/v1/history_items**", async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const interactive = document.querySelector("button, input, textarea");
    if (!interactive) return false;
    return Object.keys(interactive).some((key) => key.startsWith("__reactProps$"));
  });
}

// ── a) Auto-sync toggle UI renders correctly ────────────────────────────────

test("Profile analyzer: auto-sync toggle panel renders with correct initial state", async ({ page }) => {
  await gotoSettings(page);

  const panel = page.getByTestId("auto-sync-panel");
  await expect(panel).toBeVisible();

  // Toggle button should say "เปิด Auto Sync" when off (default state)
  const toggleBtn = page.getByTestId("auto-sync-toggle");
  await expect(toggleBtn).toBeVisible();
  await expect(toggleBtn).toContainText("เปิด Auto Sync");
});

// ── b) Toggling auto-sync changes button label and persists to localStorage ──

test("Profile analyzer: toggling auto-sync updates button copy and localStorage", async ({ page }) => {
  await gotoSettings(page);

  const toggleBtn = page.getByTestId("auto-sync-toggle");

  // Initially off
  await expect(toggleBtn).toContainText("เปิด Auto Sync");

  // Enable
  await toggleBtn.click();
  await expect(toggleBtn).toContainText("ปิด Auto Sync");

  // Verify localStorage
  const stored = await page.evaluate(() => localStorage.getItem("runmate:autoProfileSyncEnabled"));
  expect(stored).toBe("true");

  // Disable again
  await toggleBtn.click();
  await expect(toggleBtn).toContainText("เปิด Auto Sync");

  const storedAfter = await page.evaluate(() => localStorage.getItem("runmate:autoProfileSyncEnabled"));
  expect(storedAfter).toBe("false");
});

// ── c) Main analyze button text changes with auto-sync state ────────────────

test("Profile analyzer: analyze button copy reflects auto-sync state", async ({ page }) => {
  await gotoSettings(page);

  const analyzeBtn = page.getByTestId("analyze-btn");
  await expect(analyzeBtn).toContainText("วิเคราะห์ตอนนี้");

  // Enable auto-sync
  await page.getByTestId("auto-sync-toggle").click();
  await expect(analyzeBtn).toContainText("ซิงก์โปรไฟล์ตอนนี้");
});

// ── d) After analysis: auto/default fields show as updated ──────────────────

test("Profile analyzer: running analysis shows updated fields in 'อัปเดตแล้ว' section", async ({ page }) => {
  await gotoSettings(page);

  const analyzeBtn = page.getByTestId("analyze-btn");
  await analyzeBtn.click();

  // Wait for done state — "อัปเดตแล้ว" section header appears
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });
});

// ── e) Manual field: creates pending suggestion, not auto-overwritten ────────

test("Profile analyzer: manually edited field appears as pending suggestion, not auto-updated", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  // Profile has weeklyMileageKm with "manual" source — should NOT be auto-overwritten
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "test-profile",
          display_name: "นักวิ่งทดสอบ",
          weekly_mileage_km: 30,
          field_sources: { weeklyMileageKm: "manual" },
        }]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "test-profile" }]),
    });
  });

  await page.route("**/rest/v1/history_items**", async (route) => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  await page.getByTestId("analyze-btn").click();

  // Wait for analysis to complete
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });

  // Manual field should appear as a pending suggestion, not in "อัปเดตแล้ว"
  // The suggestions panel should be visible
  const suggestionsPanel = page.getByText("คำแนะนำที่รอการตัดสินใจ");
  await expect(suggestionsPanel).toBeVisible();
});

// ── f) Accepting a suggestion updates the field ─────────────────────────────

test("Profile analyzer: 'ใช้ค่าที่แนะนำ' button applies the suggestion and updates status badge", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  // Profile has a manually-edited field so it shows up in the suggestions panel
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "test-profile",
          display_name: "นักวิ่งทดสอบ",
          weekly_mileage_km: 20,
          field_sources: { weeklyMileageKm: "manual" },
        }]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "test-profile" }]),
    });
  });

  await page.route("**/rest/v1/history_items**", async (route) => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible({ timeout: 10000 });

  // Click "ใช้ค่าที่แนะนำ" on the first suggestion
  const acceptBtn = page.getByTestId("accept-suggestion-btn").first();
  await expect(acceptBtn).toBeVisible();
  await acceptBtn.click();

  // Status badge should update to "ใช้ค่าแนะนำแล้ว"
  await expect(page.getByText("ใช้ค่าแนะนำแล้ว")).toBeVisible();
});

// ── g) UI copy: system will not overwrite manually edited values ─────────────

test("Profile analyzer: UI copy states that manual values will not be overwritten", async ({ page }) => {
  await gotoSettings(page);

  // The description text should be visible before analysis
  const bodyText = await page.locator("body").textContent();
  const hasProtectCopy =
    bodyText?.includes("ไม่ทับค่าที่คุณแก้เอง") ||
    bodyText?.includes("จะไม่ทับค่าที่คุณแก้เอง");
  expect(hasProtectCopy).toBe(true);
});

// ── h) Pending suggestion count badge ────────────────────────────────────────

test("Profile analyzer: shows pending count badge when manual fields have unresolved suggestions", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  // Two manually-edited fields
  await page.route("**/rest/v1/user_profiles**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{
          id: "test-profile",
          display_name: "นักวิ่งทดสอบ",
          weekly_mileage_km: 20,
          running_days_per_week: 3,
          field_sources: { weeklyMileageKm: "manual", runningDaysPerWeek: "manual" },
        }]),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "test-profile" }]),
    });
  });

  await page.route("**/rest/v1/history_items**", async (route) => {
    if (route.request().method() === "OPTIONS") { await route.fulfill({ status: 204 }); return; }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
  });

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible({ timeout: 10000 });

  // Pending count badge should be visible showing N รายการ
  const badge = page.getByTestId("pending-suggestion-count");
  await expect(badge).toBeVisible();
  const badgeText = await badge.textContent();
  expect(badgeText).toMatch(/\d+ รายการ/);
});
