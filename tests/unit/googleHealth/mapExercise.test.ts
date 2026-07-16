import { describe, it, expect } from "vitest";
import { mapGoogleHealthExerciseToExtracted, googleHealthExerciseHistoryItemId } from "@/lib/googleHealth/mapExercise";
import type { GoogleHealthExerciseDataPoint } from "@/lib/googleHealth/api";

function makePoint(overrides: Partial<GoogleHealthExerciseDataPoint["exercise"]> = {}): GoogleHealthExerciseDataPoint {
  return {
    name: "users/me/dataTypes/exercise/dataPoints/xyz789",
    exercise: {
      interval: { startTime: "2026-07-16T07:00:00Z", endTime: "2026-07-16T07:30:00Z" },
      exerciseType: "RUN",
      metricsSummary: { caloriesKcal: 350, averageHeartRateBeatsPerMinute: 150 },
      ...overrides,
    },
  };
}

describe("mapGoogleHealthExerciseToExtracted", () => {
  it("infers outdoor_run for a RUN exerciseType", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.workoutKind).toBe("outdoor_run");
  });

  it("infers treadmill when exerciseType mentions treadmill", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "TREADMILL_RUNNING" }));
    expect(result.workoutKind).toBe("treadmill");
  });

  it("infers walk / cycling / strength / other from exerciseType keywords", () => {
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "WALKING" })).workoutKind).toBe("walk");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "BIKING" })).workoutKind).toBe("cycling");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "STRENGTH_TRAINING" })).workoutKind).toBe("strength");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "YOGA" })).workoutKind).toBe("other");
  });

  it("computes duration from the interval when metricsSummary has none", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.duration).toBe("30 m");
  });

  it("maps calories and avgHR directly, leaves maxHR/cadence/vo2Max null", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.calories).toBe(350);
    expect(result.avgHR).toBe(150);
    expect(result.maxHR).toBeNull();
    expect(result.cadence).toBeNull();
    expect(result.vo2Max).toBeNull();
  });

  it("leaves distance/pace null when metricsSummary has no distance field", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.distanceKm).toBeNull();
    expect(result.avgPace).toBeNull();
  });

  it("includes notes in visibleMetrics when present", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ notes: "Felt great" }));
    expect(result.visibleMetrics).toContain("Felt great");
  });

  it("extracts the date (YYYY-MM-DD) from the interval start", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.date).toBe("2026-07-16");
  });
});

describe("googleHealthExerciseHistoryItemId", () => {
  it("is deterministic and namespaced by data type", () => {
    const id = googleHealthExerciseHistoryItemId("users/me/dataTypes/exercise/dataPoints/xyz789");
    expect(id).toBe(googleHealthExerciseHistoryItemId("users/me/dataTypes/exercise/dataPoints/xyz789"));
    expect(id).toContain("exercise");
  });
});
