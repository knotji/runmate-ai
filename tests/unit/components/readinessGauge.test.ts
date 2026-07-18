import { describe, it, expect } from "vitest";
import { getGaugeStatus } from "@/lib/readiness/gaugeStatus";
import type { CoachContext } from "@/lib/buildCoachContext";

// Minimal CoachContext stub for testing
function makeCtx(overrides: Partial<CoachContext> = {}): CoachContext {
  return {
    sickRiskLevel: null,
    activePain: false,
    latestPain: null,
    ...overrides,
  } as unknown as CoachContext;
}

function makePain(painLevel: number) {
  return {
    hasActivePain: true,
    painLevel,
    painLocation: "เข่า",
    riskLevel: "high" as const,
    resolved: false,
    hasResolvedPain: false,
    painStatus: "active" as const,
  };
}

describe("getGaugeStatus", () => {
  it("returns 'risk' for sick hard-stop regardless of score", () => {
    const ctx = makeCtx({ sickRiskLevel: "hard_stop" });
    expect(getGaugeStatus(80, ctx)).toBe("risk");
    expect(getGaugeStatus(null, ctx)).toBe("risk");
  });

  it("returns 'risk' for active pain >= 3", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePain(3),
    });
    expect(getGaugeStatus(75, ctx)).toBe("risk");
  });

  it("does NOT return 'risk' for pain level < 3", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePain(2),
    });
    // Pain level 2 should not trigger risk — falls through to score-based check
    expect(getGaugeStatus(76, ctx)).toBe("good");
  });

  it("returns 'unknown' for null score with no overrides", () => {
    expect(getGaugeStatus(null, null)).toBe("unknown");
    expect(getGaugeStatus(null, makeCtx())).toBe("unknown");
  });

  // Thresholds (66/50) match getRunMateReadinessLabel's canonical Good/Fair/Low
  // buckets exactly, so the ring color never disagrees with the "N Readiness
  // Label" chip rendered next to it for the same score.
  it("returns 'good' for score >= 66", () => {
    expect(getGaugeStatus(66, null)).toBe("good");
    expect(getGaugeStatus(100, null)).toBe("good");
    expect(getGaugeStatus(80, makeCtx())).toBe("good");
  });

  it("returns 'fair' for score 50–65", () => {
    expect(getGaugeStatus(50, null)).toBe("fair");
    expect(getGaugeStatus(65, null)).toBe("fair");
    expect(getGaugeStatus(60, makeCtx())).toBe("fair");
  });

  it("returns 'recovery' for score < 50", () => {
    expect(getGaugeStatus(0, null)).toBe("recovery");
    expect(getGaugeStatus(49, null)).toBe("recovery");
    expect(getGaugeStatus(20, makeCtx())).toBe("recovery");
  });
});
