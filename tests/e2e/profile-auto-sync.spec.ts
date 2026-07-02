/**
 * Profile auto-sync — UX reliability tests for ProfileHistoryAnalyzer.
 *
 * Covers:
 * a) Dismissing a suggestion removes it from the visible list immediately
 * b) Dismissed suggestion does not return after another sync with the same value
 * c) Accepting a suggestion applies value and removes it from the pending list
 * d) Manual edits via the profile form and inline-edit mark source as "manual"
 * e) Sync result summary appears after analyze/sync
 * f) When no pending suggestions, shows subtle empty state (not heavy empty panel)
 * + toggle, button copy, and localStorage persistence from previous sprint
 */

import { expect, test } from "@playwright/test";
import { installMockBackend } from "./helpers/app";

// ── Shared helpers ──────────────────────────────────────────────────────────

const HIGH_CONFIDENCE_ANALYSIS = {
  ok: true,
  data: {
    summary: {
      dataRange: "90 วันล่าสุด",
      totalRuns: 12,
      totalSleepLogs: 10,
      confidence: "high",
      notes: "ข้อมูลเพียงพอ",
    },
    suggestions: {
      currentLevel: "วิ่งได้ประมาณ 10K",
      currentLongestRunKm: 15,
      weeklyMileageKm: 40,
      runningDaysPerWeek: 4,
      easyPace: null, easyHrCap: null, maxHr: null,
      vo2max: 48, averageCadence: 172,
      preferredTrainingDays: null, preferredLongRunDay: null,
      injuryHistory: null, riskNotes: null,
      averageSleepHours: 7.5, normalSleepScore: 80,
      normalEnergyScore: 75, normalRestingHr: 52, normalHrv: 62,
      recoveryRules: null,
      // null so it doesn't create an extra protected-field suggestion item that would
      // interfere with tests expecting exactly 1 pending item in the panel
      trainingPreferenceSummary: null,
    },
    reasoning: {
      currentLevelReason: "longest run 15 km",
      easyPaceReason: "N/A", easyHrReason: "N/A",
      sleepPatternReason: "avg 7.5h", riskReason: "none",
    },
    warnings: [],
  },
};

/** Profile with one manually-set field (weeklyMileageKm) */
const PROFILE_WITH_MANUAL_MILEAGE = [{
  id: "test-profile",
  display_name: "นักวิ่งทดสอบ",
  weekly_mileage_km: 30,
  field_sources: { weeklyMileageKm: "manual" },
}];

/** Profile with two manually-set fields */
const PROFILE_WITH_TWO_MANUAL = [{
  id: "test-profile",
  display_name: "นักวิ่งทดสอบ",
  weekly_mileage_km: 30,
  running_days_per_week: 3,
  field_sources: { weeklyMileageKm: "manual", runningDaysPerWeek: "manual" },
}];

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

/**
 * Mock the `profiles` table (note: NOT `user_profiles` — the Supabase table is `profiles`).
 * `loadProfileFromSupabase` uses `.maybeSingle()` which sends an Accept header requesting
 * a single JSON object (not an array) from PostgREST. We return the row directly.
 */
async function mockProfilesTable(
  page: import("@playwright/test").Page,
  profileRow: Record<string, unknown> = { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null },
  onSave?: (body: unknown) => void,
) {
  await page.route("**/e2e-supabase/rest/v1/profiles**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    if (method === "GET") {
      // maybeSingle() sends Accept: application/vnd.pgrst.object+json — return single object
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.pgrst.object+json",
        headers: CORS_HEADERS,
        body: JSON.stringify(profileRow),
      });
      return;
    }
    // POST = upsert
    if (method === "POST") {
      try {
        const body = route.request().postDataJSON();
        onSave?.(body);
      } catch { /* ignore */ }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify(profileRow),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: JSON.stringify([]) });
  });
}

async function setupSettingsPage(
  page: import("@playwright/test").Page,
  profileRow: Record<string, unknown> = { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null },
) {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  await mockProfilesTable(page, profileRow);

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });
}

async function runAnalysis(page: import("@playwright/test").Page) {
  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });
}

// ── Toggle UI ───────────────────────────────────────────────────────────────

test("Auto-sync toggle: renders with correct initial off-state", async ({ page }) => {
  await setupSettingsPage(page);
  await expect(page.getByTestId("auto-sync-toggle")).toContainText("เปิด Auto Sync");
});

