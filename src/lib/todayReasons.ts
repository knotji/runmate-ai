// Pure helper — no React imports, no "use client". Safe for server and client.
import type { CoachContext } from "@/lib/buildCoachContext";
import type { DailyCoachInsight } from "@/types/ai";
import type { ReadinessV2Result } from "@/lib/readinessV2";
import { getRunMateReadinessLabel } from "@/lib/readinessV2";
import { getTodayPlannedWorkout } from "@/lib/todayPlanning";

export function buildTodayRecommendationReasons(
  ctx: CoachContext | null,
  insight: DailyCoachInsight | null,
  v2: ReadinessV2Result | null,
  hasSleepToday?: boolean,
): string[] {
  if (!ctx && !insight) return [];
  const reasons: string[] = [];

  // 1. Race plan original workout
  if (ctx?.racePlan) {
    const planned = getTodayPlannedWorkout(ctx);
    if (planned?.workoutType && !/rest|พัก/i.test(planned.workoutType)) {
      const distPart = planned.distanceKm != null && planned.distanceKm > 0 ? ` ${planned.distanceKm} km` : "";
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

  // 3. Training load
  if (ctx) {
    if (ctx.totalRunKm > 0) {
      reasons.push(`โหลดสัปดาห์ ${Math.round(ctx.totalRunKm * 10) / 10} km${ctx.runDays7d > 0 ? ` ใน ${ctx.runDays7d} วัน` : ""}`);
    } else if (ctx.workouts7d.length > 0) {
      reasons.push(`ซ้อม ${ctx.workouts7d.length} ครั้งในสัปดาห์นี้`);
    } else {
      reasons.push("ยังไม่มีบันทึกซ้อมในสัปดาห์นี้");
    }
  }

  // 4. Pain
  if (ctx?.latestPain) {
    const p = ctx.latestPain;
    if (p.hasResolvedPain) {
      reasons.push(`อาการเจ็บ${p.painLocation ? ` (${p.painLocation})` : ""} หายแล้ว แต่ยังควรค่อย ๆ กลับมาซ้อม`);
    } else if (p.hasActivePain) {
      reasons.push(`มีอาการเจ็บ${p.painLocation ? ` (${p.painLocation})` : ""} ระดับ ${p.painLevel}/10 — ปรับให้เบาลง`);
    }
  } else if (ctx && !ctx.activePain && !ctx.recentPainHistory) {
    reasons.push("ไม่มีอาการเจ็บล่าสุด");
  }

  // 5. Meals / activity today
  const mealCount = ctx?.mealsToday?.length ?? 0;
  const hasActivity = ctx?.hasWorkoutToday ?? false;
  if (mealCount === 0 && !hasActivity) {
    reasons.push("ยังไม่มีบันทึกอาหารและกิจกรรมวันนี้ — ระบบใช้ข้อมูลสะสม 7 วัน");
  } else if (mealCount > 0 && !hasActivity) {
    reasons.push(`วันนี้มีอาหาร ${mealCount} มื้อแล้ว แต่ยังไม่มีบันทึกกิจกรรม`);
  } else if (mealCount === 0 && hasActivity) {
    reasons.push("มีบันทึกกิจกรรมวันนี้แล้ว แต่ยังไม่มีข้อมูลอาหาร");
  }

  // 6. Resulting recommendation
  if (insight?.workoutRec) {
    reasons.push(`เลยแนะนำให้: ${insight.workoutRec}`);
  }

  return reasons.slice(0, 6);
}
