import type { CoachContext } from "./buildCoachContext";
import type { WeekWorkout, RacePlan } from "@/types/race";

export function getReadinessCategoryLabel(score: number): "Low" | "Fair" | "Good" | "Excellent" {
  if (score < 50) return "Low";
  if (score <= 65) return "Fair";
  if (score < 80) return "Good";
  return "Excellent";
}

export function getTodayReadiness(context: CoachContext): { score: number; label: string; isFallback: boolean } {
  const todayDate = context.todayDate;
  // 1. Try to find sleep record for today's Bangkok dateKey
  const todaySleep = context.sleep7d.find((s) => s.date === todayDate && s.readiness != null);
  if (todaySleep && todaySleep.readiness != null) {
    return {
      score: todaySleep.readiness,
      label: `Readiness ${todaySleep.readiness}`,
      isFallback: false,
    };
  }

  // 2. Fall back to the latest sleep record in 7d that has readiness
  const latestSleep = context.sleep7d.find((s) => s.readiness != null);
  if (latestSleep && latestSleep.readiness != null) {
    return {
      score: latestSleep.readiness,
      label: `Readiness ล่าสุด ${latestSleep.readiness}`,
      isFallback: true,
    };
  }

  // 3. Fall back to default
  return {
    score: 65,
    label: "Readiness ล่าสุด 65",
    isFallback: true,
  };
}

export function getTodayPlannedWorkout(context: CoachContext): WeekWorkout | null {
  const plan = context.racePlan as RacePlan | null;
  if (!plan) return null;
  const weeklyPlan = Array.isArray(plan.weeklyPlan) ? plan.weeklyPlan : [];
  if (!weeklyPlan.length) return plan.todayWorkout ?? null;

  for (const workout of weeklyPlan) {
    const raw = workout as WeekWorkout & { date?: string; dateKey?: string; dayDate?: string };
    const workoutDate = raw.date ?? raw.dateKey ?? raw.dayDate;
    if (workoutDate?.slice(0, 10) === context.todayDate) return workout;
  }

  const todayWeekday = bangkokWeekdayIndex(context.todayDate);
  for (const workout of weeklyPlan) {
    if (normalizeWeekdayLabel(workout.day) === todayWeekday) return workout;
  }

  if (plan.planStartDate) {
    const startMs = Date.parse(`${plan.planStartDate}T12:00:00+07:00`);
    const todayMs = Date.parse(`${context.todayDate}T12:00:00+07:00`);
    if (!Number.isNaN(startMs) && !Number.isNaN(todayMs)) {
      const offset = Math.round((todayMs - startMs) / 86_400_000);
      if (offset >= 0 && offset < weeklyPlan.length) return weeklyPlan[offset] ?? null;
    }
  }

  return plan.todayWorkout ?? null;
}

function bangkokWeekdayIndex(date: string): number {
  const parsed = new Date(`${date}T12:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? -1 : parsed.getDay();
}

function normalizeWeekdayLabel(day: string): number {
  const value = (day ?? "").trim().toLowerCase();
  if (/^(sun|sunday|อา\.|อาทิตย์|วันอาทิตย์)/i.test(value)) return 0;
  if (/^(mon|monday|จ\.|จันทร์|วันจันทร์)/i.test(value)) return 1;
  if (/^(tue|tuesday|อ\.|อังคาร|วันอังคาร)/i.test(value)) return 2;
  if (/^(wed|wednesday|พ\.|พุธ|วันพุธ)/i.test(value)) return 3;
  if (/^(thu|thursday|พฤ\.|พฤหัส|วันพฤหัส)/i.test(value)) return 4;
  if (/^(fri|friday|ศ\.|ศุกร์|วันศุกร์)/i.test(value)) return 5;
  if (/^(sat|saturday|ส\.|เสาร์|วันเสาร์)/i.test(value)) return 6;
  return -1;
}
