/**
 * RunMate Recovery Loop v1
 *
 * Pure, deterministic helper — no React, no Supabase, no side-effects.
 * Answers three coaching questions:
 *   1. Day Load — วันนี้ใช้แรงไปแล้วเท่าไร
 *   2. Sleep Need — คืนนี้ควรนอนเท่าไร
 *   3. Tomorrow Preview — ถ้านอน/ฟื้นตัวตามนี้ พรุ่งนี้ควรเป็นยังไง
 */

import type { CoachContext, TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";
import type { RunMateRecoverySystem } from "@/lib/recoverySystem";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DayLoadLevel = "low" | "moderate" | "high" | "very_high";

export type DayLoadSummary = {
  score: number;          // 0–100
  level: DayLoadLevel;
  label: string;          // ต่ำ / ปานกลาง / สูง / สูงมาก
  summary: string;        // short Thai sentence
  reasons: string[];
  loggedWorkoutToday: boolean;
  primaryActivity?: {
    type: "run" | "strength" | "walk" | "recovery" | "other";
    distanceKm?: number;
    durationMin?: number;
    avgHr?: number;
    calories?: number;
  };
};

export type SleepNeedSummary = {
  targetHoursMin: number;
  targetHoursMax: number;
  label: string;          // "ควรนอน 7.5–8 ชม."
  summary: string;
  reasons: string[];
};

export type TomorrowPreviewState = "ready" | "easy" | "recovery" | "watch";

export type TomorrowPreview = {
  state: TomorrowPreviewState;
  headline: string;
  summary: string;
  conditions: string[];
};

export type RunMateRecoveryLoop = {
  dayLoad: DayLoadSummary;
  sleepNeed: SleepNeedSummary;
  tomorrowPreview: TomorrowPreview;
};

// ─── Day Load ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function calcDayLoad(
  workouts: TodayCompletedWorkoutSummary[],
): DayLoadSummary {
  const reasons: string[] = [];
  let primaryActivity: DayLoadSummary["primaryActivity"];

  if (workouts.length === 0) {
    return {
      score: 0,
      level: "low",
      label: "ต่ำ",
      summary: "วันนี้ยังไม่ได้บันทึกกิจกรรม",
      reasons: ["ยังไม่มีกิจกรรมวันนี้"],
      loggedWorkoutToday: false,
    };
  }

  let totalScore = 0;

  for (const w of workouts) {
    const dur = w.durationMin ?? 0;
    const dist = w.distanceKm ?? 0;
    const hr = w.avgHR ?? null;
    const cal = w.calories ?? null;

    if (w.kind === "run" || w.kind === "race") {
      let contribution = dist * 6 + dur * 0.4;
      if (hr != null) {
        if (hr >= 165) contribution += 10;
        else if (hr >= 145) contribution += 3;
      }
      contribution = clamp(contribution, 0, 90);
      totalScore += contribution;

      const parts: string[] = [];
      if (dist > 0) parts.push(`วิ่ง ${round1(dist)} km`);
      if (dur > 0) parts.push(`${dur} นาที`);
      if (hr != null) parts.push(`Avg HR ${Math.round(hr)}`);
      if (cal != null) parts.push(`${cal} kcal`);
      if (parts.length) reasons.push(parts.join(" · "));

      if (!primaryActivity) {
        primaryActivity = {
          type: w.kind === "race" ? "run" : "run",
          distanceKm: dist > 0 ? dist : undefined,
          durationMin: dur > 0 ? dur : undefined,
          avgHr: hr ?? undefined,
          calories: cal ?? undefined,
        };
      }
    } else if (w.kind === "strength") {
      let contribution = dur * 0.8;
      contribution = clamp(contribution, 0, 70);
      totalScore += contribution;

      const parts: string[] = [];
      parts.push(`เวท`);
      if (dur > 0) parts.push(`${dur} นาที`);
      if (parts.length) reasons.push(parts.join(" "));

      if (!primaryActivity) {
        primaryActivity = { type: "strength", durationMin: dur > 0 ? dur : undefined };
      }
    } else if (w.kind === "walk") {
      let contribution = dur * 0.25;
      contribution = clamp(contribution, 0, 35);
      totalScore += contribution;

      const parts: string[] = [];
      parts.push("เดิน/เคลื่อนไหวเบา");
      if (dur > 0) parts.push(`${dur} นาที`);
      if (parts.length) reasons.push(parts.join(" "));

      if (!primaryActivity) {
        primaryActivity = { type: "walk", durationMin: dur > 0 ? dur : undefined };
      }
    } else {
      const contribution = clamp(dur * 0.5, 0, 50);
      totalScore += contribution;
      if (!primaryActivity) {
        primaryActivity = { type: "other", durationMin: dur > 0 ? dur : undefined };
      }
    }
  }

  const score = clamp(Math.round(totalScore), 0, 100);

  let level: DayLoadLevel;
  let label: string;
  let summary: string;

  if (score >= 75) {
    level = "very_high";
    label = "สูงมาก";
    summary = "วันนี้ใช้แรงพอแล้ว เน้นฟื้นตัวต่อ";
  } else if (score >= 50) {
    level = "high";
    label = "สูง";
    summary = "โหลดวันนี้สูง ควรเน้นฟื้นตัว";
  } else if (score >= 25) {
    level = "moderate";
    label = "ปานกลาง";
    summary = "โหลดวันนี้ปานกลาง ร่างกายยังรับได้";
  } else {
    level = "low";
    label = "ต่ำ";
    summary = "วันนี้โหลดซ้อมต่ำ";
  }

  return {
    score,
    level,
    label,
    summary,
    reasons: reasons.slice(0, 3),
    loggedWorkoutToday: true,
    primaryActivity,
  };
}

