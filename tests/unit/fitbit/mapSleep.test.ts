import { describe, it, expect } from "vitest";
import { mapFitbitSleepToExtracted, fitbitSleepHistoryItemId, type FitbitSleepLogEntry } from "@/lib/fitbit/mapSleep";

function makeEntry(overrides: Partial<FitbitSleepLogEntry> = {}): FitbitSleepLogEntry {
  return {
    logId: 12345,
    dateOfSleep: "2026-07-16",
    startTime: "2026-07-15T23:03:30.000",
    endTime: "2026-07-16T07:12:00.000",
    minutesAsleep: 424,
    minutesAwake: 34,
    timeInBed: 479,
    efficiency: 93,
    type: "stages",
    levels: {
      summary: {
        deep: { minutes: 62 },
        light: { minutes: 224 },
        rem: { minutes: 74 },
        wake: { minutes: 34 },
      },
    },
    ...overrides,
  };
}

describe("mapFitbitSleepToExtracted", () => {
  it("maps core duration fields directly", () => {
    const result = mapFitbitSleepToExtracted(makeEntry());
    expect(result.date).toBe("2026-07-16");
    expect(result.actualSleepDurationMinutes).toBe(424);
    expect(result.timeInBedMinutes).toBe(479);
    expect(result.sleepDurationSource).toBe("actual");
  });

  it("maps sleep stage minutes when type is 'stages'", () => {
    const result = mapFitbitSleepToExtracted(makeEntry());
    expect(result.sleepStageDeepMinutes).toBe(62);
    expect(result.sleepStageLightMinutes).toBe(224);
    expect(result.sleepStageRemMinutes).toBe(74);
    expect(result.sleepStageAwakeMinutes).toBe(34);
    expect(result.sleepStageMinutes).toEqual({ awake: 34, rem: 74, light: 224, deep: 62 });
  });

  it("leaves stage minutes null for 'classic' type logs (no stage breakdown available)", () => {
    const result = mapFitbitSleepToExtracted(makeEntry({ type: "classic", levels: undefined }));
    expect(result.sleepStageDeepMinutes).toBeNull();
    expect(result.sleepStageMinutes).toBeNull();
  });

  it("leaves score/HRV/HR fields null — not part of the public Sleep Log API", () => {
    const result = mapFitbitSleepToExtracted(makeEntry());
    expect(result.sleepScore).toBeNull();
    expect(result.energyScore).toBeNull();
    expect(result.avgSleepingHeartRate).toBeNull();
    expect(result.avgSleepingHrv).toBeNull();
    expect(result.hrv).toBeNull();
    expect(result.restingHR).toBeNull();
  });

  it("formats duration text as 'H h M m'", () => {
    const result = mapFitbitSleepToExtracted(makeEntry({ minutesAsleep: 424 }));
    expect(result.actualSleepDurationText).toBe("7 h 4 m");
  });

  it("formats duration text with only minutes when under an hour", () => {
    const result = mapFitbitSleepToExtracted(makeEntry({ minutesAsleep: 37 }));
    expect(result.actualSleepDurationText).toBe("37 m");
  });
});

describe("fitbitSleepHistoryItemId", () => {
  it("is deterministic for the same logId", () => {
    expect(fitbitSleepHistoryItemId(12345)).toBe(fitbitSleepHistoryItemId(12345));
  });

  it("differs across logIds", () => {
    expect(fitbitSleepHistoryItemId(1)).not.toBe(fitbitSleepHistoryItemId(2));
  });
});
