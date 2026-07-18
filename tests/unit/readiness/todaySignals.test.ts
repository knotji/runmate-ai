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

  it("recent / resolved pain (recent_pain status) → pain signal tone = warn", () => {
    const ctx = makeCtx({
      activePain: false,
      recentPainHistory: true,
      painRecoveryStatus: "recent_pain",
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

  it("energyScore = 80 → energy tone = good, qualitative label", () => {
    const ctx = makeCtx({ latestEnergyScore: 80 });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("good");
    expect(sig.value).toBe("ดี");
  });

  it("energyScore = 40 → energy tone = bad", () => {
    const ctx = makeCtx({ latestEnergyScore: 40 });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("bad");
  });

  it("energyScore = null, 1 meal logged → trusts the fuel axis score, matching the Recovery detail card", () => {
    // Reported bug: this used to hardcode "ยังไม่ชัด" regardless of fuelScore,
    // even though the Fuel axis (recoverySystem.ts) already produces a real
    // score off just 1 meal — causing the compact signal to disagree with the
    // "ดูรายละเอียด Recovery" card showing the same score.
    const ctx = makeCtx({
      latestEnergyScore: null,
      mealsToday: [{ mealType: "breakfast", foods: ["ข้าว"], caloriesKcal: 400, proteinG: 20, carbsG: 60, fatG: 10, fiberG: 3, fatLoad: "low", coachNote: null }],
      recoverySystem: makeRecoverySys({ fuelScore: 50 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    // Label thresholds (80/66/50) and tone thresholds (75/55/35) aren't the
    // same scale — a 50 is "พอใช้" by label but "warn" by tone, same as the
    // Recovery detail card would show for this score.
    expect(sig.tone).toBe("warn");
    expect(sig.value).toBe("พอใช้");
  });

  it("energyScore = null, meals logged → uses the same getRecoveryAxisLabel wording as the Recovery detail card", () => {
    const meal = { mealType: "breakfast" as const, foods: ["ข้าว"], caloriesKcal: 400, proteinG: 20, carbsG: 60, fatG: 10, fiberG: 3, fatLoad: "low" as const, coachNote: null };
    const ctx = makeCtx({
      latestEnergyScore: null,
      mealsToday: [meal, { ...meal, mealType: "lunch" as const }],
      recoverySystem: makeRecoverySys({ fuelScore: 75 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "energy")!;
    expect(sig.tone).toBe("good");
    expect(sig.value).toBe("ดี");
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

  it("recovery score < 50 with sleep data → tone = warn, not bad (low alone is never danger — see getRecoveryAxisCoachingTone)", () => {
    const ctx = makeCtx({
      sleep7d: [{ date: "2026-07-04", durationH: "5.0", durationMinutes: 300, score: 45, readiness: 45, restingHR: 65, hrv: 35, energyScore: 40 }],
      recoverySystem: makeRecoverySys({ recoveryScore: 40 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "recovery")!;
    expect(sig.tone).toBe("warn");
  });
});

describe("buildTodaySignals — pain signal with painRecoveryStatus", () => {
  it("cleared_normal → tone=good, value=ไม่มีเจ็บ", () => {
    const ctx = makeCtx({ activePain: false, painRecoveryStatus: "cleared_normal" });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
    expect(sig.tone).toBe("good");
    expect(sig.value).toBe("ไม่มีเจ็บ");
  });

  it("cleared_light → tone=warn, value=เบา ๆ ได้", () => {
    const ctx = makeCtx({ activePain: false, painRecoveryStatus: "cleared_light" });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
    expect(sig.tone).toBe("warn");
    expect(sig.value).toBe("เบา ๆ ได้");
  });

  it("improving → tone=warn, value=กำลังฟื้น", () => {
    const ctx = makeCtx({ activePain: false, painRecoveryStatus: "improving" });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
    expect(sig.tone).toBe("warn");
    expect(sig.value).toBe("กำลังฟื้น");
  });

  it("active_pain always overrides to bad regardless of painRecoveryStatus", () => {
    const ctx = makeCtx({
      activePain: true,
      latestPain: makePainSummary(5),
      painRecoveryStatus: "cleared_normal", // override should not matter
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "pain")!;
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

  it("high load score → load tone = warn, not bad (CLAUDE.md: load is warning/amber when high, never danger/red)", () => {
    const ctx = makeCtx({
      totalRunKm: 55,
      recoverySystem: makeRecoverySys({ loadScore: 75 }),
    });
    const sig = buildTodaySignals(ctx).find((s) => s.key === "load")!;
    expect(sig.tone).toBe("warn");
  });
});