// ─── Sleep Need ───────────────────────────────────────────────────────────────

function calcSleepNeed(
  dayLoad: DayLoadSummary,
  recSys: RunMateRecoverySystem,
  ctx: Pick<CoachContext, "sleepAvg7dHours" | "activePain" | "recentPainHistory" | "longestRun7dKm" | "totalRunKm">,
): SleepNeedSummary {
  let targetMin = 7.0;
  const reasons: string[] = [];

  const sleepAxisScore = recSys.axes.sleep.score;
  const weeklyLoadScore = recSys.axes.load.score;

  // Day load adjustments
  if (dayLoad.level === "very_high") {
    targetMin += 0.75;
    reasons.push("วันนี้โหลดสูงมาก ร่างกายต้องการการฟื้นตัวมากขึ้น");
  } else if (dayLoad.level === "high") {
    targetMin += 0.5;
    reasons.push("วันนี้โหลดสูง ควรนอนให้เพียงพอ");
  }

  // Weekly load
  if (weeklyLoadScore >= 75) {
    targetMin += 0.5;
    reasons.push("โหลดสะสมสัปดาห์นี้สูง");
  } else if (weeklyLoadScore >= 55) {
    targetMin += 0.25;
  }

  // Sleep debt
  if (sleepAxisScore < 50) {
    targetMin += 0.5;
    reasons.push("คะแนนการนอนต่ำ ควรชดเชยการนอน");
  } else if (sleepAxisScore < 66) {
    targetMin += 0.25;
    reasons.push("การนอนยังต่ำกว่าเป้า");
  }

  // Pain
  if (ctx.activePain) {
    targetMin += 0.5;
    reasons.push("มีอาการเจ็บอยู่ การนอนช่วยฟื้นตัว");
  } else if (ctx.recentPainHistory) {
    targetMin += 0.25;
    reasons.push("มีประวัติเจ็บล่าสุด การนอนพอช่วยป้องกัน");
  }

  targetMin = clamp(Math.round(targetMin * 4) / 4, 7.0, 9.0);
  const targetMax = clamp(targetMin + 0.5, 7.0, 9.5);

  const fmtHours = (h: number) => {
    const whole = Math.floor(h);
    const half = h % 1 >= 0.5 ? ".5" : "";
    return `${whole}${half}`;
  };

  const label = `ควรนอน ${fmtHours(targetMin)}–${fmtHours(targetMax)} ชม.`;
  const summary =
    reasons.length > 0
      ? `คืนนี้ตั้งเป้า ${fmtHours(targetMin)}–${fmtHours(targetMax)} ชม. · ${reasons[0]}`
      : `คืนนี้ตั้งเป้า ${fmtHours(targetMin)}–${fmtHours(targetMax)} ชม.`;

  return {
    targetHoursMin: targetMin,
    targetHoursMax: targetMax,
    label,
    summary,
    reasons,
  };
}

// ─── Tomorrow Preview ─────────────────────────────────────────────────────────

