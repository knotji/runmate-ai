import { describe, it, expect } from "vitest";
import {
  DEFAULT_GOAL_PROFILE,
  validateGoalProfile,
  mergeGoalProfile,
  isValidGoalType,
  hasBodyGoal,
  hasRaceGoal,
  goalProfileSummaryTh,
} from "@/lib/goals/goalProfile";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";

describe("isValidGoalType", () => {
  it("accepts all defined goal types", () => {
    const validTypes = [
      "race_performance", "running_consistency", "general_health",
      "fat_loss", "six_pack", "muscle_gain", "injury_prevention",
      "injury_recovery", "sleep_better", "stress_balance",
    ];
    for (const t of validTypes) {
      expect(isValidGoalType(t)).toBe(true);
    }
  });

  it("rejects unknown strings", () => {
    expect(isValidGoalType("weight_loss")).toBe(false);
    expect(isValidGoalType("cardio")).toBe(false);
    expect(isValidGoalType("")).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isValidGoalType(null)).toBe(false);
    expect(isValidGoalType(42)).toBe(false);
    expect(isValidGoalType(undefined)).toBe(false);
  });
});

describe("validateGoalProfile", () => {
  it("falls back to default primary goal when invalid", () => {
    const result = validateGoalProfile({ primaryGoal: "invalid" as never });
    expect(result.primaryGoal).toBe(DEFAULT_GOAL_PROFILE.primaryGoal);
  });

  it("preserves valid primary goal", () => {
    const result = validateGoalProfile({ primaryGoal: "race_performance" });
    expect(result.primaryGoal).toBe("race_performance");
  });

  it("removes primary from secondary goals", () => {
    const result = validateGoalProfile({
      primaryGoal: "fat_loss",
      secondaryGoals: ["fat_loss", "sleep_better"],
    });
    expect(result.secondaryGoals).not.toContain("fat_loss");
    expect(result.secondaryGoals).toContain("sleep_better");
  });

  it("caps secondary goals at 2", () => {
    const result = validateGoalProfile({
      primaryGoal: "running_consistency",
      secondaryGoals: ["fat_loss", "sleep_better", "muscle_gain"],
    });
    expect(result.secondaryGoals.length).toBe(2);
  });

  it("filters invalid secondary goals", () => {
    const result = validateGoalProfile({
      secondaryGoals: ["fat_loss", "invalid_goal" as never],
    });
    expect(result.secondaryGoals).toEqual(["fat_loss"]);
  });

  it("uses default guardrails when none provided", () => {
    const result = validateGoalProfile({ primaryGoal: "general_health", guardrailGoals: [] });
    expect(result.guardrailGoals).toEqual(DEFAULT_GOAL_PROFILE.guardrailGoals);
  });

  it("preserves valid guardrail goals", () => {
    const result = validateGoalProfile({
      guardrailGoals: ["injury_prevention", "stress_balance"],
    });
    expect(result.guardrailGoals).toContain("injury_prevention");
    expect(result.guardrailGoals).toContain("stress_balance");
  });

  it("defaults raceGoal to disabled when omitted", () => {
    const result = validateGoalProfile({});
    expect(result.raceGoal).toEqual({ enabled: false });
  });

  it("defaults bodyGoal to disabled when omitted", () => {
    const result = validateGoalProfile({});
    expect(result.bodyGoal).toEqual({ enabled: false });
  });

  it("preserves raceGoal when provided", () => {
    const raceGoal = { enabled: true, distanceKm: 42.195, raceDate: "2026-12-01" };
    const result = validateGoalProfile({ raceGoal });
    expect(result.raceGoal).toEqual(raceGoal);
  });

  it("preserves updatedAt", () => {
    const result = validateGoalProfile({ updatedAt: "2026-07-05T00:00:00Z" });
    expect(result.updatedAt).toBe("2026-07-05T00:00:00Z");
  });
});

describe("mergeGoalProfile", () => {
  it("merges updates onto existing profile", () => {
    const existing: UserGoalProfile = {
      primaryGoal: "running_consistency",
      secondaryGoals: [],
      guardrailGoals: ["injury_prevention"],
      raceGoal: { enabled: false },
      bodyGoal: { enabled: false },
      lifestyleGoal: {},
    };
    const result = mergeGoalProfile(existing, { primaryGoal: "race_performance" });
    expect(result.primaryGoal).toBe("race_performance");
    expect(result.guardrailGoals).toEqual(["injury_prevention"]);
  });

  it("falls back to DEFAULT when existing is null", () => {
    const result = mergeGoalProfile(null, { primaryGoal: "fat_loss" });
    expect(result.primaryGoal).toBe("fat_loss");
    expect(result.guardrailGoals).toEqual(DEFAULT_GOAL_PROFILE.guardrailGoals);
  });
});

describe("hasBodyGoal", () => {
  it("returns true when primaryGoal is body-related", () => {
    expect(hasBodyGoal({ ...DEFAULT_GOAL_PROFILE, primaryGoal: "fat_loss" })).toBe(true);
    expect(hasBodyGoal({ ...DEFAULT_GOAL_PROFILE, primaryGoal: "six_pack" })).toBe(true);
    expect(hasBodyGoal({ ...DEFAULT_GOAL_PROFILE, primaryGoal: "muscle_gain" })).toBe(true);
  });

  it("returns true when body goal is in secondary goals", () => {
    const profile: UserGoalProfile = { ...DEFAULT_GOAL_PROFILE, secondaryGoals: ["fat_loss"] };
    expect(hasBodyGoal(profile)).toBe(true);
  });

  it("returns false for non-body goals", () => {
    expect(hasBodyGoal(DEFAULT_GOAL_PROFILE)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(hasBodyGoal(null)).toBe(false);
    expect(hasBodyGoal(undefined)).toBe(false);
  });
});

describe("hasRaceGoal", () => {
  it("returns true when primaryGoal is race_performance", () => {
    expect(hasRaceGoal({ ...DEFAULT_GOAL_PROFILE, primaryGoal: "race_performance" })).toBe(true);
  });

  it("returns true when raceGoal.enabled is true", () => {
    const profile: UserGoalProfile = {
      ...DEFAULT_GOAL_PROFILE,
      raceGoal: { enabled: true, distanceKm: 21 },
    };
    expect(hasRaceGoal(profile)).toBe(true);
  });

  it("returns false when no race goal configured", () => {
    expect(hasRaceGoal(DEFAULT_GOAL_PROFILE)).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(hasRaceGoal(null)).toBe(false);
  });
});

describe("goalProfileSummaryTh", () => {
  it("includes primary goal label", () => {
    const summary = goalProfileSummaryTh(DEFAULT_GOAL_PROFILE);
    expect(summary).toContain("วิ่งสม่ำเสมอ");
  });

  it("includes secondary goals when present", () => {
    const profile: UserGoalProfile = {
      ...DEFAULT_GOAL_PROFILE,
      secondaryGoals: ["fat_loss", "sleep_better"],
    };
    const summary = goalProfileSummaryTh(profile);
    expect(summary).toContain("รอง:");
    expect(summary).toContain("ลดพุง");
    expect(summary).toContain("นอนให้ดีขึ้น");
  });

  it("omits secondary line when empty", () => {
    const summary = goalProfileSummaryTh(DEFAULT_GOAL_PROFILE);
    expect(summary).not.toContain("รอง:");
  });

  it("includes guardrail goals", () => {
    const summary = goalProfileSummaryTh(DEFAULT_GOAL_PROFILE);
    expect(summary).toContain("กันพลาด:");
    expect(summary).toContain("ไม่เจ็บซ้ำ");
  });
});
