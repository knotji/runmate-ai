import { describe, it, expect } from "vitest";
import { buildCoachContextFromData } from "@/lib/buildCoachContext";
import type { LocalHistoryItem } from "@/lib/localHistory";
import { todayBangkokDateKey } from "@/lib/date";

function makeItem(overrides: Partial<LocalHistoryItem>): LocalHistoryItem {
  return {
    id: "manual-1",
    type: "sleep",
    createdAt: `${todayBangkokDateKey()}T00:00:00Z`,
    dateKey: todayBangkokDateKey(),
    data: {},
    ...overrides,
  };
}

describe("autoSyncedToday", () => {
  it("is false for both types when there are no ghealth-synced items today", () => {
    const ctx = buildCoachContextFromData({
      items: [makeItem({ id: "manual-sleep-1", type: "sleep" })],
      profile: null,
      raceGoal: null,
      racePlan: null,
    });
    expect(ctx.autoSyncedToday).toEqual({ sleep: false, workout: false });
  });

  it("is true for sleep when a ghealth-sleep- item exists for today", () => {
    const ctx = buildCoachContextFromData({
      items: [makeItem({ id: "ghealth-sleep-abc123", type: "sleep" })],
      profile: null,
      raceGoal: null,
      racePlan: null,
    });
    expect(ctx.autoSyncedToday.sleep).toBe(true);
    expect(ctx.autoSyncedToday.workout).toBe(false);
  });

  it("is true for workout when a ghealth-exercise- item exists for today", () => {
    const ctx = buildCoachContextFromData({
      items: [makeItem({ id: "ghealth-exercise-xyz789", type: "workout" })],
      profile: null,
      raceGoal: null,
      racePlan: null,
    });
    expect(ctx.autoSyncedToday.workout).toBe(true);
    expect(ctx.autoSyncedToday.sleep).toBe(false);
  });

  it("ignores a ghealth-synced item from a previous day", () => {
    const ctx = buildCoachContextFromData({
      items: [makeItem({ id: "ghealth-sleep-old", type: "sleep", dateKey: "2020-01-01" })],
      profile: null,
      raceGoal: null,
      racePlan: null,
    });
    expect(ctx.autoSyncedToday.sleep).toBe(false);
  });
});
