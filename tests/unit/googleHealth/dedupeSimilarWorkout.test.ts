import { describe, it, expect } from "vitest";
import { isLikelyDuplicateWorkout } from "@/lib/googleHealth/dedupeSimilarWorkout";

const START = Date.parse("2026-07-18T06:32:00.000Z");

describe("isLikelyDuplicateWorkout", () => {
  it("flags two records for the same run started at the same time (phone + watch scenario)", () => {
    const candidate = { startTimeMs: START, distanceKm: 10.38 };
    const existing = { startTimeMs: START, distanceKm: 10.16 };
    expect(isLikelyDuplicateWorkout(candidate, existing)).toBe(true);
  });

  it("does not flag runs more than 30 minutes apart even with similar distance", () => {
    const candidate = { startTimeMs: START, distanceKm: 10 };
    const existing = { startTimeMs: START + 40 * 60 * 1000, distanceKm: 10 };
    expect(isLikelyDuplicateWorkout(candidate, existing)).toBe(false);
  });

  it("does not flag runs at the same time with very different distances", () => {
    const candidate = { startTimeMs: START, distanceKm: 5 };
    const existing = { startTimeMs: START, distanceKm: 21 };
    expect(isLikelyDuplicateWorkout(candidate, existing)).toBe(false);
  });

  it("does not flag when either side has no distance (avoids false positives)", () => {
    const candidate = { startTimeMs: START, distanceKm: null };
    const existing = { startTimeMs: START, distanceKm: 10 };
    expect(isLikelyDuplicateWorkout(candidate, existing)).toBe(false);
  });

  it("is within tolerance right at the 25% distance boundary", () => {
    const candidate = { startTimeMs: START, distanceKm: 10 };
    const existing = { startTimeMs: START, distanceKm: 12.5 };
    expect(isLikelyDuplicateWorkout(candidate, existing)).toBe(true);
  });

  it("is outside tolerance past the 25% distance boundary", () => {
    const candidate = { startTimeMs: START, distanceKm: 10 };
    const existing = { startTimeMs: START, distanceKm: 14 };
    expect(isLikelyDuplicateWorkout(candidate, existing)).toBe(false);
  });
});
