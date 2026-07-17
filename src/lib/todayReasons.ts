// Pure helper — no React imports, no "use client". Safe for server and client.
import type { CoachContext } from "@/lib/buildCoachContext";
import type { DailyCoachInsight } from "@/types/ai";
import type { ReadinessV2Result } from "@/lib/readinessV2";
import { getRunMateReadinessLabel } from "@/lib/readinessV2";
import { getTodayPlannedWorkout } from "@/lib/todayPlanning";
import { getCoachCautionFactors } from "./coachCautionFactors";

export function buildTodayRecommendationReasons(
  ctx: CoachContext | null,
  insight: DailyCoachInsight | null,
  v2: ReadinessV2Result | null,
  hasSleepToday?: boolean,
): string[] {
  if (!ctx && !insight) return [];
  const reasons: string[] = [];
  const factors = getCoachCautionFactors(ctx);

  // 1. Race plan original workout
  if (ctx?.racePlan) {
    const planned = getTodayPlannedWorkout(ctx);
    if (planned?.workoutType && !/rest|พัก/i.test(planned.workoutType)) {
      const distPart = planned.distanceKm != null && planned.distanceKm > 0 ? ` ${planned.distanceKm} กม.` : "";
      reasons.push(`แผน Race เดิมคือ ${planned.workoutType}${distPart}`);
    }
  } else if (ctx?.raceName) {
    reasons.push(`เป้าหมาย Race: ${ctx.raceName}${ctx.daysUntilRace != null ? ` (อีก ${ctx.daysUntilRace} วัน)` : ""}`);
  }

  // 2. Readiness — use the same score as the chip (insight.todayReadiness so they always match),
  //    recompute label from the RunMate mapping instead of trusting AI-returned strings,
  //    and distinguish today vs latest-fallback with the "ล่าสุด" prefix.
  const prefix = hasSleepToday === false ? "Readiness ล่าสุด" : "Readiness วันนี้";
  if (insight?.todayReadiness != null) {
    const score = Math.round(insight.todayReadiness);
    const label = getRunMateReadinessLabel(score);
    const readinessLine = `${prefix} ${score}/100 (${label})`;
    const capNote = v2?.cap != null ? " — ถูกจำกัดคะแนนเพราะมีอาการเจ็บ" : "";
    reasons.push(`${readinessLine}${capNote}`);
  } else if (v2) {
    const label = getRunMateReadinessLabel(v2.score);
    const readinessLine = `${prefix} ${v2.score}/100 (${label})`;
    reasons.push(v2.cap != null ? `${readinessLine} — ถูกจำกัดคะแนนเพราะมีอาการเจ็บ` : readinessLine);
  }

  // 3. Sleep Average Check
  if (ctx && ctx.sleepAvg7dHours != null && ctx.sleepAvg7dHours < 6) {
    reasons.push(`นอนเฉลี่ย ${ctx.sleepAvg7dHours.toFixed(1)} ชม. ยังควรเพิ่ม`);
  }

  // 4. Training load / load high
  if (ctx) {
    const isHighLoad = factors.some(f => f.key === "weeklyLoadHigh");
    if (isHighLoad) {
      reasons.push(`โหลดสัปดาห์ ${Math.round(ctx.totalRunKm * 10) / 10} กม. สูงพอสมควร`);
    } else if (ctx.totalRunKm > 0) {
      reasons.push(`โหลดสัปดาห์ ${Math.round(ctx.totalRunKm * 10) / 10} กม.${ctx.runDays7d > 0 ? ` ใน ${ctx.runDays7d} วัน` : ""}`);
    }
  }

  // 4b. Resting HR trending up several days in a row
  const hrTrend = factors.find(f => f.key === "restingHrTrendUp");
  if (hrTrend) {
    reasons.push(hrTrend.reason);
  }

  // 5. Pain
  if (ctx?.latestPain) {
    const p = ctx.latestPain;
    if (p.hasResolvedPain) {
      reasons.push(`อาการเจ็บ${p.painLocation ? ` (${p.painLocation})` : ""}หายแล้ว แต่ยังควรค่อย ๆ กลับโหลด`);
    } else if (p.hasActivePain) {
      reasons.push(`มีอาการเจ็บ${p.painLocation ? ` (${p.painLocation})` : ""} ระดับ ${p.painLevel}/10 — ปรับให้เบาลง`);
    }
  }

  // 6. Fueling check
  const isLowFuel = factors.some(f => f.key === "lowFuel");
  if (isLowFuel && ctx) {
    reasons.push(`อาหารวันนี้คาร์บยังต่ำ ควรเติมพลังงานเบา ๆ ก่อนซ้อม`);
  }

  // 7. Explain downgrade only when caution factors caused a change from the planned workout
  if (insight?.workoutRec) {
    const isRun = /(run|วิ่ง|ซ้อม|easy|tempo|long)/i.test(insight.workoutRec);
    const hasCaution = factors.length > 0;
    if (isRun && hasCaution) {
      reasons.push(`เลยแนะนำ Easy Run ไม่ใช่ tempo/interval`);
      reasons.push(`ถ้า HR ลอยหรือขาหนัก ให้ลดเป็น walk/jog 30–40 นาที`);
    }
  }

  return reasons.slice(0, 7);
}
