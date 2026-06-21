import type { CoachContext } from "@/lib/buildCoachContext";
import type { MealAnalysis } from "@/types/logs";
import type { UserProfile } from "@/types/profile";

export type TrainingNutritionDayType = "rest" | "easy" | "hard";

export type NutritionTargetSummary = {
  dayType: TrainingNutritionDayType;
  proteinTargetG: number | null;
  carbTargetG: number | null;
  proteinTotalG: number | null;
  carbTotalG: number | null;
  proteinProgressPct: number | null;
  carbProgressPct: number | null;
  carbAdequacy: "low" | "ok" | "good" | "high" | "unknown";
  recoveryFuelNote: string;
};

export function suggestedProteinTargetG(weightKg?: number | null) {
  return typeof weightKg === "number" && Number.isFinite(weightKg) && weightKg > 0
    ? Math.round(weightKg * 1.6)
    : null;
}

export function calculateNutritionTargetsFromWeight(
  weightKg: number,
  nutritionGoal?: string | null,
  weeklyMileageKm?: number | null,
): {
  proteinTargetG: number;
  carbTargetRestDayG: number;
  carbTargetEasyDayG: number;
  carbTargetHardDayG: number;
  proteinMultiplier: number;
} {
  let proteinMultiplier = 1.6;
  if (nutritionGoal === "lean_muscle") proteinMultiplier = 1.8;
  else if (nutritionGoal === "weight_control") proteinMultiplier = 1.7;

  const proteinTargetG = Math.min(130, Math.max(60, Math.round(weightKg * proteinMultiplier)));
  const hardMultiplier = (weeklyMileageKm ?? 0) >= 50 ? 6 : 5;
  return {
    proteinTargetG,
    carbTargetRestDayG: Math.round(weightKg * 3),
    carbTargetEasyDayG: Math.round(weightKg * 4),
    carbTargetHardDayG: Math.round(weightKg * hardMultiplier),
    proteinMultiplier,
  };
}

export function inferTrainingNutritionDayType(context: CoachContext | null): TrainingNutritionDayType {
  if (!context) return "rest";
  if (context.isRaceToday || context.isRaceTomorrow) return "hard";
  const today = context.todayDate;
  const todayWorkout = context.workouts7d.find((day) => day.date === today);
  if (!todayWorkout) return "rest";
  const runKm = todayWorkout.runs.reduce((sum, run) => sum + run.km, 0);
  return runKm >= 8 || todayWorkout.runs.some((run) => (run.avgHR ?? 0) >= 150) ? "hard" : "easy";
}

export function buildNutritionTargetSummary(input: {
  profile: UserProfile | null;
  context: CoachContext | null;
  meal?: MealAnalysis | null;
}): NutritionTargetSummary {
  const dayType = inferTrainingNutritionDayType(input.context);
  const proteinTargetG = input.profile?.proteinTargetG ?? suggestedProteinTargetG(input.profile?.weightKg);
  const carbTargetG =
    dayType === "hard"
      ? input.profile?.carbTargetHardDayG ?? null
      : dayType === "easy"
        ? input.profile?.carbTargetEasyDayG ?? null
        : input.profile?.carbTargetRestDayG ?? null;

  const today = input.context?.nutritionToday;
  const proteinTotalG = addNullable(today?.proteinG, input.meal?.nutrition?.proteinG);
  const carbTotalG = addNullable(today?.carbsG, input.meal?.nutrition?.carbsG);

  const proteinProgressPct = percent(proteinTotalG, proteinTargetG);
  const carbProgressPct = percent(carbTotalG, carbTargetG);

  return {
    dayType,
    proteinTargetG,
    carbTargetG,
    proteinTotalG,
    carbTotalG,
    proteinProgressPct,
    carbProgressPct,
    carbAdequacy: carbAdequacy(carbProgressPct),
    recoveryFuelNote: recoveryFuelNote({ dayType, proteinProgressPct, carbProgressPct }),
  };
}

function addNullable(a?: number | null, b?: number | null) {
  const values = [a, b].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0)) : null;
}

function percent(total: number | null, target: number | null) {
  if (total == null || target == null || target <= 0) return null;
  return Math.round((total / target) * 100);
}

function carbAdequacy(progress: number | null): NutritionTargetSummary["carbAdequacy"] {
  if (progress == null) return "unknown";
  if (progress < 55) return "low";
  if (progress < 80) return "ok";
  if (progress <= 120) return "good";
  return "high";
}

function recoveryFuelNote(input: {
  dayType: TrainingNutritionDayType;
  proteinProgressPct: number | null;
  carbProgressPct: number | null;
}) {
  if (input.dayType === "hard") {
    if ((input.carbProgressPct ?? 0) < 70) return "วันนี้เป็นวันซ้อมหนัก/ใกล้แข่ง ควรเติมคาร์บเพิ่มแบบย่อยง่ายและดื่มน้ำให้พอ";
    return "คาร์บวันนี้ดูช่วยรองรับซ้อม/แข่งได้ดี เน้นน้ำและโปรตีนต่อให้ครบ";
  }
  if ((input.proteinProgressPct ?? 0) < 60) return "โปรตีนยังค่อนข้างน้อยสำหรับ recovery ลองเติมโปรตีนในมื้อต่อไป";
  return "ภาพรวมเชื้อเพลิงวันนี้โอเคสำหรับ recovery แบบไม่ต้องนับแคลเข้ม";
}