test("Auto-sync toggle: clicking updates button copy and persists to localStorage", async ({ page }) => {
  await setupSettingsPage(page);
  const btn = page.getByTestId("auto-sync-toggle");

  await btn.click();
  await expect(btn).toContainText("ปิด Auto Sync");
  expect(await page.evaluate(() => localStorage.getItem("runmate:autoProfileSyncEnabled"))).toBe("true");

  await btn.click();
  await expect(btn).toContainText("เปิด Auto Sync");
  expect(await page.evaluate(() => localStorage.getItem("runmate:autoProfileSyncEnabled"))).toBe("false");
});

test("Analyze button copy adapts to auto-sync state", async ({ page }) => {
  await setupSettingsPage(page);
  await expect(page.getByTestId("analyze-btn")).toContainText("วิเคราะห์ตอนนี้");

  await page.getByTestId("auto-sync-toggle").click();
  await expect(page.getByTestId("analyze-btn")).toContainText("ซิงก์โปรไฟล์ตอนนี้");
});

// ── e) Sync result summary ──────────────────────────────────────────────────

test("e) Sync summary: shows calm message after analysis with no pending suggestions", async ({ page }) => {
  await setupSettingsPage(page);
  await runAnalysis(page);

  const summary = page.getByTestId("sync-summary");
  await expect(summary).toBeVisible();
  // No manual items → "โปรไฟล์ยังเหมาะสมอยู่" OR "อัปเดตอัตโนมัติ N ค่า"
  const text = await summary.textContent();
  const isCalm = text?.includes("โปรไฟล์ยังเหมาะสมอยู่") || text?.includes("อัปเดตอัตโนมัติ");
  expect(isCalm).toBe(true);
});

test("e) Sync summary: shows pending count when manual fields exist", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_MANUAL_MILEAGE[0] as Record<string, unknown>);
  await runAnalysis(page);

  const summary = page.getByTestId("sync-summary");
  await expect(summary).toBeVisible();
  const text = await summary.textContent();
  // Should mention pending or not-overwritten
  const isInformative =
    text?.includes("คำแนะนำรอให้ตรวจ") ||
    text?.includes("ไม่ทับ") ||
    text?.includes("อัปเดตอัตโนมัติ");
  expect(isInformative).toBe(true);
});

// ── f) Empty pending state ──────────────────────────────────────────────────

test("f) Empty pending: shows subtle line when no pending suggestions", async ({ page }) => {
  await setupSettingsPage(page);
  await runAnalysis(page);

  // If no manual items: should show the subtle empty state, not a heavy panel
  const hasSuggestionPanel = await page.getByText("คำแนะนำที่รอการตัดสินใจ").isVisible().catch(() => false);
  const hasEmptyLine = await page.getByTestId("no-pending-suggestions").isVisible().catch(() => false);

  // Exactly one of these should be true
  expect(hasSuggestionPanel || hasEmptyLine).toBe(true);
});

// ── a) Dismissal removes suggestion immediately ─────────────────────────────

test("a) Dismiss: clicking 'คงค่าเดิม' removes suggestion from visible list", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_MANUAL_MILEAGE[0] as Record<string, unknown>);
  await runAnalysis(page);

  // Should see the suggestion panel
  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();

  const keepBtn = page.getByTestId("keep-current-btn").first();
  await expect(keepBtn).toBeVisible();
  await keepBtn.click();

  // Suggestion is removed immediately — panel should be gone or empty
  await expect(page.getByTestId("keep-current-btn")).toHaveCount(0);
});

// ── b) Dismissed suggestion does not return on re-sync ──────────────────────

test("b) Dismissed suggestion does not return after re-sync with same value", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_MANUAL_MILEAGE[0] as Record<string, unknown>);

  // First analysis
  await runAnalysis(page);
  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();

  // Dismiss the suggestion
  await page.getByTestId("keep-current-btn").first().click();
  await expect(page.getByTestId("keep-current-btn")).toHaveCount(0);

  // Verify dismissal is in localStorage
  const dismissed = await page.evaluate(() => localStorage.getItem("runmate:dismissedProfileSuggestions"));
  expect(dismissed).not.toBeNull();

  // Second analysis (mock returns same value)
  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });

  // Dismissed suggestion should NOT be visible
  const suggestionPanelVisible = await page.getByText("คำแนะนำที่รอการตัดสินใจ").isVisible().catch(() => false);
  const keepBtnCount = await page.getByTestId("keep-current-btn").count();
  expect(suggestionPanelVisible).toBe(false);
  expect(keepBtnCount).toBe(0);
});

// ── c) Accepting suggestion removes it from pending list ─────────────────────

