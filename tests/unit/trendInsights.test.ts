import { describe, it, expect } from "vitest";
import { detectRestingHRTrend } from "@/lib/trendInsights";

function row(date: string, restingHR: number | null) {
  return { date, restingHR };
}

describe("detectRestingHRTrend", () => {
  it("returns null when there's less than 3 days of data", () => {
    const rows = [row("2026-07-17", 60), row("2026-07-16", 58)];
    expect(detectRestingHRTrend(rows)).toBeNull();
  });

  it("returns null when RHR is flat/falling", () => {
    const rows = [row("2026-07-17", 55), row("2026-07-16", 58), row("2026-07-15", 60)];
    expect(detectRestingHRTrend(rows)).toBeNull();
  });

  it("returns null when the streak is a rising run but under the minimum bpm threshold", () => {
    const rows = [row("2026-07-17", 61), row("2026-07-16", 60), row("2026-07-15", 59)];
    expect(detectRestingHRTrend(rows)).toBeNull();
  });

  it("detects a 3-day+ consecutive rising streak with enough total rise", () => {
    const rows = [row("2026-07-17", 65), row("2026-07-16", 61), row("2026-07-15", 58)];
    const trend = detectRestingHRTrend(rows);
    expect(trend).toEqual({ streakDays: 3, latestRestingHR: 65, riseBpm: 7 });
  });

  it("stops the streak at a calendar gap even if the values keep rising", () => {
    // 07-13 is missing entirely — 07-14 and earlier shouldn't count toward the streak.
    const rows = [row("2026-07-17", 65), row("2026-07-16", 61), row("2026-07-14", 55)];
    const trend = detectRestingHRTrend(rows);
    expect(trend).toBeNull();
  });

  it("stops the streak at a missing (null) reading", () => {
    const rows = [row("2026-07-17", 65), row("2026-07-16", 61), row("2026-07-15", null), row("2026-07-14", 50)];
    const trend = detectRestingHRTrend(rows);
    expect(trend).toBeNull();
  });

  it("only counts the streak ending at the most recent day, not an older run", () => {
    // Rising 07-14->07-13->07-12, but today (07-17) breaks the streak immediately since
    // there's a gap before 07-16.
    const rows = [row("2026-07-17", 40), row("2026-07-14", 55), row("2026-07-13", 52), row("2026-07-12", 48)];
    expect(detectRestingHRTrend(rows)).toBeNull();
  });
});
