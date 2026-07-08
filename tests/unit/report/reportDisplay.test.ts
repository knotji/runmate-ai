import { describe, it, expect } from "vitest";
import {
  formatSelectedPeriodRunDistance,
  formatActivityCount,
  formatWorkoutTimelineTitle,
  getDayWorkoutAbsenceLabel,
  getTimelineItemSubtitle,
} from "@/lib/report/reportDisplay";

// ─── formatSelectedPeriodRunDistance ─────────────────────────────────────────

describe("formatSelectedPeriodRunDistance", () => {
  it("returns '0 กม.' when distance is zero — no broken dash", () => {
    expect(formatSelectedPeriodRunDistance(0)).toBe("0 กม.");
  });

  it("never returns '—' for a valid period", () => {
    expect(formatSelectedPeriodRunDistance(0)).not.toBe("—");
  });

  it("returns formatted distance when > 0", () => {
    expect(formatSelectedPeriodRunDistance(10.5)).toBe("10.5 กม.");
  });

  it("returns formatted distance for whole numbers", () => {
    expect(formatSelectedPeriodRunDistance(42)).toBe("42 กม.");
  });
});

// ─── formatActivityCount ──────────────────────────────────────────────────────

describe("formatActivityCount", () => {
  it("returns '0 วัน' when count is zero — no broken dash", () => {
    expect(formatActivityCount(0)).toBe("0 วัน");
  });

  it("never returns '—' for a valid period", () => {
    expect(formatActivityCount(0)).not.toBe("—");
  });

  it("returns formatted count when > 0", () => {
    expect(formatActivityCount(3)).toBe("3 วัน");
  });

  it("handles single day correctly", () => {
    expect(formatActivityCount(1)).toBe("1 วัน");
  });
});

// ─── formatWorkoutTimelineTitle ───────────────────────────────────────────────

describe("formatWorkoutTimelineTitle — swim", () => {
  it("renders distance in metres, not km", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: true, distanceM: 275, duration: "26:54" });
    expect(result).toContain("275 ม.");
    expect(result).not.toContain("กม.");
  });

  it("never renders swim pace or distance as /km", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: true, distanceM: 1000 });
    expect(result).not.toContain("/กม.");
    expect(result).not.toContain("กม.");
  });

  it("uses default label 'ว่ายน้ำ' when no swimLabel", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: true, distanceM: 400 });
    expect(result).toMatch(/^ว่ายน้ำ/);
  });

  it("uses custom swimLabel for recovery swim", () => {
    const result = formatWorkoutTimelineTitle({
      isSwim: true,
      swimLabel: "Recovery Swim",
      distanceM: 200,
    });
    expect(result).toMatch(/^Recovery Swim/);
    expect(result).toContain("200 ม.");
  });

  it("includes duration when provided", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: true, distanceM: 275, duration: "26:54" });
    expect(result).toContain("26:54");
  });

  it("does not include standalone 'ม.' (metres) in a non-swim run entry", () => {
    const result = formatWorkoutTimelineTitle({
      isSwim: false,
      workoutKind: "outdoor_run",
      distanceKm: 10.3,
    });
    // "กม." is expected; " ม." (a bare metres suffix) must not appear
    expect(result).not.toMatch(/\d+\s*ม\./);
    expect(result).toContain("กม.");
  });
});

describe("formatWorkoutTimelineTitle — run / other", () => {
  it("renders outdoor_run with km", () => {
    const result = formatWorkoutTimelineTitle({
      isSwim: false,
      workoutKind: "outdoor_run",
      distanceKm: 10.3,
      duration: "1:09:47",
    });
    expect(result).toContain("10.3 กม.");
    expect(result).toContain("1:09:47");
  });

  it("falls back to 'ออกกำลังกาย' for unknown kind", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: false, workoutKind: "unknown_kind" });
    expect(result).toBe("ออกกำลังกาย");
  });

  it("renders walk label correctly", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: false, workoutKind: "walk" });
    expect(result).toBe("เดิน");
  });

  it("renders strength label correctly", () => {
    const result = formatWorkoutTimelineTitle({ isSwim: false, workoutKind: "strength" });
    expect(result).toBe("เวท");
  });
});

// ─── getDayWorkoutAbsenceLabel ────────────────────────────────────────────────

describe("getDayWorkoutAbsenceLabel", () => {
  it("returns 'ยังไม่มีการซ้อม' when day has some data but no workout", () => {
    expect(getDayWorkoutAbsenceLabel(true)).toBe("ยังไม่มีการซ้อม");
  });

  it("returns 'ยังไม่มีข้อมูล' when day has no data at all", () => {
    expect(getDayWorkoutAbsenceLabel(false)).toBe("ยังไม่มีข้อมูล");
  });
});

// ─── getTimelineItemSubtitle ──────────────────────────────────────────────────

describe("getTimelineItemSubtitle — workout", () => {
  it("shows HR and calories when both present", () => {
    const result = getTimelineItemSubtitle({ type: "workout", avgHR: 148.7, calories: 430 });
    expect(result).toBe("HR 149 · 430 kcal");
  });

  it("shows only HR when calories absent", () => {
    const result = getTimelineItemSubtitle({ type: "workout", avgHR: 155, calories: null });
    expect(result).toBe("HR 155");
  });

  it("shows only kcal when HR absent", () => {
    const result = getTimelineItemSubtitle({ type: "workout", avgHR: null, calories: 300 });
    expect(result).toBe("300 kcal");
  });

  it("returns empty string when both absent", () => {
    const result = getTimelineItemSubtitle({ type: "workout", avgHR: null, calories: null });
    expect(result).toBe("");
  });
});

describe("getTimelineItemSubtitle — sleep", () => {
  it("shows score when present", () => {
    expect(getTimelineItemSubtitle({ type: "sleep", sleepScore: 82 })).toBe("คะแนน 82");
  });

  it("returns empty string when score absent", () => {
    expect(getTimelineItemSubtitle({ type: "sleep", sleepScore: null })).toBe("");
  });
});

describe("getTimelineItemSubtitle — meal", () => {
  it("shows protein and calories when both present", () => {
    const result = getTimelineItemSubtitle({ type: "meal", proteinG: 38.6, caloriesKcal: 620 });
    expect(result).toBe("โปรตีน 39g · 620 kcal");
  });

  it("shows only protein when calories absent", () => {
    const result = getTimelineItemSubtitle({ type: "meal", proteinG: 25, caloriesKcal: null });
    expect(result).toBe("โปรตีน 25g");
  });

  it("returns empty string when both absent", () => {
    const result = getTimelineItemSubtitle({ type: "meal", proteinG: null, caloriesKcal: null });
    expect(result).toBe("");
  });
});

describe("getTimelineItemSubtitle — other types", () => {
  it("returns empty string for pain", () => {
    expect(getTimelineItemSubtitle({ type: "pain" })).toBe("");
  });

  it("returns empty string for body", () => {
    expect(getTimelineItemSubtitle({ type: "body" })).toBe("");
  });

  it("returns empty string for summary", () => {
    expect(getTimelineItemSubtitle({ type: "summary" })).toBe("");
  });
});
