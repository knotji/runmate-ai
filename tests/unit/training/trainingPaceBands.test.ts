import { describe, expect, it } from "vitest";
import {
  buildTrainingPaceBands,
  getAllowedPaceBandsForReadiness,
  getTodayDisplayPaceKeys,
  secPerKmToPaceDisplay,
  formatPaceRange,
} from "@/lib/training/trainingPaceBands";
import type { TrainingPaceBands } from "@/lib/training/trainingPaceTypes";

describe("secPerKmToPaceDisplay", () => {
  it("330 sec/km → 5:30/km", () => {
    expect(secPerKmToPaceDisplay(330)).toBe("5:30/km");
  });

  it("360 sec/km → 6:00/km", () => {
    expect(secPerKmToPaceDisplay(360)).toBe("6:00/km");
  });

  it("305 sec/km → 5:05/km (pads seconds)", () => {
    expect(secPerKmToPaceDisplay(305)).toBe("5:05/km");
  });
});

describe("buildTrainingPaceBands", () => {
  it("returns null when no targetTime", () => {
    expect(buildTrainingPaceBands({ raceDistance: "5K", targetTime: undefined })).toBeNull();
  });

  it("returns null for Custom distance", () => {
    expect(buildTrainingPaceBands({ raceDistance: "Custom", targetTime: "3:00:00" })).toBeNull();
  });

  it("returns null for malformed targetTime", () => {
    expect(buildTrainingPaceBands({ raceDistance: "10K", targetTime: "not-a-time" })).toBeNull();
  });

  it("5K in 25:00 → racePaceSec = 300, correct bands", () => {
    const bands = buildTrainingPaceBands({ raceDistance: "5K", targetTime: "25:00" });
    expect(bands).not.toBeNull();
    expect(bands!.racePaceSec).toBe(300);
    // easy: racePace+70 to +110 = 370–410
    expect(bands!.easy.minSecPerKm).toBe(370);
    expect(bands!.easy.maxSecPerKm).toBe(410);
    // interval: racePace-20 to -5 = 280–295
    expect(bands!.interval.minSecPerKm).toBe(280);
    expect(bands!.interval.maxSecPerKm).toBe(295);
  });

  it("10K in 1:00:00 → racePaceSec = 360", () => {
    const bands = buildTrainingPaceBands({ raceDistance: "10K", targetTime: "1:00:00" });
    expect(bands).not.toBeNull();
    expect(bands!.racePaceSec).toBe(360);
    expect(bands!.tempo.minSecPerKm).toBe(370);
    expect(bands!.tempo.maxSecPerKm).toBe(385);
  });

  it("Half Marathon in 2:00:00 → racePaceSec ≈ 341 sec/km", () => {
    const bands = buildTrainingPaceBands({ raceDistance: "Half Marathon", targetTime: "2:00:00" });
    expect(bands).not.toBeNull();
    // 7200 / 21.1 ≈ 341.2
    expect(bands!.racePaceSec).toBeCloseTo(341.2, 0);
  });

  it("HH:MM:SS format — Full Marathon in 3:30:00", () => {
    const bands = buildTrainingPaceBands({ raceDistance: "Full Marathon", targetTime: "3:30:00" });
    expect(bands).not.toBeNull();
    // 12600 / 42.195 ≈ 298.6
    expect(bands!.racePaceSec).toBeCloseTo(298.6, 0);
  });
});

describe("getAllowedPaceBandsForReadiness", () => {
  const bands: TrainingPaceBands = {
    racePaceSec: 300,
    easy: { minSecPerKm: 370, maxSecPerKm: 410 },
    long: { minSecPerKm: 345, maxSecPerKm: 390 },
    tempo: { minSecPerKm: 310, maxSecPerKm: 325 },
    interval: { minSecPerKm: 280, maxSecPerKm: 295 },
  };

  it("pain_risk → no bands", () => {
    expect(getAllowedPaceBandsForReadiness({ bands, dailyReadiness: { band: "pain_risk", loadTarget: "rest" } })).toEqual([]);
  });

  it("red band → no bands", () => {
    expect(getAllowedPaceBandsForReadiness({ bands, dailyReadiness: { band: "red", loadTarget: "walk" } })).toEqual([]);
  });

  it("easy loadTarget → easy + long only", () => {
    const result = getAllowedPaceBandsForReadiness({ bands, dailyReadiness: { band: "green", loadTarget: "easy" } });
    expect(result).toContain("easy");
    expect(result).toContain("long");
    expect(result).not.toContain("interval");
    expect(result).not.toContain("tempo");
  });

  it("yellow band → easy + long + tempo (no interval)", () => {
    const result = getAllowedPaceBandsForReadiness({ bands, dailyReadiness: { band: "yellow", loadTarget: "moderate" } });
    expect(result).toContain("easy");
    expect(result).toContain("tempo");
    expect(result).not.toContain("interval");
  });

  it("green + build → all 4 bands", () => {
    const result = getAllowedPaceBandsForReadiness({ bands, dailyReadiness: { band: "green", loadTarget: "build" } });
    expect(result).toContain("easy");
    expect(result).toContain("long");
    expect(result).toContain("tempo");
    expect(result).toContain("interval");
  });
});

describe("formatPaceRange", () => {
  it("formats a range correctly", () => {
    const result = formatPaceRange({ minSecPerKm: 370, maxSecPerKm: 410 });
    expect(result).toBe("6:10/km – 6:50/km");
  });
});

// ─── getTodayDisplayPaceKeys ───────────────────────────────────────────────────

describe("getTodayDisplayPaceKeys — Today page only shows full bands on full training days", () => {
  const allAllowed = ["easy", "long", "tempo", "interval"] as const;
  const yellowAllowed = ["easy", "long", "tempo"] as const;
  const easyAllowed = ["easy", "long"] as const;

  it("green + build → shows all allowed bands (full training day)", () => {
    const result = getTodayDisplayPaceKeys([...allAllowed], "green", "build");
    expect(result).toEqual(["easy", "long", "tempo", "interval"]);
  });

  it("green + moderate → shows all allowed bands (full training day)", () => {
    const result = getTodayDisplayPaceKeys([...allAllowed], "green", "moderate");
    expect(result).toEqual(["easy", "long", "tempo", "interval"]);
  });

  it("yellow + moderate → shows Easy only, not Tempo or Long (caution day)", () => {
    // getAllowedPaceBandsForReadiness returns ["easy","long","tempo"] for yellow+moderate
    // but Today page must NOT show Tempo on caution days
    const result = getTodayDisplayPaceKeys([...yellowAllowed], "yellow", "moderate");
    expect(result).toEqual(["easy"]);
    expect(result).not.toContain("tempo");
    expect(result).not.toContain("long");
  });

  it("green + easy (high load) → shows Easy only, not Long/Tempo", () => {
    // green + high load → loadTarget="easy" → allowedKeys=["easy","long"]
    // Today should show only Easy since it's not a full training day
    const result = getTodayDisplayPaceKeys([...easyAllowed], "green", "easy");
    expect(result).toEqual(["easy"]);
    expect(result).not.toContain("long");
  });

  it("pain_risk / empty allowedKeys → returns empty (handled by caller to show rest card)", () => {
    const result = getTodayDisplayPaceKeys([], "pain_risk", "rest");
    expect(result).toHaveLength(0);
  });

  it("red band / empty allowedKeys → returns empty", () => {
    const result = getTodayDisplayPaceKeys([], "red", "walk");
    expect(result).toHaveLength(0);
  });
});
