/**
 * Profile upsert sanitizer — verifies that integer DB columns never receive
 * decimal values like "4.5" that would cause Postgres error 22P02.
 *
 * Root cause: AI profile analysis can suggest runningDaysPerWeek: 4.5 (e.g.,
 * when the user runs 4–5 days/week and the median is 4.5). profileToRow was
 * passing this directly through cleanNumber(), which sent 4.5 to the
 * `running_days_per_week integer` column → Supabase rejected it with 22P02.
 *
 * Fix: integer DB columns now use cleanInt() (rounds) or cleanIntClamped().
 * normal_hrv uses cleanNumber() because it was migrated to numeric (migration 012).
 */

import { expect, test } from "@playwright/test";
import { installMockBackend } from "./helpers/app";

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

/** Analysis whose suggestions contain decimal values for integer DB columns. */
const DECIMAL_SUGGESTIONS_ANALYSIS = {
  ok: true,
  data: {
    summary: {
      dataRange: "90 วันล่าสุด",
      totalRuns: 14,
      totalSleepLogs: 12,
      confidence: "high",
      notes: "ข้อมูลเพียงพอ",
    },
    suggestions: {
      currentLevel: "วิ่งได้ประมาณ 10K",
      currentLongestRunKm: 15.5,
      weeklyMileageKm: 42.3,
      runningDaysPerWeek: 4.5,       // integer column — must be rounded to 5
      easyPace: null,
      easyHrCap: null,
      maxHr: null,
      vo2max: 48.2,                  // numeric column — decimals allowed
      averageCadence: 171.7,         // integer column — must be rounded to 172
      preferredTrainingDays: null,
      preferredLongRunDay: null,
      injuryHistory: null,
      riskNotes: null,
      averageSleepHours: 7.3,        // numeric column — decimals allowed
      normalSleepScore: 79.5,        // integer column — must be rounded to 80
      normalEnergyScore: 74.8,       // integer column — must be rounded to 75
      normalRestingHr: 51.5,         // integer column — must be rounded to 52
      normalHrv: 45.7,               // numeric column (migration 012) — decimals allowed
      recoveryRules: null,
      trainingPreferenceSummary: null,
    },
    reasoning: {
      currentLevelReason: "longest run 15.5 km",
      easyPaceReason: "N/A",
      easyHrReason: "N/A",
      sleepPatternReason: "avg 7.3h",
      riskReason: "none",
    },
    warnings: [],
  },
};

async function setupWithDecimalSuggestions(page: import("@playwright/test").Page) {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(DECIMAL_SUGGESTIONS_ANALYSIS),
    });
  });

  let capturedUpsertBody: Record<string, unknown> | null = null;
  let upsertCount = 0;

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
        body: JSON.stringify({ id: "test-profile", display_name: "นักวิ่งทดสอบ", field_sources: null }),
      });
      return;
    }
    if (method === "POST") {
      try {
        capturedUpsertBody = route.request().postDataJSON() as Record<string, unknown>;
        upsertCount++;
      } catch { /* ignore */ }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: CORS_HEADERS,
        body: JSON.stringify({ id: "test-profile" }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: "[]" });
  });

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  return {
    getUpsertBody: () => capturedUpsertBody,
    getUpsertCount: () => upsertCount,
  };
}

