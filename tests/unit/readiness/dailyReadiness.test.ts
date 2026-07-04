import { describe, expect, it } from "vitest";
import { buildDailyReadiness } from "@/lib/readiness/dailyReadiness";
import { makeCtx, makeRecoverySys, makePainSummary } from "./fixtures";

describe("buildDailyReadiness — band", () => {
  it("active_pain → band = pain_risk regardless of readiness score", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(6),
      readinessV2: { score: 80, label: "Excellent", level: "green" } as never,
    });
    const dr = buildDailyReadiness(ctx);
    expect(dr.band).toBe("pain_risk");
  });

  it("readiness score >= 66 → band = green", () => {
    const ctx = makeCtx({
      readinessV2: { score: 70, label: "Good", level: "green" } as never,
    });
    expect(buildDailyReadiness(ctx).band).toBe("green");
  });

  it("readiness score 50–65 → band = yellow", () => {
    const ctx = makeCtx({
      readinessV2: { score: 58, label: "Fair", level: "yellow" } as never,
    });
    expect(buildDailyReadiness(ctx).band).toBe("yellow");
  });

  it("readiness score < 50 → band = red", () => {
    const ctx = makeCtx({
      readinessV2: { score: 42, label: "Low", level: "red" } as never,
    });
    expect(buildDailyReadiness(ctx).band).toBe("red");
  });

  it("no sleep data and no readiness → band = yellow (neutral, not danger)", () => {
    const ctx = makeCtx({ sleep7d: [], readinessV2: null });
    const dr = buildDailyReadiness(ctx);
    expect(dr.band).toBe("yellow");
    expect(dr.hasSleepData).toBe(false);
  });

  it("no meal data → hasFuelData = false, no fake bad energy state", () => {
    const ctx = makeCtx({ mealsToday: [], readinessV2: null });
    const dr = buildDailyReadiness(ctx);
    expect(dr.hasFuelData).toBe(false);
    const energySig = dr.signals.find((s) => s.key === "energy");
    // Missing meal data + no energyScore → neutral, NOT bad
    expect(energySig?.tone).toBe("neutral");
  });
});

describe("buildDailyReadiness — loadTarget", () => {
  it("pain_risk → loadTarget = rest", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(5),
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("rest");
  });

  it("isRaceToday → loadTarget = race", () => {
    const ctx = makeCtx({
      isRaceToday: true,
      readinessV2: { score: 72, label: "Good", level: "green" } as never,
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("race");
  });

  it("band = red → loadTarget = walk", () => {
    const ctx = makeCtx({
      readinessV2: { score: 38, label: "Low", level: "red" } as never,
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("walk");
  });

  it("band = green, load score <= 25 → loadTarget = build", () => {
    const ctx = makeCtx({
      readinessV2: { score: 80, label: "Excellent", level: "green" } as never,
      recoverySystem: makeRecoverySys({ loadScore: 20 }),
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("build");
  });

  it("band = yellow, high load → loadTarget = easy", () => {
    const ctx = makeCtx({
      readinessV2: { score: 55, label: "Fair", level: "yellow" } as never,
      recoverySystem: makeRecoverySys({ loadScore: 70 }),
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("easy");
  });
});

describe("buildDailyReadiness — pain recovery status overrides", () => {
  it("cleared_normal → does NOT force pain_risk band", () => {
    const ctx = makeCtx({
      activePain: false,
      painRecoveryStatus: "cleared_normal",
      readinessV2: { score: 72, label: "Good", level: "green" } as never,
    });
    const dr = buildDailyReadiness(ctx);
    expect(dr.band).not.toBe("pain_risk");
    expect(dr.band).toBe("green");
  });

  it("improving → loadTarget capped at easy even with green band + low load", () => {
    const ctx = makeCtx({
      activePain: false,
      painRecoveryStatus: "improving",
      readinessV2: { score: 75, label: "Good", level: "green" } as never,
      recoverySystem: makeRecoverySys({ loadScore: 20 }),
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("easy");
  });

  it("cleared_light → loadTarget capped at easy", () => {
    const ctx = makeCtx({
      activePain: false,
      painRecoveryStatus: "cleared_light",
      readinessV2: { score: 75, label: "Good", level: "green" } as never,
      recoverySystem: makeRecoverySys({ loadScore: 20 }),
    });
    expect(buildDailyReadiness(ctx).loadTarget).toBe("easy");
  });

  it("active_pain still overrides band to pain_risk even when painRecoveryStatus says cleared", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(5),
      painRecoveryStatus: "cleared_normal",
    });
    expect(buildDailyReadiness(ctx).band).toBe("pain_risk");
  });
});

describe("buildDailyReadiness — reasons and avoid/allow", () => {
  it("active pain → reason includes pain_active key", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(4),
    });
    const dr = buildDailyReadiness(ctx);
    expect(dr.reasons.some((r) => r.key === "pain_active")).toBe(true);
  });

  it("pain_risk band → avoid includes 'วิ่ง'", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(5),
    });
    const dr = buildDailyReadiness(ctx);
    expect(dr.avoid.some((a) => a.includes("วิ่ง"))).toBe(true);
  });

  it("green band with race tomorrow → avoid includes 'วิ่งหนัก'", () => {
    const ctx = makeCtx({
      isRaceTomorrow: true,
      readinessV2: { score: 75, label: "Good", level: "green" } as never,
    });
    const dr = buildDailyReadiness(ctx);
    expect(dr.avoid.some((a) => a.includes("วิ่งหนัก"))).toBe(true);
  });
});
