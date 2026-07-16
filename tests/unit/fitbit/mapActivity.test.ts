import { describe, it, expect } from "vitest";
import { mapFitbitActivityToExtracted, fitbitActivityHistoryItemId, type FitbitActivityLogEntry } from "@/lib/fitbit/mapActivity";

function makeEntry(overrides: Partial<FitbitActivityLogEntry> = {}): FitbitActivityLogEntry {
  return {
    logId: 999,
    activityName: "Run",
    activityTypeId: 90009,
    startTime: "2026-07-16T07:00:00.000Z",
    duration: 1_800_000, // 30 min
    distance: 5,
    distanceUnit: "Kilometer",
    calories: 350,
    averageHeartRate: 150,
    elevationGain: 20,
    ...overrides,
  };
}

describe("mapFitbitActivityToExtracted", () => {
  it("infers outdoor_run for a Run activity", () => {
    const result = mapFitbitActivityToExtracted(makeEntry());
    expect(result.workoutKind).toBe("outdoor_run");
  });

  it("infers treadmill when the activity name mentions treadmill", () => {
    const result = mapFitbitActivityToExtracted(makeEntry({ activityName: "Treadmill Run" }));
    expect(result.workoutKind).toBe("treadmill");
  });

  it("infers walk from name when activityTypeId isn't a known walk id", () => {
    const result = mapFitbitActivityToExtracted(makeEntry({ activityName: "Walk", activityTypeId: 0 }));
    expect(result.workoutKind).toBe("walk");
  });

  it("falls back to 'other' for unrecognized activities", () => {
    const result = mapFitbitActivityToExtracted(makeEntry({ activityName: "Yoga", activityTypeId: 0 }));
    expect(result.workoutKind).toBe("other");
  });

  it("converts miles to km", () => {
    const result = mapFitbitActivityToExtracted(makeEntry({ distance: 3.1, distanceUnit: "Mile" }));
    expect(result.distanceKm).toBeCloseTo(4.989, 2);
  });

  it("computes pace (min:sec/km) from distance and duration", () => {
    // 5km in 30 minutes = 6:00/km
    const result = mapFitbitActivityToExtracted(makeEntry({ distance: 5, duration: 1_800_000 }));
    expect(result.avgPace).toBe("6:00/km");
  });

  it("returns null pace when there's no distance", () => {
    const result = mapFitbitActivityToExtracted(makeEntry({ distance: undefined }));
    expect(result.avgPace).toBeNull();
    expect(result.distanceKm).toBeNull();
  });

  it("maps HR/calories/elevation directly, leaves maxHR/cadence/vo2Max null", () => {
    const result = mapFitbitActivityToExtracted(makeEntry());
    expect(result.avgHR).toBe(150);
    expect(result.calories).toBe(350);
    expect(result.elevationGain).toBe(20);
    expect(result.maxHR).toBeNull();
    expect(result.cadence).toBeNull();
    expect(result.vo2Max).toBeNull();
  });

  it("extracts the date (YYYY-MM-DD) from startTime", () => {
    const result = mapFitbitActivityToExtracted(makeEntry({ startTime: "2026-07-16T07:00:00.000Z" }));
    expect(result.date).toBe("2026-07-16");
  });
});

describe("fitbitActivityHistoryItemId", () => {
  it("is deterministic for the same logId", () => {
    expect(fitbitActivityHistoryItemId(999)).toBe(fitbitActivityHistoryItemId(999));
  });
});