test("profile upsert: integer columns receive whole numbers when analysis suggests decimals", async ({ page }) => {
  const { getUpsertBody } = await setupWithDecimalSuggestions(page);

  // Enable auto-sync and trigger analysis
  await page.getByTestId("auto-sync-toggle").click();
  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });

  // Give save a moment to complete
  await page.waitForTimeout(500);

  const payload = getUpsertBody();
  expect(payload).not.toBeNull();

  // Integer columns must be whole numbers (no decimals)
  if (payload!.running_days_per_week != null) {
    expect(Number.isInteger(payload!.running_days_per_week)).toBe(true);
    expect(payload!.running_days_per_week).toBe(5); // 4.5 → rounds to 5
  }
  if (payload!.average_cadence != null) {
    expect(Number.isInteger(payload!.average_cadence)).toBe(true);
    expect(payload!.average_cadence).toBe(172); // 171.7 → rounds to 172
  }
  if (payload!.normal_sleep_score != null) {
    expect(Number.isInteger(payload!.normal_sleep_score)).toBe(true);
    expect(payload!.normal_sleep_score).toBe(80); // 79.5 → rounds to 80
  }
  if (payload!.normal_energy_score != null) {
    expect(Number.isInteger(payload!.normal_energy_score)).toBe(true);
    expect(payload!.normal_energy_score).toBe(75); // 74.8 → rounds to 75
  }
  if (payload!.normal_resting_hr != null) {
    expect(Number.isInteger(payload!.normal_resting_hr)).toBe(true);
    expect(payload!.normal_resting_hr).toBe(52); // 51.5 → rounds to 52
  }

  // Numeric columns may retain decimals
  if (payload!.vo2max != null) {
    expect(payload!.vo2max).toBe(48.2);
  }
  if (payload!.average_sleep_hours != null) {
    expect(payload!.average_sleep_hours).toBe(7.3);
  }
  // normal_hrv is now numeric (migration 012) — decimal preserved
  if (payload!.normal_hrv != null) {
    expect(payload!.normal_hrv).toBe(45.7);
  }
});

test("profile upsert: days-per-week fields are clamped to 0–7", async ({ page }) => {
  await installMockBackend(page);

  await page.route("**/api/analyze-profile-history", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          summary: { dataRange: "90d", totalRuns: 5, totalSleepLogs: 0, confidence: "high", notes: "" },
          suggestions: {
            currentLevel: null,
            currentLongestRunKm: null,
            weeklyMileageKm: null,
            runningDaysPerWeek: 9,   // out-of-range — must clamp to 7
            easyPace: null, easyHrCap: null, maxHr: null,
            vo2max: null, averageCadence: null,
            preferredTrainingDays: null, preferredLongRunDay: null,
            injuryHistory: null, riskNotes: null,
            averageSleepHours: null, normalSleepScore: null,
            normalEnergyScore: null, normalRestingHr: null, normalHrv: null,
            recoveryRules: null, trainingPreferenceSummary: null,
          },
          reasoning: { currentLevelReason: "", easyPaceReason: "", easyHrReason: "", sleepPatternReason: "", riskReason: "" },
          warnings: [],
        },
      }),
    });
  });

  let capturedBody: Record<string, unknown> | null = null;

  await page.route("**/e2e-supabase/rest/v1/profiles**", async (route) => {
    const method = route.request().method();
    if (method === "OPTIONS") { await route.fulfill({ status: 204, headers: CORS_HEADERS }); return; }
    if (method === "GET") {
      await route.fulfill({ status: 200, contentType: "application/vnd.pgrst.object+json", headers: CORS_HEADERS, body: JSON.stringify({ id: "test-profile", display_name: "x", field_sources: null }) });
      return;
    }
    if (method === "POST") {
      try { capturedBody = route.request().postDataJSON() as Record<string, unknown>; } catch { /**/ }
      await route.fulfill({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: JSON.stringify({}) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", headers: CORS_HEADERS, body: "[]" });
  });

  await page.goto("/settings");
  await page.waitForFunction(() => {
    const el = document.querySelector("button, input, textarea");
    if (!el) return false;
    return Object.keys(el).some((k) => k.startsWith("__reactProps$"));
  });

  await page.getByTestId("auto-sync-toggle").click();
  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);

  if (capturedBody?.running_days_per_week != null) {
    expect(capturedBody.running_days_per_week).toBeLessThanOrEqual(7);
    expect(capturedBody.running_days_per_week).toBeGreaterThanOrEqual(0);
  }
});

test("profile upsert: no Supabase sync error logged when analysis has decimal values", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && msg.text().includes("supabase-sync-error")) {
      errors.push(msg.text());
    }
  });

  await setupWithDecimalSuggestions(page);
  await page.getByTestId("auto-sync-toggle").click();
  await page.getByTestId("analyze-btn").click();
  await expect(page.getByText("อัปเดตแล้ว")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);

  expect(errors).toHaveLength(0);
});
