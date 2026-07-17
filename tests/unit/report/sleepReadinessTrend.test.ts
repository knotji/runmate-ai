import { describe, it, expect } from "vitest";
import { buildSleepReadinessTrend } from "@/lib/report/sleepReadinessTrend";
import type { LocalHistoryItem } from "@/lib/localHistory";

function sleepItem(dateKey: string, hours: number, readiness: number): LocalHistoryItem {
  return {
    id: `sleep-${dateKey}`,
    type: "sleep",
    createdAt: `${dateKey}T22:00:00.000Z`,
    dateKey,
    data: {
      extracted: { actualSleepDurationMinutes: hours * 60 },
      coach: { readinessScore: readiness },
    },
  };
}

describe("buildSleepReadinessTrend", () => {
  it("returns `days` points, oldest first, ending at todayDateKey", () => {
    const points = buildSleepReadinessTrend([], 7, "2026-07-17");
    expect(points).toHaveLength(7);
    expect(points[0].dateKey).toBe("2026-07-11");
    expect(points[6].dateKey).toBe("2026-07-17");
  });

  it("fills in real sleep/readiness values only for days with data, null otherwise", () => {
    const items = [sleepItem("2026-07-16", 7.5, 74)];
    const points = buildSleepReadinessTrend(items, 3, "2026-07-17");
    // 07-15 (no data), 07-16 (has data), 07-17 (no data)
    expect(points.map((p) => p.dateKey)).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
    expect(points[0].sleepHours).toBeNull();
    expect(points[1].sleepHours).toBe(7.5);
    expect(points[1].readiness).toBe(74);
    expect(points[2].sleepHours).toBeNull();
  });

  it("does not leak one day's data into an adjacent day (the itemsForDate bug this guards against)", () => {
    const items = [sleepItem("2026-07-16", 9, 90)];
    const points = buildSleepReadinessTrend(items, 2, "2026-07-17");
    const today = points.find((p) => p.dateKey === "2026-07-17");
    expect(today?.sleepHours).toBeNull();
    expect(today?.readiness).toBeNull();
  });
});
