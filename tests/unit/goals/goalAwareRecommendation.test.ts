import { describe, it, expect } from "vitest";
import { buildGoalAwareRecommendation } from "@/lib/goals/goalAwareRecommendation";
import { DEFAULT_GOAL_PROFILE } from "@/lib/goals/goalProfile";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";

const base: UserGoalProfile = {
  ...DEFAULT_GOAL_PROFILE,
  primaryGoal: "running_consistency",
  secondaryGoals: [],
  guardrailGoals: [],
};

describe("buildGoalAwareRecommendation — pain/recovery overrides", () => {
  it("returns rest when hasPain is true, regardless of goal", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "race_performance" },
      band: "green",
      loadTarget: "build",
      hasPain: true,
    });
    expect(result.recommendedStimulus).toBe("rest");
    expect(result.intensityHint).toBe("rest");
    expect(result.blockedBy).toBe("pain");
  });

  it("returns rest when band is pain_risk", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: base,
      band: "pain_risk",
      loadTarget: "moderate",
      hasPain: false,
    });
    expect(result.blockedBy).toBe("pain");
  });

  it("returns walk when band is red", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: base,
      band: "red",
      loadTarget: "walk",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("walk");
    expect(result.intensityHint).toBe("easy");
    expect(result.blockedBy).toBe("recovery");
  });
});

describe("buildGoalAwareRecommendation — primary goal stimulus", () => {
  it("race_performance → run", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "race_performance" },
      band: "green",
      loadTarget: "build",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("run");
  });

  it("six_pack → strength", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "six_pack" },
      band: "green",
      loadTarget: "moderate",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("strength");
  });

  it("sleep_better → yoga", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "sleep_better" },
      band: "green",
      loadTarget: "easy",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("yoga");
  });

  it("general_health → walk (easy load)", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "general_health" },
      band: "yellow",
      loadTarget: "easy",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("walk");
  });
});

describe("buildGoalAwareRecommendation — load target caps", () => {
  it("loadTarget=rest forces rest stimulus and intensity", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "race_performance" },
      band: "yellow",
      loadTarget: "rest",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("rest");
    expect(result.intensityHint).toBe("rest");
  });

  it("loadTarget=walk downgrade run→walk and hard→easy", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "running_consistency" },
      band: "yellow",
      loadTarget: "walk",
      hasPain: false,
    });
    expect(result.recommendedStimulus).toBe("walk");
    expect(result.intensityHint).toBe("easy");
  });

  it("loadTarget=easy downgrade hard intensity to easy", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "race_performance" },
      band: "yellow",
      loadTarget: "easy",
      hasPain: false,
    });
    expect(result.intensityHint).toBe("easy");
    expect(result.recommendedStimulus).toBe("walk");
  });

  it("loadTarget=build allows hard intensity for race goal", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "race_performance" },
      band: "green",
      loadTarget: "build",
      hasPain: false,
    });
    expect(result.intensityHint).toBe("hard");
  });
});

describe("buildGoalAwareRecommendation — guardrail caps", () => {
  it("injury_prevention guardrail caps hard to easy", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: {
        ...base,
        primaryGoal: "race_performance",
        guardrailGoals: ["injury_prevention"],
      },
      band: "green",
      loadTarget: "build",
      hasPain: false,
    });
    expect(result.intensityHint).toBe("easy");
    expect(result.blockedBy).toBe("guardrail");
    expect(result.guardrailNotes.length).toBeGreaterThan(0);
  });

  it("stress_balance guardrail caps hard to easy", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: {
        ...base,
        primaryGoal: "race_performance",
        guardrailGoals: ["stress_balance"],
      },
      band: "green",
      loadTarget: "build",
      hasPain: false,
    });
    expect(result.intensityHint).toBe("easy");
    expect(result.blockedBy).toBe("guardrail");
  });

  it("guardrail does NOT block when intensity is already moderate", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: {
        ...base,
        primaryGoal: "running_consistency",
        guardrailGoals: ["injury_prevention"],
      },
      band: "green",
      loadTarget: "moderate",
      hasPain: false,
    });
    expect(result.blockedBy).toBeNull();
  });
});

describe("buildGoalAwareRecommendation — secondary notes", () => {
  it("fat_loss secondary adds strength note", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, secondaryGoals: ["fat_loss"] },
      band: "green",
      loadTarget: "moderate",
      hasPain: false,
    });
    expect(result.secondaryNotes.length).toBeGreaterThan(0);
    expect(result.secondaryNotes[0]).toContain("strength");
  });

  it("no secondary notes when secondaryGoals is empty", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: base,
      band: "green",
      loadTarget: "moderate",
      hasPain: false,
    });
    expect(result.secondaryNotes).toHaveLength(0);
  });
});

describe("buildGoalAwareRecommendation — Thai summary", () => {
  it("includes 'วิ่ง' for run stimulus", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: { ...base, primaryGoal: "running_consistency" },
      band: "green",
      loadTarget: "moderate",
      hasPain: false,
    });
    expect(result.summaryTh).toContain("วิ่ง");
  });

  it("returns 'พักสนิทวันนี้' for rest", () => {
    const result = buildGoalAwareRecommendation({
      goalProfile: base,
      band: "green",
      loadTarget: "rest",
      hasPain: false,
    });
    expect(result.summaryTh).toContain("พัก");
  });
});
