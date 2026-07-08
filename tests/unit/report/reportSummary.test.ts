import { describe, it, expect } from "vitest";
import { buildCalendarWeekSummary } from "@/lib/reportSummary";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { WorkoutAnalysis } from "@/types/logs";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const WEEK_RANGE = {
  startDateKey: "2026-07-01",
  endDateKey: "2026-07-07",
  label: "1–7 ก.ค.",
  shortLabel: "1–7 ก.ค.",
};

const TODAY = "2026-07-07";

function makeWorkoutItem(
  id: string,
  dateKey: string,
  extracted: Partial<WorkoutAnalysis["extracted"]>,
): LocalHistoryItem {
  return {
    id,
    type: "workout",
    createdAt: `${dateKey}T12:00:00.000Z`,
    recordedAt: `${dateKey}T12:00:00.000Z`,
    data: { extracted } as WorkoutAnalysis,
  };
}

// ─── ระยะวิ่ง (runDistanceKm) must count runs only ────────────────────────────

describe("runDistanceKm — counts only running workouts", () => {
  it("week with only swim: ระยะวิ่ง = 0 กม., กิจกรรม = 1 วัน", () => {
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("sw1", "2026-07-01", {
        workoutKind: "other",
        swimKind: "pool",
        distanceM: 1500,
        distanceKm: null,
        avgHR: null,
        calories: null,
        duration: null,
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(0);
    expect(summary.totals.workoutDays).toBe(1);
  });

  it("week with run + swim on different days: ระยะวิ่ง = run km only, กิจกรรม = 2 วัน", () => {
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("run1", "2026-07-01", {
        workoutKind: "outdoor_run",
        distanceKm: 10,
        distanceM: null,
        avgHR: 150,
        calories: 500,
        duration: "1:00:00",
      }),
      makeWorkoutItem("sw1", "2026-07-02", {
        workoutKind: "other",
        swimKind: "pool",
        distanceM: 1000,
        distanceKm: null,
        avgHR: null,
        calories: null,
        duration: null,
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(10);
    expect(summary.totals.workoutDays).toBe(2);
  });

  it("week with strength only: ระยะวิ่ง = 0 กม., กิจกรรม = 1 วัน", () => {
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("str1", "2026-07-03", {
        workoutKind: "strength",
        distanceKm: null,
        distanceM: null,
        avgHR: 130,
        calories: 200,
        duration: "45:00",
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(0);
    expect(summary.totals.workoutDays).toBe(1);
  });

  it("week with no workouts: ระยะวิ่ง = 0 กม., กิจกรรม = 0 วัน", () => {
    const summary = buildCalendarWeekSummary([], WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(0);
    expect(summary.totals.workoutDays).toBe(0);
  });

  it("swim distance must not contribute to ระยะวิ่ง even when distanceM is large", () => {
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("sw2", "2026-07-04", {
        workoutKind: "other",
        swimKind: "open_water",
        distanceM: 5000,
        distanceKm: null,
        avgHR: null,
        calories: null,
        duration: "1:30:00",
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(0);
  });

  it("walk duration must not contribute to ระยะวิ่ง", () => {
    // Walk is intentionally excluded from runDistanceKm; workoutDays counts it.
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("walk1", "2026-07-05", {
        workoutKind: "walk",
        distanceKm: null,
        distanceM: null,
        avgHR: 100,
        calories: 120,
        duration: "30:00",
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(0);
    expect(summary.totals.workoutDays).toBe(1);
  });

  it("run + swim on the same day: ระยะวิ่ง = run km only, กิจกรรม = 1 วัน", () => {
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("run2", "2026-07-06", {
        workoutKind: "outdoor_run",
        distanceKm: 5,
        distanceM: null,
        avgHR: 155,
        calories: 300,
        duration: "28:00",
      }),
      makeWorkoutItem("sw3", "2026-07-06", {
        workoutKind: "other",
        swimKind: "pool",
        distanceM: 500,
        distanceKm: null,
        avgHR: null,
        calories: null,
        duration: null,
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(5);
    expect(summary.totals.workoutDays).toBe(1);
  });

  it("treadmill run contributes to ระยะวิ่ง same as outdoor run", () => {
    const items: LocalHistoryItem[] = [
      makeWorkoutItem("tr1", "2026-07-07", {
        workoutKind: "treadmill",
        distanceKm: 8,
        distanceM: null,
        avgHR: 160,
        calories: 450,
        duration: "48:00",
      }),
    ];
    const summary = buildCalendarWeekSummary(items, WEEK_RANGE, TODAY);
    expect(summary.totals.runDistanceKm).toBe(8);
    expect(summary.totals.workoutDays).toBe(1);
  });
});