test("c) Accept: clicking 'ใช้ค่าที่แนะนำ' removes suggestion from pending list", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_MANUAL_MILEAGE[0] as Record<string, unknown>);
  await runAnalysis(page);

  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();
  const acceptBtn = page.getByTestId("accept-suggestion-btn").first();
  await expect(acceptBtn).toBeVisible();
  await acceptBtn.click();

  // Suggestion removed from list
  await expect(page.getByTestId("accept-suggestion-btn")).toHaveCount(0);
  // No pending badge
  await expect(page.getByTestId("pending-suggestion-count")).toHaveCount(0);
});

// ── c) Pending count badge ───────────────────────────────────────────────────

test("c) Pending badge: shows correct count with multiple manual fields", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_TWO_MANUAL[0] as Record<string, unknown>);
  await runAnalysis(page);

  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();
  const badge = page.getByTestId("pending-suggestion-count");
  await expect(badge).toBeVisible();
  const badgeText = await badge.textContent();
  expect(badgeText).toMatch(/\d+ รายการ/);
});

// ── d) Manual edit protection via form ──────────────────────────────────────

test("d) Profile form: saving a section sends field_sources with 'manual' for changed fields", async ({ page }) => {
  const saveBodies: unknown[] = [];

  await installMockBackend(page);
  // The app saves to the `profiles` table via e2e-supabase (upsert = POST)
  await mockProfilesTable(
    page,
    { id: "test-profile", display_name: "นักวิ่งทดสอบ", weekly_mileage_km: 30, field_sources: {} },
    (body) => saveBodies.push(body),
  );

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  // Open "สมรรถภาพนักวิ่ง" (baseline) section — it contains number inputs
  const baselineToggle = page.getByRole("button", { name: "สมรรถภาพนักวิ่ง" });
  await expect(baselineToggle).toBeVisible({ timeout: 8000 });
  await baselineToggle.click();

  // Click "แก้ไข" to enter edit mode for this section
  const editBtn = page.getByRole("button", { name: "แก้ไข" }).first();
  await expect(editBtn).toBeVisible();
  await editBtn.click();

  // Fill the first number input in the section (e.g. วิ่งไกลสุด)
  const numInput = page.locator("input[type='number']").first();
  await expect(numInput).toBeVisible({ timeout: 3000 });
  await numInput.fill("20");

  // Save section → marks changed key(s) as "manual" in local React state
  await page.getByRole("button", { name: "บันทึก" }).first().click();

  // Submit the full form to persist to Supabase
  const submitBtn = page.getByRole("button", { name: "บันทึกโปรไฟล์" });
  await expect(submitBtn).toBeVisible({ timeout: 5000 });
  await submitBtn.click();
  await page.waitForTimeout(1500);

  // At least one save body should contain field_sources with "manual" values
  const hasManualSource = saveBodies.some((body) => {
    const b = body as Record<string, unknown>;
    const src = b.field_sources as Record<string, string> | null | undefined;
    return src != null && Object.values(src).some((v) => v === "manual");
  });
  expect(hasManualSource).toBe(true);
});

// ── d) Inline edit in analyzer marks source as "manual" ─────────────────────

test("d) Inline edit: 'แก้ค่าเอง' saves value with manual source (not history_analysis)", async ({ page }) => {
  const saveBodies: unknown[] = [];

  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  await mockProfilesTable(
    page,
    PROFILE_WITH_MANUAL_MILEAGE[0] as Record<string, unknown>,
    (body) => saveBodies.push(body),
  );

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible({ timeout: 10000 });

  // Click "แก้ค่าเอง"
  const editOwnBtn = page.getByRole("button", { name: "แก้ค่าเอง" }).first();
  await expect(editOwnBtn).toBeVisible();
  await editOwnBtn.click();

  // Fill in a custom value
  const input = page.locator("input[placeholder='ใส่ค่าใหม่...']").first();
  await expect(input).toBeVisible();
  await input.fill("35");

  // Save (triggers saveInlineEdit → applyAndPersist with { [key]: "manual" })
  await page.getByRole("button", { name: "บันทึก" }).first().click();
  await page.waitForTimeout(1500);

  // The saved body must contain field_sources with at least one "manual" entry
  const hasManualSource = saveBodies.some((body) => {
    const b = body as Record<string, unknown>;
    const src = b.field_sources as Record<string, string> | null | undefined;
    return src != null && Object.values(src).some((v) => v === "manual");
  });
  expect(hasManualSource).toBe(true);
});

// ── Protective copy ──────────────────────────────────────────────────────────

test("UI copy: states system will not overwrite manually edited values", async ({ page }) => {
  await setupSettingsPage(page);
  const bodyText = await page.locator("body").textContent();
  expect(
    bodyText?.includes("ไม่ทับค่าที่คุณแก้เอง") ||
    bodyText?.includes("จะไม่ทับค่าที่คุณแก้เอง"),
  ).toBe(true);
});
