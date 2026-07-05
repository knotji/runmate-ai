import { describe, it, expect } from "vitest";
import { buildGoalProgressInsight } from "@/lib/report/goalProgressInsight";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goals/goalProfile";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";
import type { WeeklyReview } from "@/lib/weeklyReview";

const emptyReview: WeeklyReview = {
  runningKmTotal: 0,
  runCount: 0,
  strengthCount: 0,
  walkCount: 0,
  avgSleepHours: null,
  sleepNights: 0,
  avgReadiness: null,
  readinessCount: 0,
  mealCount: 0,
  painDays: 0,
  activePainDays: 0,
  resolvedPainCount: 0,
  highlights: [],
  cautions: [],
  nextFocus: [],
  avgRecoveryScore: null,
  loadLevel: "ปานกลาง",
  sleepDebtLevel: "ไม่มี",
  fuelSupportLevel: "ปานกลาง",
  painStatusText: "",
  recoveryTrendSummaryText: "",
  avgLoadScore: null,
  avgSleepScore: null,
  avgFuelScore: null,
};

function makeProfile(override: Partial<UserGoalProfile> = {}): UserGoalProfile {
  return { ...DEFAULT_GOAL_PROFILE, ...override };
}

function makeReview(override: Partial<WeeklyReview> = {}): WeeklyReview {
  return { ...emptyReview, ...override };
}

describe("buildGoalProgressInsight", () => {
  it("returns null when no data", () => {
    expect(buildGoalProgressInsight(makeProfile(), emptyReview)).toBeNull();
  });

  it("pain days override goal insight with caution", () => {
    const review = makeReview({ runCount: 3, runningKmTotal: 20, activePainDays: 3 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "race_performance" }), review);
    expect(result).not.toBeNull();
    expect(result!.tone).toBe("caution");
    expect(result!.summaryTh).toContain("เจ็บ");
  });

  it("race_performance with good run count → positive", () => {
    const review = makeReview({ runCount: 4, runningKmTotal: 40, loadLevel: "สูง" });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "race_performance" }), review);
    expect(result!.tone).toBe("positive");
    expect(result!.summaryTh).toContain("สม่ำเสมอ");
  });

  it("race_performance overload → caution", () => {
    const review = makeReview({ runCount: 6, runningKmTotal: 80, loadLevel: "สูงมาก" });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "race_performance" }), review);
    expect(result!.tone).toBe("caution");
    expect(result!.summaryTh).toContain("cutback");
  });

  it("running_consistency 3+ runs → positive", () => {
    const review = makeReview({ runCount: 4, runningKmTotal: 30 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "running_consistency" }), review);
    expect(result!.tone).toBe("positive");
    expect(result!.summaryTh).toContain("สม่ำเสมอ");
  });

  it("running_consistency 1 run → neutral", () => {
    const review = makeReview({ runCount: 1, runningKmTotal: 5 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "running_consistency" }), review);
    expect(result!.tone).toBe("neutral");
    expect(result!.summaryTh).toContain("สม่ำเสมอ");
  });

  it("fat_loss with poor sleep → caution", () => {
    const review = makeReview({ runCount: 3, runningKmTotal: 20, avgSleepHours: 5.5, sleepNights: 5, sleepDebtLevel: "สูง" });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "fat_loss" }), review);
    expect(result!.tone).toBe("caution");
    expect(result!.summaryTh).toContain("นอน");
  });

  it("fat_loss with workouts and good sleep → positive", () => {
    const review = makeReview({ runCount: 3, strengthCount: 2, runningKmTotal: 20 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "fat_loss" }), review);
    expect(result!.tone).toBe("positive");
  });

  it("injury_recovery with pain → caution", () => {
    const review = makeReview({ activePainDays: 2, sleepNights: 5 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "injury_recovery" }), review);
    expect(result!.tone).toBe("caution");
  });

  it("injury_prevention without pain and with runs → positive", () => {
    const review = makeReview({ runCount: 3, sleepNights: 5, activePainDays: 0 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "injury_prevention" }), review);
    expect(result!.tone).toBe("positive");
  });

  it("sleep_better with good sleep → positive", () => {
    const review = makeReview({ sleepNights: 6, avgSleepHours: 7.5 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "sleep_better" }), review);
    expect(result!.tone).toBe("positive");
    expect(result!.summaryTh).toContain("7.5");
  });

  it("sleep_better with high sleep debt → caution", () => {
    const review = makeReview({ sleepNights: 5, avgSleepHours: 5.5, sleepDebtLevel: "สูง" });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "sleep_better" }), review);
    expect(result!.tone).toBe("caution");
  });

  it("returns label matching primaryGoal", () => {
    const review = makeReview({ runCount: 2, runningKmTotal: 15 });
    const result = buildGoalProgressInsight(makeProfile({ primaryGoal: "running_consistency" }), review);
    expect(result!.label).toBe("วิ่งสม่ำเสมอ");
  });
});
