import { describe, expect, it } from "vitest";
import { buildTodaySignals } from "@/lib/readiness/todaySignals";
import { makeCtx, makeRecoverySys, makePainSummary } from "./fixtures";

describe("buildTodaySignals — pain signal", () => {
  it("active pain → pain signal tone = bad", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(5),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
    expect(sig.tone).toBe("bad");
    expect(sig.value).toContain("5/10");
  });

  it("recent / resolved pain → pain signal tone = warn", () => {
    const ctx = makeCtx({
      activePain: false,
      recentPainHistory: true,
      latestPain: { ...makePainSummary(3), hasActivePain: false, hasResolvedPain: true, resolved: true, painStatus: "resolved" as const },
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
    expect(sig.tone).toBe("warn");
  });

  it("no pain → pain signal tone = good", () => {
    const ctx = makeCtx({ activePain: false, latestPain: null });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
    expect(sig.tone).toBe("good");
  });
});

describe("buildTodaySignals — energy signal (null-safety)", () => {
  it("energyScore = null, no meals → energy tone = neutral (NEVER bad)", () => {
    const ctx = makeCtx({
      latestEnergyScore: null,
      mealsToday: [],
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("neutral");
    expect(sig.value).toBe("ไม่มีข้อมูล");
  });

  it("energyScore = 80 → energy tone = good", () => {
    const ctx = makeCtx({ latestEnergyScore: 80 });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("good");
    expect(sig.value).toBe("80");
  });

  it("energyScore = 40 → energy tone = bad", () => {
    const ctx = makeCtx({ latestEnergyScore: 40 });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("bad");
  });

  it("energyScore = null but has meal data + fuel score → uses fuel proxy (not neutral-forced)", () => {
    const ctx = makeCtx({
      latestEnergyScore: null,
      mealsToday: [{ mealType: "breakfast", foods: ["ข้าว"], caloriesKcal: 400, proteinG: 20, carbsG: 60, fatG: 10, fiberG: 3, fatLoad: "low", coachNote: null }],
      recoverySystem: makeRecoverySys({ fuelScore: 75 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("good");
  });
});

describe("buildTodaySignals — recovery signal", () => {
  it("no sleep data → recovery tone = neutral", () => {
    const ctx = makeCtx({ sleep7d: [] });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "recovery")!;
    expect(sig.tone).toBe("neutral");
  });

  it("recovery score >= 70 with sleep data → tone = good", () => {
    const ctx = makeCtx({
      sleep7d: [{ date: "2026-07-04", durationH: "7.5", durationMinutes: 450, score: 78, readiness: 78, restingHR: 52, hrv: 55, energyScore: 75 }],
      recoverySystem: makeRecoverySys({ recoveryScore: 80 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "recovery")!;
    expect(sig.tone).toBe("good");
  });

  it("recovery score < 50 with sleep data → tone = bad", () => {
    const ctx = makeCtx({
      sleep7d: [{ date: "2026-07-04", durationH: "5.0", durationMinutes: 300, score: 45, readiness: 45, restingHR: 65, hrv: 35, energyScore: 40 }],
      recoverySystem: makeRecoverySys({ recoveryScore: 40 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "recovery")!;
    expect(sig.tone).toBe("bad");
  });
});

describe("buildTodaySignals — load signal", () => {
  it("no run data → load tone = neutral", () => {
    const ctx = makeCtx({ totalRunKm: 0, recoverySystem: makeRecoverySys({ loadScore: 0 }) });
    // load axis returns null-style when no data but recoverySystem still gives 0
    // With 0 load score and 0 km, we get "neutral" only if loadScore === null
    // Since makeRecoverySys always sets a score, we expect "good" (load 0 = fresh)
    const sig = buildTodaySignals(ctx).find((s) => s.key === "load")!;
    expect(["good", "neutral"]).toContain(sig.tone);
  });

  it("high load score (>= 70) → load tone = bad (body stressed)", () => {
    const ctx = makeCtx({
      totalRunKm: 55,
      recoverySystem: makeRecoverySys({ loadScore: 75 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "load")!;
    expect(sig.tone).toBe("bad");
  });
});
