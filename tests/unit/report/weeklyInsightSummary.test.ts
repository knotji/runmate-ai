import { describe, expect, it } from "vitest";
import { buildWeeklyInsightSummary } from "@/lib/report/weeklyInsightSummary";
import type { WeeklyReview } from "@/lib/weeklyReview";

function makeReview(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    runningKmTotal: 0,
    runCount: 0,
    strengthCount: 0,
    walkCount: 0,
    avgSleepHours: 7.5,
    sleepNights: 5,
    avgReadiness: 72,
    readinessCount: 5,
    mealCount: 10,
    painDays: 0,
    activePainDays: 0,
    resolvedPainCount: 0,
    highlights: [],
    cautions: [],
    nextFocus: [],
    avgRecoveryScore: 72,
    loadLevel: "ปานกลาง",
    sleepDebtLevel: "ไม่มี",
    fuelSupportLevel: "สูง",
    painStatusText: "ไม่มีอาการเจ็บ",
    recoveryTrendSummaryText: "",
    avgLoadScore: 50,
    avgSleepScore: 75,
    avgFuelScore: 68,
    ...overrides,
  };
}

describe("buildWeeklyInsightSummary", () => {
  it("no data at all → null", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      runCount: 0, sleepNights: 0, activePainDays: 0,
    }));
    expect(result).toBeNull();
  });

  it("active pain 3+ days → pain summary prioritized", () => {
    const result = buildWeeklyInsightSummary(makeReview({ activePainDays: 3 }));
    expect(result).not.toBeNull();
    expect(result).toContain("3 วัน");
    expect(result).toContain("ฟื้นตัว");
  });

  it("active pain 1 day → pain mention with caution", () => {
    const result = buildWeeklyInsightSummary(makeReview({ activePainDays: 1 }));
    expect(result).not.toBeNull();
    expect(result).toContain("1 วัน");
  });

  it("high load → km + warning about heavy week", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      runCount: 5,
      runningKmTotal: 60,
      loadLevel: "สูงมาก",
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("60");
    expect(result).toContain("สูงมาก");
  });

  it("low load with no pain → km + suggest increase", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      runCount: 2,
      runningKmTotal: 15,
      loadLevel: "ต่ำ",
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("15");
    expect(result).toContain("ขยับได้");
  });

  it("high sleep debt → sleep warning", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      sleepNights: 5,
      sleepDebtLevel: "สูง",
      avgSleepHours: 5.5,
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("นอน");
  });

  it("good sleep only (no runs, no pain) → sleep positive message", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      runCount: 0,
      activePainDays: 0,
      sleepNights: 6,
      sleepDebtLevel: "ไม่มี",
      avgSleepHours: 7.8,
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("นอน");
    expect(result).toContain("ดี");
  });

  it("low recovery score fallback → recovery warning", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      runCount: 0,
      sleepNights: 3,
      avgRecoveryScore: 42,
      sleepDebtLevel: "ไม่มี",
      avgSleepHours: 7.0,
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("ฟื้นตัว");
  });

  it("normal week → returns non-null summary with km", () => {
    const result = buildWeeklyInsightSummary(makeReview({
      runCount: 3,
      runningKmTotal: 25,
      loadLevel: "ปานกลาง",
    }));
    expect(result).not.toBeNull();
    expect(result).toContain("25");
  });
});
