import { describe, it, expect } from "vitest";
import { mapGoogleHealthSleepToExtracted, googleHealthSleepHistoryItemId, googleHealthDataPointId } from "@/lib/googleHealth/mapSleep";
import type { GoogleHealthSleepDataPoint } from "@/lib/googleHealth/api";

// int64 fields (minutesAsleep, minutesInSleepPeriod, stage minutes) are strings on
// the wire — the API serializes int64 as JSON strings to avoid precision loss.
function makePoint(overrides: Partial<GoogleHealthSleepDataPoint["sleep"]> = {}): GoogleHealthSleepDataPoint {
  return {
    name: "users/me/dataTypes/sleep/dataPoints/abc123",
    sleep: {
      interval: { startTime: "2026-07-15T23:03:30+07:00", endTime: "2026-07-16T07:12:00+07:00" },
      type: "STAGES",
      summary: {
        minutesAsleep: "424",
        minutesAwake: "34",
        minutesInSleepPeriod: "479",
        stagesSummary: [
          { type: "DEEP", minutes: "62" },
          { type: "LIGHT", minutes: "224" },
          { type: "REM", minutes: "74" },
          { type: "AWAKE", minutes: "34" },
        ],
      },
      ...overrides,
    },
  };
}

describe("mapGoogleHealthSleepToExtracted", () => {
  it("maps core duration fields from the interval and summary", () => {
    const result = mapGoogleHealthSleepToExtracted(makePoint(), null, null);
    expect(result.date).toBe("2026-07-16"); // dateOfSleep = end of interval
    expect(result.actualSleepDurationMinutes).toBe(424);
    expect(result.timeInBedMinutes).toBe(479);
    expect(result.sleepStartTime).toBe("2026-07-15T23:03:30+07:00");
    expect(result.sleepEndTime).toBe("2026-07-16T07:12:00+07:00");
  });

  it("maps sleep stage minutes keyed by the (already-uppercase) stage type", () => {
    const result = mapGoogleHealthSleepToExtracted(makePoint(), null, null);
    expect(result.sleepStageDeepMinutes).toBe(62);
    expect(result.sleepStageLightMinutes).toBe(224);
    expect(result.sleepStageRemMinutes).toBe(74);
    expect(result.sleepStageAwakeMinutes).toBe(34);
    expect(result.sleepStageMinutes).toEqual({ awake: 34, rem: 74, light: 224, deep: 62 });
  });

  it("leaves stage minutes null when stagesSummary is absent", () => {
    const result = mapGoogleHealthSleepToExtracted(makePoint({ summary: { minutesAsleep: "400" } }), null, null);
    expect(result.sleepStageDeepMinutes).toBeNull();
    expect(result.sleepStageMinutes).toBeNull();
  });

  it("passes through the daily resting HR / HRV arguments unchanged", () => {
    const result = mapGoogleHealthSleepToExtracted(makePoint(), 52, 48);
    expect(result.restingHR).toBe(52);
    expect(result.hrv).toBe(48);
  });

  it("leaves score fields null — not part of the public API", () => {
    const result = mapGoogleHealthSleepToExtracted(makePoint(), null, null);
    expect(result.sleepScore).toBeNull();
    expect(result.energyScore).toBeNull();
    expect(result.avgSleepingHeartRate).toBeNull();
    expect(result.avgSleepingHrv).toBeNull();
  });
});

describe("googleHealthDataPointId / googleHealthSleepHistoryItemId", () => {
  it("extracts the trailing id segment from the resource name", () => {
    expect(googleHealthDataPointId("users/me/dataTypes/sleep/dataPoints/abc123")).toBe("abc123");
  });

  it("is deterministic and namespaced by data type", () => {
    const id = googleHealthSleepHistoryItemId("users/me/dataTypes/sleep/dataPoints/abc123");
    expect(id).toBe(googleHealthSleepHistoryItemId("users/me/dataTypes/sleep/dataPoints/abc123"));
    expect(id).toContain("sleep");
  });
});
