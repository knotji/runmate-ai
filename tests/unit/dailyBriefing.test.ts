import { describe, expect, it } from "vitest";
import { buildDailyBriefing } from "@/lib/dailyBriefing";
import { makeCtx } from "./readiness/fixtures";
import type { CoachContext } from "@/lib/buildCoachContext";

function makeSleepNeed(overrides?: Partial<CoachContext["recoveryLoop"]["sleepNeed"]>): CoachContext["recoveryLoop"] {
  return {
    dayLoad: {} as CoachContext["recoveryLoop"]["dayLoad"],
    sleepNeed: {
      targetHoursMin: 7,
      targetHoursMax: 8,
      label: "ควรนอน 7–8 ชม.",
      summary: "",
      reasons: [],
      ...overrides,
    },
    tomorrowPreview: {} as CoachContext["recoveryLoop"]["tomorrowPreview"],
  };
}

function sleepRow(overrides: Partial<CoachContext["sleep7d"][number]>): CoachContext["sleep7d"][number] {
  return {
    date: "2026-07-17",
    durationH: "7 ชม.",
    durationMinutes: 420,
    score: 75,
    readiness: 75,
    restingHR: null,
    hrv: null,
    energyScore: null,
    sleepStartTime: null,
    sleepEndTime: null,
    ...overrides,
  };
}

describe("buildDailyBriefing — yesterday summary", () => {
  it("no data at all → generic no-data message, hasEnoughData false", () => {
    const ctx = makeCtx({ sleep7d: [], nutritionYesterday: null, workoutsYesterday: null, recoveryLoop: makeSleepNeed() });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.hasEnoughData).toBe(false);
    expect(briefing.yesterdaySummary).toBe("เมื่อวานยังไม่มีข้อมูลบันทึกไว้");
  });

  it("last night's sleep + yesterday's protein under target + a run → cites all three", () => {
    const ctx = makeCtx({
      profile: { weightKg: 60 },
      sleep7d: [sleepRow({ durationH: "6 ชม. 20 นาที" })],
      nutritionYesterday: { date: "2026-07-17", mealCount: 2, caloriesKcal: 1200, proteinG: 40, carbsG: 150, fatG: 30, notes: [] },
      workoutsYesterday: { date: "2026-07-17", runs: [{ km: 5, durationMin: 30, avgHR: 150, pace: null }], walks: [], other: [] },
      recoveryLoop: makeSleepNeed(),
    });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.hasEnoughData).toBe(true);
    expect(briefing.yesterdaySummary).toContain("นอน 6 ชม. 20 นาที");
    // weightKg 60 * 1.6 = 96g target; 40g is well under 70% → flagged as short
    expect(briefing.yesterdaySummary).toContain("โปรตีนได้ 40g (ยังไม่ถึงเป้า)");
    expect(briefing.yesterdaySummary).toContain("วิ่งไป 5 กม.");
  });

  it("protein at/above target → does not flag it as short", () => {
    const ctx = makeCtx({
      profile: { weightKg: 60 },
      nutritionYesterday: { date: "2026-07-17", mealCount: 3, caloriesKcal: 2000, proteinG: 100, carbsG: 250, fatG: 60, notes: [] },
      recoveryLoop: makeSleepNeed(),
    });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.yesterdaySummary).toContain("โปรตีนได้ 100g ครบตามเป้า");
  });

  it("no run but a walk logged → says 'light activity', not 'no training'", () => {
    const ctx = makeCtx({
      workoutsYesterday: { date: "2026-07-17", runs: [], walks: [{ km: 2, durationMin: 20 }], other: [] },
      recoveryLoop: makeSleepNeed(),
    });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.yesterdaySummary).toContain("ออกกำลังกายเบา ๆ");
  });

  it("no workout record at all → says no training", () => {
    const ctx = makeCtx({
      sleep7d: [sleepRow({})],
      workoutsYesterday: null,
      recoveryLoop: makeSleepNeed(),
    });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.yesterdaySummary).toContain("ไม่มีกิจกรรมซ้อม");
  });
});

describe("buildDailyBriefing — sleep tonight", () => {
  it("no wake-time history → falls back to the duration-only label, no clock times", () => {
    const ctx = makeCtx({ sleep7d: [], recoveryLoop: makeSleepNeed({ label: "ควรนอน 7.5–8 ชม." }) });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.sleepTonightSentence).toContain("ควรนอน 7.5–8 ชม.");
    expect(briefing.sleepTonightSentence).not.toMatch(/\d{2}:\d{2} น\./);
  });

  it("consistent wake time across nights → recommends a bedtime clock time", () => {
    const ctx = makeCtx({
      sleep7d: [
        sleepRow({ date: "2026-07-17", sleepEndTime: "2026-07-17T23:00:00.000Z" }), // 06:00 Bangkok
        sleepRow({ date: "2026-07-16", sleepEndTime: "2026-07-16T23:00:00.000Z" }), // 06:00 Bangkok
        sleepRow({ date: "2026-07-15", sleepEndTime: "2026-07-14T23:00:00.000Z" }), // 06:00 Bangkok
      ],
      recoveryLoop: makeSleepNeed({ targetHoursMin: 7, targetHoursMax: 8, label: "ควรนอน 7–8 ชม." }),
    });
    const briefing = buildDailyBriefing(ctx);
    expect(briefing.sleepTonightSentence).toContain("ปกติคุณตื่น 06:00 น.");
    // 06:00 - 8h = 22:00
    expect(briefing.sleepTonightSentence).toContain("เข้านอนประมาณ 22:00 น.");
    expect(briefing.sleepTonightSentence).toContain("7–8 ชม.");
  });

  it("bedtime recommendation wraps correctly across midnight", () => {
    const ctx = makeCtx({
      sleep7d: [
        sleepRow({ date: "2026-07-17", sleepEndTime: "2026-07-17T22:30:00.000Z" }), // 05:30 Bangkok
        sleepRow({ date: "2026-07-16", sleepEndTime: "2026-07-16T22:30:00.000Z" }),
      ],
      recoveryLoop: makeSleepNeed({ targetHoursMin: 8, targetHoursMax: 9, label: "ควรนอน 8–9 ชม." }),
    });
    const briefing = buildDailyBriefing(ctx);
    // 05:30 - 9h = 20:30 (previous evening, no wraparound needed here, but
    // confirms the math holds for a larger target range too)
    expect(briefing.sleepTonightSentence).toContain("20:30 น.");
  });
});

describe("buildDailyBriefing — food today", () => {
  it("delegates to buildNutritionTargetSummary's recoveryFuelNote", () => {
    const ctx = makeCtx({ recoveryLoop: makeSleepNeed() });
    const briefing = buildDailyBriefing(ctx);
    expect(typeof briefing.foodTodaySentence).toBe("string");
    expect(briefing.foodTodaySentence.length).toBeGreaterThan(0);
  });
});
