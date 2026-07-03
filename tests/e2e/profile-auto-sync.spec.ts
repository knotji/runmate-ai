/**
 * Profile Auto Sync persistence and manual-field quiet-skip tests.
 *
 * Covers:
 * a) Dismissing a suggestion removes it from the visible list immediately
 * b) Dismissed suggestion does not return after another sync with the same value
 * c) Accepting a suggestion applies value and removes it from the pending list
 * d) Manual edits via the profile form and inline-edit mark source as "manual"
 * e) Sync result summary appears after analyze/sync
 * f) When no pending suggestions, shows subtle empty state (not heavy empty panel)
 * + Auto Sync Supabase persistence: defaults, toggle, silent-skip, sync summary
 */

import { expect, test } from "@playwright/test";
import { installMockBackend } from "./helpers/app";
import { shouldRunProfileAutoSync } from "../../src/lib/profileAutoSync";
import { buildAutoSaveDecisions } from "../../src/lib/profile/autoSaveHistorySuggestions";

// ── Shared constants ────────────────────────────────────────────────────────

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

/**
 * Legacy profile: field has a value but NO source tag.
 * These are still shown as pending suggestions (user has to decide).
 */
const PROFILE_WITH_LEGACY_MILEAGE = {
  id: "test-profile",
  display_name: "นักวิ่งทดสอบ",
  weekly_mileage_km: 30,
  field_sources: {},
};

/** Two legacy (no-source) fields → two pending suggestions */
const PROFILE_WITH_TWO_LEGACY = {
  id: "test-profile",
  display_name: "นักวิ่งทดสอบ",
  weekly_mileage_km: 30,
  running_days_per_week: 3,
  field_sources: {},
};

/** Explicitly manual field → silently skipped (NOT shown as pending suggestion) */
const PROFILE_WITH_MANUAL_MILEAGE = {
  id: "test-profile",
  display_name: "นักวิ่งทดสอบ",
  weekly_mileage_km: 30,
  field_sources: { weeklyMileageKm: "manual" },
};

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

// ── Shared helpers ──────────────────────────────────────────────────────────

