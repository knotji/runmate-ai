import { describe, it, expect } from "vitest";
import { mapGoogleHealthExerciseToExtracted, googleHealthExerciseHistoryItemId } from "@/lib/googleHealth/mapExercise";
import type { GoogleHealthExerciseDataPoint } from "@/lib/googleHealth/api";

// averageHeartRateBeatsPerMinute is int64-as-string on the wire; caloriesKcal,
// distanceMillimeters, elevationGainMillimeters are real doubles. exerciseType
// values below ("RUNNING", "BIKING", etc.) match the real 182-value enum.
function makePoint(overrides: Partial<GoogleHealthExerciseDataPoint["exercise"]> = {}): GoogleHealthExerciseDataPoint {
  return {
    name: "users/me/dataTypes/exercise/dataPoints/xyz789",
    exercise: {
      interval: { startTime: "2026-07-16T07:00:00Z", endTime: "2026-07-16T07:30:00Z" },
      exerciseType: "RUNNING",
      metricsSummary: { caloriesKcal: 350, averageHeartRateBeatsPerMinute: "150" },
      ...overrides,
    },
  };
}

describe("mapGoogleHealthExerciseToExtracted", () => {
  it("infers outdoor_run for a RUNNING exerciseType", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.workoutKind).toBe("outdoor_run");
  });

  it("infers treadmill for TREADMILL / TREADMILL_WALK exerciseTypes", () => {
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "TREADMILL" })).workoutKind).toBe("treadmill");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "TREADMILL_WALK" })).workoutKind).toBe("treadmill");
  });

  it("infers walk / cycling / strength / other from exerciseType keywords", () => {
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "WALKING" })).workoutKind).toBe("walk");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "NORDIC_WALKING" })).workoutKind).toBe("walk");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "BIKING" })).workoutKind).toBe("cycling");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "STRENGTH_TRAINING" })).workoutKind).toBe("strength");
    expect(mapGoogleHealthExerciseToExtracted(makePoint({ exerciseType: "YOGA_BIKRAM" })).workoutKind).toBe("other");
  });

  it("computes duration from the interval", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.duration).toBe("30 m");
  });

  it("parses calories directly and avgHR from its int64-as-string field", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.calories).toBe(350);
    expect(result.avgHR).toBe(150);
    expect(result.maxHR).toBeNull();
    expect(result.cadence).toBeNull();
    expect(result.vo2Max).toBeNull();
  });

  it("converts distanceMillimeters to km and elevationGainMillimeters to meters", () => {
    const result = mapGoogleHealthExerciseToExtracted(
      makePoint({ metricsSummary: { caloriesKcal: 350, distanceMillimeters: 5_000_000, elevationGainMillimeters: 20_000 } }),
    );
    expect(result.distanceKm).toBe(5);
    expect(result.elevationGain).toBe(20);
  });

  it("computes pace from the converted distance", () => {
    // 5km in 30 minutes = 6:00/km
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ metricsSummary: { distanceMillimeters: 5_000_000 } }));
    expect(result.avgPace).toBe("6:00/km");
  });

  it("leaves distance/pace/elevation null when metricsSummary has no distance field", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.distanceKm).toBeNull();
    expect(result.avgPace).toBeNull();
    expect(result.elevationGain).toBeNull();
  });

  it("includes notes in visibleMetrics when present", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ notes: "Felt great" }));
    expect(result.visibleMetrics).toContain("Felt great");
  });

  it("extracts the date (YYYY-MM-DD) from the interval start", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint());
    expect(result.date).toBe("2026-07-16");
  });

  it("prefers activeDuration over the wall-clock interval when present", () => {
    // Interval spans 30 min, but activeDuration (excludes pauses) is only 25 min.
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ activeDuration: "1500.0s" }));
    expect(result.duration).toBe("25 m");
  });

  it("prefers Google's own averagePaceSecondsPerMeter over the naive distance/duration calc", () => {
    // Naive calc from 5km/30min would give 6:00/km; Google's own value says otherwise.
    const result = mapGoogleHealthExerciseToExtracted(
      makePoint({ metricsSummary: { distanceMillimeters: 5_000_000, averagePaceSecondsPerMeter: 0.3 } }), // 5:00/km
    );
    expect(result.avgPace).toBe("5:00/km");
  });

  it("prefers Google's own averageSpeedMillimetersPerSecond over the naive distance/duration calc", () => {
    const result = mapGoogleHealthExerciseToExtracted(
      makePoint({ metricsSummary: { distanceMillimeters: 5_000_000, averageSpeedMillimetersPerSecond: 3000 } }), // 10.8 km/h
    );
    expect(result.avgSpeedKmh).toBe(10.8);
  });

  it("populates vo2Max from runVo2Max when present", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ metricsSummary: { runVo2Max: 48.5 } }));
    expect(result.vo2Max).toBe(48.5);
  });

  it("includes displayName first in visibleMetrics when present", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ displayName: "Morning Run", notes: "Felt great" }));
    expect(result.visibleMetrics[0]).toBe("Morning Run");
    expect(result.visibleMetrics).toContain("Felt great");
  });

  it("falls back to wall-clock duration and naive pace/speed calc when Google's own fields are absent", () => {
    const result = mapGoogleHealthExerciseToExtracted(makePoint({ metricsSummary: { distanceMillimeters: 5_000_000 } }));
    expect(result.duration).toBe("30 m");
    expect(result.avgPace).toBe("6:00/km");
    expect(result.avgSpeedKmh).toBe(10);
  });
});

describe("googleHealthExerciseHistoryItemId", () => {
  it("is deterministic and namespaced by data type", () => {
    const id = googleHealthExerciseHistoryItemId("users/me/dataTypes/exercise/dataPoints/xyz789");
    expect(id).toBe(googleHealthExerciseHistoryItemId("users/me/dataTypes/exercise/dataPoints/xyz789"));
    expect(id).toContain("exercise");
  });
});
