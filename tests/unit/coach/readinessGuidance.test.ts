import { describe, expect, it } from "vitest";
import { buildReadinessGuidance } from "@/app/api/coach-chat/route";

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    activePain: false,
    recentPainHistory: false,
    painResolved: false,
    painRecoveryStatus: null,
    readinessV2: { score: 70 },
    recoverySystem: {
      axes: {
        recovery: { score: 75 },
        load: { score: 40 },
        sleep: { score: 70 },
        fuel: { score: 65 },
      },
    },
    mealsToday: [{ mealType: "breakfast" }, { mealType: "lunch" }],
    totalRunKm: 20,
    isRaceToday: false,
    isRaceTomorrow: false,
    ...overrides,
  };
}

describe("buildReadinessGuidance", () => {
  it("returns DAILY_COACH_GUARDRAILS prefix", () => {
    const result = buildReadinessGuidance(makeCtx());
    expect(result).toContain("DAILY_COACH_GUARDRAILS");
  });

  it("high load + green band → capped to easy, guardrail mentions high load", () => {
    const result = buildReadinessGuidance(makeCtx({
      readinessV2: { score: 75 },
      recoverySystem: { axes: { recovery: { score: 80 }, load: { score: 75 }, sleep: { score: 70 }, fuel: { score: 60 } } },
    }));
    expect(result).toContain("loadTarget=easy");
    expect(result).toContain("HIGH");
  });

  it("cleared_normal + green band → no pain restriction, normal allow", () => {
    const result = buildReadinessGuidance(makeCtx({
      painRecoveryStatus: "cleared_normal",
      readinessV2: { score: 78 },
    }));
    expect(result).toContain("cleared_normal");
    expect(result).not.toContain("BLOCK");
    expect(result).not.toContain("Do NOT recommend running");
  });

  it("improving + green band → loadTarget capped at easy, pain guardrail present", () => {
    const result = buildReadinessGuidance(makeCtx({
      painRecoveryStatus: "improving",
      readinessV2: { score: 76 },
      recoverySystem: { axes: { recovery: { score: 80 }, load: { score: 30 }, sleep: { score: 75 }, fuel: { score: 65 } } },
    }));
    expect(result).toContain("loadTarget=easy");
    expect(result).toContain("improving");
    expect(result).toContain("interval");
  });

  it("active pain → band=pain_risk, BLOCK restriction in output", () => {
    const result = buildReadinessGuidance(makeCtx({ activePain: true }));
    expect(result).toContain("band=pain_risk");
    expect(result).toContain("BLOCK");
    expect(result).toContain("GUARDRAIL");
  });

  it("missing fuel (0 meals) → fuel note in signals", () => {
    const result = buildReadinessGuidance(makeCtx({ mealsToday: [] }));
    expect(result).toContain("no meal data");
  });

  it("1 meal → partial fuel note in signals", () => {
    const result = buildReadinessGuidance(makeCtx({
      mealsToday: [{ mealType: "breakfast" }],
    }));
    expect(result).toContain("partial data");
  });

  it("low sleep score → sleep shown as low in signals", () => {
    const result = buildReadinessGuidance(makeCtx({
      recoverySystem: { axes: { recovery: { score: 60 }, load: { score: 40 }, sleep: { score: 35 }, fuel: { score: 60 } } },
    }));
    expect(result).toContain("Sleep");
    expect(result).toContain("low");
  });

  it("red band → GUARDRAIL blocks tempo/interval", () => {
    const result = buildReadinessGuidance(makeCtx({
      readinessV2: { score: 38 },
    }));
    expect(result).toContain("band=red");
    expect(result).toContain("GUARDRAIL");
    expect(result).toContain("tempo");
  });

  it("race goal with target time → pace bands included in output", () => {
    const result = buildReadinessGuidance(makeCtx({
      raceGoal: { raceDistance: "10K", targetTime: "1:00:00" },
    }));
    expect(result).toContain("Pace bands");
    expect(result).toContain("10K");
    expect(result).toContain("allowed today");
  });

  it("race goal without target time → no pace bands line", () => {
    const result = buildReadinessGuidance(makeCtx({
      raceGoal: { raceDistance: "10K", targetTime: null },
    }));
    expect(result).not.toContain("Pace bands");
  });
});