function calcTomorrowPreview(
  dayLoad: DayLoadSummary,
  sleepNeed: SleepNeedSummary,
  recSys: RunMateRecoverySystem,
  ctx: Pick<CoachContext, "activePain" | "recentPainHistory" | "isRaceTomorrow" | "isRaceWeek">,
): TomorrowPreview {
  const conditions: string[] = [];
  const sleepAxisScore = recSys.axes.sleep.score;
  const weeklyLoadScore = recSys.axes.load.score;
  const recoveryScore = recSys.axes.recovery.score;
  const fmtMin = (h: number) => {
    const whole = Math.floor(h);
    const half = h % 1 >= 0.5 ? ".5" : "";
    return `${whole}${half}`;
  };

  // Race-day override
  if (ctx.isRaceTomorrow) {
    return {
      state: "ready",
      headline: "พรุ่งนี้แข่ง — เน้นพักและเตรียมตัว",
      summary: "วันก่อนแข่ง: นอนให้พอ เติมคาร์บ ลดความเครียด",
      conditions: ["ดื่มน้ำให้พอ", "กินคาร์บเย็นนี้", `นอนให้ถึง ${fmtMin(sleepNeed.targetHoursMin)} ชม.`],
    };
  }

  // Active pain
  if (ctx.activePain) {
    conditions.push("ดูอาการก่อนซ้อม");
    conditions.push("ถ้าเจ็บเพิ่มให้พัก");
    return {
      state: "recovery",
      headline: "พรุ่งนี้ดูอาการก่อนซ้อม",
      summary: "มีอาการเจ็บอยู่ ให้ฟื้นตัวก่อนกลับมาซ้อม",
      conditions,
    };
  }

  // Very high day load or high weekly load + low sleep
  const isVeryHighLoad = dayLoad.level === "very_high";
  const isHighLoad = dayLoad.level === "high";
  const isLowSleep = sleepAxisScore < 60;
  const isHighWeeklyLoad = weeklyLoadScore >= 70;

  if (isVeryHighLoad || (isHighLoad && isLowSleep) || (isHighWeeklyLoad && isLowSleep)) {
    conditions.push(`ถ้านอนถึง ${fmtMin(sleepNeed.targetHoursMin)} ชม. → easy/recovery run ได้`);
    conditions.push(`ถ้านอนต่ำกว่า 6 ชม. → ลดเป็น recovery walk`);
    if (ctx.recentPainHistory) conditions.push("ดูอาการก่อนเพิ่มโหลด");
    return {
      state: "easy",
      headline: `ถ้านอนถึง ${fmtMin(sleepNeed.targetHoursMin)} ชม. พรุ่งนี้ค่อย easy ได้`,
      summary: "โหลดวันนี้สูง — การนอนกำหนดความพร้อมพรุ่งนี้",
      conditions,
    };
  }

  // Good recovery + moderate load
  if (recoveryScore >= 66 && !isHighWeeklyLoad) {
    conditions.push(`นอนให้ถึง ${fmtMin(sleepNeed.targetHoursMin)} ชม.`);
    conditions.push("ตื่นมาดู HR/ความรู้สึกก่อนตัดสินใจ");
    if (ctx.isRaceWeek) conditions.push("อาทิตย์แข่ง — อย่ากดโหลดมากขึ้น");
    return {
      state: "ready",
      headline: "ถ้านอนถึงเป้า พรุ่งนี้ทำตามแผนได้",
      summary: "ร่างกายฟื้นตัวดี โหลดยังรับได้",
      conditions,
    };
  }

  // Default: easy
  conditions.push(`ตั้งเป้านอน ${fmtMin(sleepNeed.targetHoursMin)}–${fmtMin(sleepNeed.targetHoursMax)} ชม.`);
  conditions.push("พรุ่งนี้เริ่มด้วย easy ก่อน แล้วดูความรู้สึก");
  return {
    state: "easy",
    headline: `ถ้านอนถึง ${fmtMin(sleepNeed.targetHoursMin)} ชม. พรุ่งนี้ค่อย easy ได้`,
    summary: "ปรับตาม sleep + ความรู้สึกเช้าวันพรุ่งนี้",
    conditions,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildRunMateRecoveryLoop(
  ctx: CoachContext,
  recSys: RunMateRecoverySystem,
): RunMateRecoveryLoop {
  const dayLoad = calcDayLoad(ctx.todayWorkouts);
  const sleepNeed = calcSleepNeed(dayLoad, recSys, ctx);
  const tomorrowPreview = calcTomorrowPreview(dayLoad, sleepNeed, recSys, ctx);
  return { dayLoad, sleepNeed, tomorrowPreview };
}