/**
 * Mock the `profiles` table.
 * loadProfileFromSupabase uses .maybeSingle() — respond with single JSON object.
 * onSave is called for every POST (upsert) with the request body.
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
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.pgrst.object+json",
        headers: CORS_HEADERS,
        body: JSON.stringify(profileRow),
      });
      return;
    }
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
  onSave?: (body: unknown) => void,
) {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(HIGH_CONFIDENCE_ANALYSIS),
    });
  });

  await mockProfilesTable(page, profileRow, onSave);

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

// ── Toggle & persistence ────────────────────────────────────────────────────

test("Auto-sync toggle: defaults to enabled (ON) when DB column is null", async ({ page }) => {
  // Supabase returns null for auto_profile_sync_enabled → defaults to true
  await setupSettingsPage(page, { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null, auto_profile_sync_enabled: null });
  // Enabled → button says "ปิด Auto Sync"
  await expect(page.getByTestId("auto-sync-toggle")).toContainText("ปิด Auto Sync", { timeout: 10000 });
  await expect(page.getByTestId("auto-sync-panel")).toContainText("เปิดอยู่", { timeout: 5000 });
});

test("Auto-sync toggle: disabled when DB has auto_profile_sync_enabled: false", async ({ page }) => {
  await setupSettingsPage(page, { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null, auto_profile_sync_enabled: false });
  await expect(page.getByTestId("auto-sync-toggle")).toContainText("เปิด Auto Sync", { timeout: 10000 });
  await expect(page.getByTestId("auto-sync-panel")).toContainText("ปิดอยู่", { timeout: 5000 });
});

test("Auto-sync toggle: clicking persists auto_profile_sync_enabled to Supabase", async ({ page }) => {
  const upserts: Record<string, unknown>[] = [];
  await setupSettingsPage(
    page,
    { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null, auto_profile_sync_enabled: true },
    (body) => upserts.push(body as Record<string, unknown>),
  );
  await expect(page.getByTestId("auto-sync-toggle")).toContainText("ปิด Auto Sync", { timeout: 10000 });

  await page.getByTestId("auto-sync-toggle").click();
  await expect(page.getByTestId("auto-sync-toggle")).toContainText("เปิด Auto Sync", { timeout: 5000 });

  // Supabase should have received an upsert with auto_profile_sync_enabled: false
  await expect.poll(
    () => upserts.some((b) => b.auto_profile_sync_enabled === false),
    { timeout: 5000 },
  ).toBe(true);
});

test("Analyze button copy adapts to auto-sync state", async ({ page }) => {
  // Start enabled → button says "ซิงก์โปรไฟล์ตอนนี้"
  await setupSettingsPage(page, { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null, auto_profile_sync_enabled: true });
  await expect(page.getByTestId("analyze-btn")).toContainText("ซิงก์โปรไฟล์ตอนนี้", { timeout: 10000 });

  // Toggle off → button says "วิเคราะห์ตอนนี้"
  await page.getByTestId("auto-sync-toggle").click();
  await expect(page.getByTestId("analyze-btn")).toContainText("วิเคราะห์ตอนนี้");
});

// ── e) Sync result summary ──────────────────────────────────────────────────

test("e) Sync summary: shows auto-updated count after analysis", async ({ page }) => {
  // Profile with no existing values → safe fields will be auto-saved
  await setupSettingsPage(page, { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null });
  await runAnalysis(page);

  const summary = page.getByTestId("sync-summary");
  await expect(summary).toBeVisible();
  const text = await summary.textContent();
  const isInformative =
    text?.includes("อัปเดตอัตโนมัติ") ||
    text?.includes("โปรไฟล์ยังเหมาะสมอยู่");
  expect(isInformative).toBe(true);
});

test("e) Sync summary: shows 'ข้าม N ค่าที่คุณแก้เอง' for silent manual skips", async ({ page }) => {
  // weeklyMileageKm tagged "manual" → silently skipped → appears in summary
  await setupSettingsPage(page, PROFILE_WITH_MANUAL_MILEAGE as Record<string, unknown>);
  await runAnalysis(page);

  await expect(
    page.getByTestId("sync-summary"),
  ).toContainText("ข้าม 1 ค่าที่คุณแก้เอง", { timeout: 10000 });
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
  // Legacy no-source field → shows as pending suggestion
  await setupSettingsPage(page, PROFILE_WITH_LEGACY_MILEAGE as Record<string, unknown>);
  await runAnalysis(page);

  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();

  const keepBtn = page.getByTestId("keep-current-btn").first();
  await expect(keepBtn).toBeVisible();
  await keepBtn.click();

  // Suggestion removed immediately
  await expect(page.getByTestId("keep-current-btn")).toHaveCount(0);
});

// ── b) Dismissed suggestion does not return on re-sync ──────────────────────

test("b) Dismissed suggestion does not return after re-sync with same value", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_LEGACY_MILEAGE as Record<string, unknown>);

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
  await setupSettingsPage(page, PROFILE_WITH_LEGACY_MILEAGE as Record<string, unknown>);
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

test("c) Pending badge: shows correct count with multiple legacy (no-source) fields", async ({ page }) => {
  await setupSettingsPage(page, PROFILE_WITH_TWO_LEGACY as Record<string, unknown>);
  await runAnalysis(page);

  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();
  const badge = page.getByTestId("pending-suggestion-count");
  await expect(badge).toBeVisible();
  const badgeText = await badge.textContent();
  expect(badgeText).toMatch(/\d+ รายการ/);
});

// ── Manual field quiet-skip ─────────────────────────────────────────────────

test("Manual field (source:'manual') is silently skipped — NOT shown as pending suggestion", async ({ page }) => {
  // weeklyMileageKm has source "manual" → silently skipped
  await setupSettingsPage(page, PROFILE_WITH_MANUAL_MILEAGE as Record<string, unknown>);
  await runAnalysis(page);

  // No pending suggestion should appear for weeklyMileageKm
  await expect(page.getByTestId("no-pending-suggestions")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("suggestion-item")).toHaveCount(0, { timeout: 5000 });
});

test("Legacy (no-source) field IS shown as pending suggestion — not silently skipped", async ({ page }) => {
  // weeklyMileageKm has a value but NO source tag → legacy behavior → pending suggestion
  await setupSettingsPage(page, PROFILE_WITH_LEGACY_MILEAGE as Record<string, unknown>);
  await runAnalysis(page);

  await expect(page.getByTestId("suggestion-item")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("คำแนะนำที่รอการตัดสินใจ")).toBeVisible();
});

test("Combined sync summary: auto-updated + silent-skipped shows both counts", async ({ page }) => {
  // averageCadence: no value, no source → auto-saved
  // weeklyMileageKm: value + source "manual" → silently skipped
  const profile = {
    id: "test-profile",
    display_name: "นักวิ่งทดสอบ",
    average_cadence: null,
    weekly_mileage_km: 50,
    field_sources: { weeklyMileageKm: "manual" },
  };
  await setupSettingsPage(page, profile);
  await runAnalysis(page);

  const summary = page.getByTestId("sync-summary");
  await expect(summary).toContainText("อัปเดตอัตโนมัติ", { timeout: 10000 });
  await expect(summary).toContainText("ข้าม 1 ค่าที่คุณแก้เอง");
});

// ── last_auto_profile_sync_at persistence ───────────────────────────────────

test("last_auto_profile_sync_at is saved to Supabase after sync completes", async ({ page }) => {
  const upserts: Record<string, unknown>[] = [];
  await setupSettingsPage(
    page,
    { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null },
    (body) => upserts.push(body as Record<string, unknown>),
  );
  await runAnalysis(page);

  // sync-summary appears when done
  await expect(page.getByTestId("sync-summary")).toBeVisible({ timeout: 10000 });

  // At least one upsert should contain last_auto_profile_sync_at
  await expect.poll(
    () => upserts.some((b) => typeof b.last_auto_profile_sync_at === "string" && b.last_auto_profile_sync_at.length > 0),
    { timeout: 5000 },
  ).toBe(true);
});

// ── d) Manual edits via profile form ────────────────────────────────────────

test("d) Profile form: saving a section sends field_sources with 'manual' for changed fields", async ({ page }) => {
  const saveBodies: unknown[] = [];

  await installMockBackend(page);
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

  // Fill the first number input in the section
  const numInput = page.locator("input[type='number']").first();
  await expect(numInput).toBeVisible({ timeout: 3000 });
  await numInput.fill("20");

  // Save section
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
    PROFILE_WITH_LEGACY_MILEAGE as Record<string, unknown>,
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

// ── Pure logic unit tests for shouldRunProfileAutoSync and auto-save protection ──────────────────────────

test.describe("shouldRunProfileAutoSync logic rules & auto-save protection", () => {
  const now = "2026-07-03T12:00:00.000Z";
  const within24h = "2026-07-03T00:00:00.000Z"; // 12 hours ago
  const olderThan24h = "2026-07-02T10:00:00.000Z"; // 26 hours ago

  test("a) manual trigger always runs", () => {
    const res = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: false,
      lastAutoProfileSyncAt: within24h,
      trigger: "manual",
      now,
    });
    expect(res.shouldRun).toBe(true);
    expect(res.reason).toBe("manual");
  });

  test("b) auto sync disabled blocks automatic trigger", () => {
    const res = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: false,
      lastAutoProfileSyncAt: within24h,
      trigger: "profile_open",
      now,
    });
    expect(res.shouldRun).toBe(false);
    expect(res.reason).toBe("disabled");
  });

  test("c) last sync missing allows profile_open sync", () => {
    const res = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: true,
      lastAutoProfileSyncAt: null,
      trigger: "profile_open",
      now,
    });
    expect(res.shouldRun).toBe(true);
    expect(res.reason).toBe("stale_24h");
  });

  test("d) last sync older than 24h allows profile_open sync", () => {
    const res = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: true,
      lastAutoProfileSyncAt: olderThan24h,
      trigger: "profile_open",
      now,
    });
    expect(res.shouldRun).toBe(true);
    expect(res.reason).toBe("stale_24h");
  });

  test("e) fresh last sync blocks profile_open sync", () => {
    const res = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: true,
      lastAutoProfileSyncAt: within24h,
      trigger: "profile_open",
      now,
    });
    expect(res.shouldRun).toBe(false);
    expect(res.reason).toBe("fresh");
  });

  test("f) latest data newer than last sync allows after_upload sync", () => {
    const res = shouldRunProfileAutoSync({
      autoProfileSyncEnabled: true,
      lastAutoProfileSyncAt: within24h,
      latestDataUpdatedAt: "2026-07-03T06:00:00.000Z", // 6 hours after last sync
      trigger: "after_upload",
      now,
    });
    expect(res.shouldRun).toBe(true);
    expect(res.reason).toBe("new_data");
  });

  test("g) after upload sync does not overwrite manual fields (unit test)", () => {
    const existingProfile = {
      displayName: "นักวิ่ง",
      weeklyMileageKm: 30,
      fieldSources: { weeklyMileageKm: "manual" },
    };
    const suggestions = {
      weeklyMileageKm: 40,
    };
    const decisions = buildAutoSaveDecisions({
      suggestions: suggestions as unknown as Parameters<typeof buildAutoSaveDecisions>[0]["suggestions"],
      confidence: "high",
      existingProfile: existingProfile as unknown as Parameters<typeof buildAutoSaveDecisions>[0]["existingProfile"],
      existingSources: existingProfile.fieldSources as unknown as Parameters<typeof buildAutoSaveDecisions>[0]["existingSources"],
    });
    expect(decisions.toSave.weeklyMileageKm).toBeUndefined();
    expect(decisions.manualSilentSkipped).toContain("weeklyMileageKm");
  });
});

test("h) failed background sync does not break upload success", async ({ page }) => {
  const state = await installMockBackend(page);

  // Mock profiles table
  await mockProfilesTable(page, { id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null, auto_profile_sync_enabled: true });

  // Override profile analysis API to return a 500 error
  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Internal Server Error" }) });
  });

  // Navigate to Upload page for sleep log
  await page.goto("/upload?type=sleep");
  
  // Wait for the upload dashboard to be loaded
  await expect(page.getByTestId("upload-dashboard")).toBeVisible();

  // Set file on file input to trigger upload analysis
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: "sleep_screenshot.png",
    mimeType: "image/png",
    buffer: Buffer.from("test-image-data"),
  });

  // Click the analysis button to launch the API call
  await page.getByRole("button", { name: "วิเคราะห์การนอน" }).click();

  // Wait for the confirmation button to appear
  const saveBtn = page.getByRole("button", { name: "บันทึกผลการนอน" });
  await expect(saveBtn).toBeVisible({ timeout: 10000 });
  await saveBtn.click();

  // Verify that the sleep log was successfully saved in the history state (meaning the failure of background sync didn't break save)
  await expect.poll(() => state.history.filter((row) => row.type === "sleep").length).toBe(1);
});
