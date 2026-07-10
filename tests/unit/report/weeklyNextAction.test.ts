import { describe, expect, it } from "vitest";
import { buildWeeklyNextAction } from "@/lib/report/weeklyNextAction";
import type { WeeklyReview } from "@/lib/weeklyReview";

function makeReview(overrides: Partial<WeeklyReview> = {}): WeeklyReview {
  return {
    runningKmTotal: 20,
    runCount: 3,
    strengthCount: 1,
    walkCount: 0,
    avgSleepHours: 7.2,
    sleepNights: 5,
    avgReadiness: 72,
    readinessCount: 5,
    mealCount: 14,
    painDays: 0,
    activePainDays: 0,
    resolvedPainCount: 0,
    highlights: [],
    cautions: [],
    nextFocus: [],
    avgRecoveryScore: 72,
    loadLevel: "ปานกลาง",
    sleepDebtLevel: "ไม่มี",
    fuelSupportLevel: "ปานกลาง",
    painStatusText: "ไม่มีอาการเจ็บ",
    recoveryTrendSummaryText: "",
    avgLoadScore: 50,
    avgSleepScore: 70,
    avgFuelScore: 65,
    ...overrides,
  };
}

describe("buildWeeklyNextAction", () => {
  it("returns null when no data exists", () => {
    const review = makeReview({ runCount: 0, sleepNights: 0, activePainDays: 0 });
    expect(buildWeeklyNextAction({ review })).toBeNull();
  });

  it("prioritizes sick days over everything else", () => {
    const review = makeReview({ activePainDays: 3, loadLevel: "สูงมาก" });
    const result = buildWeeklyNextAction({ review, sickDaysThisWeek: 2 });
    expect(result).toBe("พักก่อนจนกว่าอาการป่วยจะดีขึ้น");
  });

  it("handles active pain (multiple days)", () => {
    const review = makeReview({ activePainDays: 2, loadLevel: "ปานกลาง" });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("พักและประเมินอาการเจ็บ");
  });

  it("handles single active pain day", () => {
    const review = makeReview({ activePainDays: 1 });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("ระวังอาการเจ็บ");
  });

  it("handles very high load", () => {
    const review = makeReview({ loadLevel: "สูงมาก", activePainDays: 0 });
    const result = buildWeeklyNextAction({ review });
    expect(result).toBe("ลดโหลด 1–2 วัน แล้วค่อยกลับเข้าแผน");
  });

  it("handles high sleep debt", () => {
    const review = makeReview({ sleepDebtLevel: "สูง", loadLevel: "ปานกลาง" });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("easy ให้เบาจริง");
    expect(result).toContain("7 ชม");
  });

  it("handles low average sleep hours (<6)", () => {
    const review = makeReview({ avgSleepHours: 5.5, sleepDebtLevel: "ไม่มี", loadLevel: "ปานกลาง" });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("easy ให้เบาจริง");
  });

  it("handles high load (not very high)", () => {
    const review = makeReview({ loadLevel: "สูง", sleepDebtLevel: "ไม่มี" });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("คุมโหลดต่อเนื่อง");
  });

  it("handles low fuel support", () => {
    const review = makeReview({ fuelSupportLevel: "ต่ำ", loadLevel: "ปานกลาง" });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("โปรตีน");
  });

  it("returns positive action when low load and good recovery", () => {
    const review = makeReview({
      loadLevel: "ต่ำ",
      avgRecoveryScore: 75,
      activePainDays: 0,
      sleepDebtLevel: "ไม่มี",
    });
    const result = buildWeeklyNextAction({ review });
    expect(result).toContain("ขยับโหลดได้");
  });

  it("returns maintenance action for good overall state", () => {
    const review = makeReview({
      loadLevel: "ปานกลาง",
      avgRecoveryScore: 75,
      sleepDebtLevel: "ไม่มี",
      activePainDays: 0,
    });
    const result = buildWeeklyNextAction({ review });
    expect(result).not.toBeNull();
  });
});
