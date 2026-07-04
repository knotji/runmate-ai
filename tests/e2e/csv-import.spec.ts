import { expect, test } from "@playwright/test";
import { parseCsvText, cleanNumber, normalizeDash, cleanWeirdNegative, parseDurationToMinutes, parseDurationToSeconds, parsePaceToSecPerKm } from "../../src/lib/import/csvUtils";
import { detectCsvFormat } from "../../src/lib/import/detectImportSource";
import { parseGarminActivitiesCsvRows } from "../../src/lib/import/adapters/garminActivitiesCsv";
import { parseGarminSleepCsvRows } from "../../src/lib/import/adapters/garminSleepCsv";
import { normalizedSleepToHistoryItem } from "../../src/lib/import/normalized";
import { buildCoachContextFromData } from "../../src/lib/buildCoachContext";
import { gotoApp, installMockBackend } from "./helpers/app";
import { bangkokDateKey } from "./helpers/testData";

const activitiesCsv = `Activity Type,Date,Title,Distance,Calories,Time,Moving Time,Elapsed Time,Avg HR,Max HR,Aerobic TE,Avg Pace,Best Pace,Total Ascent,Total Descent,Steps,Body Battery Drain
Running,"6/26/2026 6:04 AM",Morning Run,6.91,"4,614",00:57:17,00:56:10,00:59:00,145,171,3.1,8:17,5:45,28,29,8200,"'-9"
Cardio,"6/27/2026 7:30 AM",Gym Cardio,0.00,188,00:30:00,00:30:00,00:30:00,108,134,1.4,--,--,--,--,--,"'-10"`;

const sleepCsv = `Sleep Score 4 Weeks,Score,Resting Heart Rate,Body Battery,Pulse Ox,Respiration,HRV Status,Quality,Duration,Sleep Need,Bedtime,Wake Time
"Jun 26, 2026",76,52,"+35",97,15,48,Good,5h 8min,9h 0min,12:31 AM,6:04 AM`;

test.describe("CSV import utilities", () => {
  test("parses durations, pace, numbers, missing values, and signed values", () => {
    expect(parseDurationToSeconds("00:57:17")).toBe(3437);
    expect(parseDurationToSeconds("00:09:00.5")).toBe(541);
    expect(parseDurationToMinutes("5h 8min")).toBe(308);
    expect(parsePaceToSecPerKm("8:17")).toBe(497);
    expect(cleanNumber("4,614")).toBe(4614);
    expect(normalizeDash("--")).toBeUndefined();
    expect(cleanNumber(cleanWeirdNegative("'-9"))).toBe(-9);
  });
});

test.describe("Garmin CSV adapters", () => {
  test("detects and parses Garmin activities CSV rows", () => {
    const rows = parseCsvText(activitiesCsv);
    expect(detectCsvFormat(Object.keys(rows[0]))).toBe("garmin_activities_csv");

    const result = parseGarminActivitiesCsvRows(rows, { originalFileName: "Activities_toey.csv", importedAt: "2026-07-04T00:00:00.000Z" });
    expect(result.detectedFormat).toBe("garmin_activities_csv");
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toMatchObject({
      activityType: "run",
      distanceKm: 6.91,
      durationSeconds: 3437,
      avgHr: 145,
      maxHr: 171,
      calories: 4614,
      aerobicTrainingEffect: 3.1,
      avgPaceSecPerKm: 497,
      bodyBatteryDrain: -9,
    });
    expect(result.records[1]).toMatchObject({
      activityType: "cardio",
      distanceKm: 0,
      durationSeconds: 1800,
      avgPaceSecPerKm: undefined,
      calories: 188,
      avgHr: 108,
      maxHr: 134,
      aerobicTrainingEffect: 1.4,
      bodyBatteryDrain: -10,
    });
  });

  test("detects and parses Garmin sleep CSV without fake Energy Score", () => {
    const rows = parseCsvText(sleepCsv);
    expect(detectCsvFormat(Object.keys(rows[0]))).toBe("garmin_sleep_csv");

    const result = parseGarminSleepCsvRows(rows, { originalFileName: "Sleep_toey.csv", importedAt: "2026-07-04T00:00:00.000Z" });
    expect(result.detectedFormat).toBe("garmin_sleep_csv");
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({
      dateKey: "2026-06-26",
      sleepScore: 76,
      durationMinutes: 308,
      sleepNeedMinutes: 540,
      restingHeartRate: 52,
      hrvMs: 48,
    });
    expect(result.records[0].energyScore).toBeUndefined();
    expect(result.records[0].source.missingFields).toContain("energyScore");
  });
});

test.describe("Readiness compatibility", () => {
  test("missing Energy Score stays null and does not create a zero readiness score", () => {
    const parsed = parseGarminSleepCsvRows(parseCsvText(sleepCsv), { importedAt: "2026-07-04T00:00:00.000Z" });
    const item = normalizedSleepToHistoryItem({ ...parsed.records[0], dateKey: bangkokDateKey() });
    const context = buildCoachContextFromData({
      items: [item],
      profile: null,
      raceGoal: null,
      racePlan: null,
    });

    expect(context.latestEnergyScore).toBeNull();
    expect(context.sleep7d[0].energyScore).toBeNull();
    expect(context.sleep7d[0].readiness).not.toBe(0);
    expect(context.sleep7d[0].score).toBe(76);
  });
});

test.describe("Settings CSV UI", () => {
  test("CSV option appears for sleep in Settings, previews records, and saves normalized sleep history", async ({ page }) => {
    const state = await installMockBackend(page);
    await gotoApp(page, "/settings?tab=data&import=sleep-csv");

    await expect(page.getByTestId("sleep-csv-import-zone")).toBeVisible();
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();

    await page.getByTestId("csv-file-input").setInputFiles({
      name: "Sleep_toey.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(sleepCsv),
    });
    await expect(page.getByTestId("csv-import-preview")).toContainText("garmin_sleep_csv");
    await expect(page.getByTestId("csv-import-preview")).toContainText("2026-06-26");

    await page.getByRole("button", { name: "บันทึกข้อมูลที่นำเข้า" }).click();
    await expect.poll(() => state.history.filter((row) => row.type === "sleep").length).toBe(1);
    const saved = state.history.find((row) => row.type === "sleep");
    expect(saved?.data.source).toMatchObject({ provider: "garmin_connect", importType: "csv", originalFileName: "Sleep_toey.csv" });
    expect((saved?.data.extracted as Record<string, unknown>)?.energyScore).toBeNull();
  });

  test("CSV option appears for workout in Settings, previews records, and saves normalized activity history", async ({ page }) => {
    const state = await installMockBackend(page);
    await gotoApp(page, "/settings?tab=data&import=workout-csv");

    await expect(page.getByTestId("workout-csv-import-zone")).toBeVisible();
    await expect(page.getByTestId("csv-import-panel")).toBeVisible();

    await page.getByTestId("csv-file-input").setInputFiles({
      name: "Activities_toey.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(activitiesCsv),
    });
    await expect(page.getByTestId("csv-import-preview")).toContainText("garmin_activities_csv");
    await expect(page.getByTestId("csv-import-preview")).toContainText("run");
    await expect(page.getByTestId("csv-import-preview")).toContainText("cardio");

    await page.getByRole("button", { name: "บันทึกข้อมูลที่นำเข้า" }).click();
    await expect.poll(() => state.history.filter((row) => row.type === "workout").length).toBe(2);
    const workouts = state.history.filter((row) => row.type === "workout");
    expect(workouts[0].data.source).toMatchObject({ provider: "garmin_connect", importType: "csv" });
  });
});
