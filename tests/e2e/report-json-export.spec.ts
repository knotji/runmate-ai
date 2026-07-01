import { expect, test } from "@playwright/test";
import { buildReportPeriodJsonExport } from "../../src/lib/exportRunMateJson";
import { buildRunMateExportFilename } from "../../src/lib/downloadJson";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const weeklySummary = {
  periodType: "week" as const,
  startDateKey: "2026-06-29",
  endDateKey: "2026-07-05",
  label: "29 มิ.ย. - 5 ก.ค.",
  totals: { runDistanceKm: 5, workoutDays: 1, runDays: 1, strengthDays: 0, restDays: 0, activityCount: 1 },
  averages: { readiness: 74, sleepHours: 7 },
  highlights: { longestRunKm: 5 },
  consistency: { sleepDays: 1, nutritionDays: 1, summaryDays: 0 },
  pain: { activePainDays: 0, resolvedPainDays: 0 },
  days: [
    {
      dateKey: "2026-07-01",
      weekdayLabel: "พ 1 ก.ค.",
      hasData: true,
      isToday: true,
      readiness: 74,
      sleepHours: 7,
      runKm: 5,
      strengthMins: null,
      walkMins: null,
      hasRestWorkout: false,
      mealCount: 1,
      proteinG: 30,
      carbsG: 70,
      fatG: 18,
      caloriesKcal: 560,
      painStatus: null,
      painLevel: null,
      bodyWeightKg: null,
      hasDailySummary: false,
    },
  ],
};

const monthlySummary = {
  periodType: "month" as const,
  startDateKey: "2026-07-01",
  endDateKey: "2026-07-31",
  label: "ก.ค. 2026",
  weeks: [weeklySummary],
  totals: weeklySummary.totals,
  averages: weeklySummary.averages,
  highlights: { longestRunKm: 5, highestWeeklyKm: 5 },
  consistency: weeklySummary.consistency,
  pain: weeklySummary.pain,
};

function makeSleep(dateKey: string, id: string) {
  return {
    id,
    user_id: "00000000-0000-4000-8000-000000000001",
    type: "sleep",
    created_at: `${dateKey}T08:00:00.000Z`,
    data: {
      extracted: { date: dateKey, actualSleepDurationMinutes: 420, sleepScore: 76 },
      coach: { readinessScore: 74, readinessLabel: "Good" },
    },
  };
}

test("buildReportPeriodJsonExport creates safe week export", async () => {
  const exportJson = buildReportPeriodJsonExport({
    periodType: "week",
    periodLabel: weeklySummary.label,
    startDateKey: weeklySummary.startDateKey,
    endDateKey: weeklySummary.endDateKey,
    weeklySummary,
    exportedAt: "2026-07-01T00:00:00.000Z",
  });

  expect(exportJson.schemaVersion).toBe("runmate_export_v1");
  expect(exportJson.exportType).toBe("report_period");
  expect(exportJson.period.type).toBe("week");
  expect(exportJson.days).toHaveLength(1);
  expect(exportJson.weeks).toBeUndefined();
  expect(exportJson.metadata.includesRawImages).toBe(false);
  expect(exportJson.metadata.includesRawOcr).toBe(false);
  expect(exportJson.metadata.includesAuthData).toBe(false);
  expect(JSON.stringify(exportJson)).not.toMatch(/data:image|base64|access_token|refresh_token/i);
});

test("buildReportPeriodJsonExport creates compact month export", async () => {
  const exportJson = buildReportPeriodJsonExport({
    periodType: "month",
    periodLabel: monthlySummary.label,
    startDateKey: monthlySummary.startDateKey,
    endDateKey: monthlySummary.endDateKey,
    monthlySummary,
    exportedAt: "2026-07-01T00:00:00.000Z",
  });

  expect(exportJson.schemaVersion).toBe("runmate_export_v1");
  expect(exportJson.period.type).toBe("month");
  expect(exportJson.weeks).toHaveLength(1);
  expect(exportJson.days).toBeUndefined();
  expect(exportJson.metadata.source).toBe("report_calendar");
});

test("buildRunMateExportFilename is deterministic", async () => {
  expect(buildRunMateExportFilename({
    periodType: "week",
    startDateKey: "2026-06-29",
    endDateKey: "2026-07-05",
  })).toBe("runmate-report-week-2026-06-29_to_2026-07-05.json");

  expect(buildRunMateExportFilename({
    periodType: "month",
    startDateKey: "2026-07-01",
    endDateKey: "2026-07-31",
  })).toBe("runmate-report-month-2026-07-01_to_2026-07-31.json");
});

test("Report week export downloads JSON with feedback", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-export-week"));

  await gotoApp(page, "/logs");

  await expect(page.getByRole("button", { name: "ส่งออก JSON" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออก JSON" }).click();
  await expect(page.getByTestId("report-export-status")).toHaveText("กำลังเตรียมไฟล์...");
  await expect(page.getByRole("button", { name: "กำลังเตรียมไฟล์..." })).toBeDisabled();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain("runmate-report-week");
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await expect(page.getByTestId("report-export-status")).toHaveText("ดาวน์โหลด JSON แล้ว");

  await page.getByTestId("calendar-nav").getByRole("button", { name: "สัปดาห์ก่อน" }).click();
  await expect(page.getByTestId("nav-current-btn")).toBeVisible();
});

test("Report month export downloads JSON", async ({ page }) => {
  const state = await installMockBackend(page);
  state.history.push(makeSleep(bangkokDateKey(), "sleep-export-month"));

  await gotoApp(page, "/logs");
  await page.getByRole("button", { name: "เดือน", exact: true }).click();
  await expect(page.getByTestId("month-week-list")).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "ส่งออก JSON" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toContain("runmate-report-month");
  expect(download.suggestedFilename()).toMatch(/\.json$/);
});
