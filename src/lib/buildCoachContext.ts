"use client";

import { loadHistoryItems } from "@/lib/cloudHistory";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import { loadRaceResults } from "@/lib/raceResults";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis, WorkoutAnalysis, BodyCompositionAnalysis, MealAnalysis } from "@/types/logs";
import type { PainLog } from "@/types/pain";
import type { RaceResult } from "@/types/race";
import type { StrengthLog } from "@/types/strength";

export type DayWorkoutSummary = {
  date: string;
  runs: { km: number; durationMin: number; avgHR: number | null; pace: string | null }[];
  walks: { km: number | null; durationMin: number }[];
  other: { label: string; durationMin: number }[];
};

export type WeekSleepRow = {
  date: string;
  durationH: string | null;
  score: number | null;
  readiness: number | null;
};

export type PainSummary = {
  id: string;
  date: string;
  painLocation: string;
  painLevel: number;
  riskLevel: string;
  trainingImpact: string;
  coachAdvice: string;
};

export type CoachContext = {
  profile: Record<string, unknown> | null;
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
  activeRaceStatus: "none" | "scheduled" | "today" | "past";
  activeRaceGoal: Record<string, unknown> | null;
  raceDate: string | null;
  raceDistance: string | null;
  raceName: string | null;
  daysUntilRace: number | null;
  isRaceToday: boolean;
  isRaceTomorrow: boolean;
  isRaceWeek: boolean;
  raceGoalType: string | null;
  targetTime: string | null;
  sleep7d: WeekSleepRow[];
  avgReadiness: number | null;
  workouts7d: DayWorkoutSummary[];
  nutritionToday: NutritionDaySummary | null;
  nutrition7d: NutritionDaySummary[];
  latestCompletedRace: RaceResult | null;
  recentRaceResults: RaceResult[];
  totalRunKm: number;
  totalSessions: number;
  runDays7d: number;
  longestRun7dKm: number | null;
  lastWorkoutDate: string | null;
  lastRun: { date: string; km: number; durationMin: number; avgHR: number | null; pace: string | null } | null;
  latestBody: { weightKg: number | null; bodyFatPct: number | null; muscleKg: number | null } | null;
  todayDate: string;
  contextNotes: string[];
  recentPainLogs: PainSummary[];
};

export type NutritionDaySummary = {
  date: string;
  mealCount: number;
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  notes: string[];
};

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

function todayBangkok(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function dateBefore(days: number): string {
  return new Date(Date.now() + TZ_OFFSET_MS - days * 86400000).toISOString().slice(0, 10);
}

export function buildCoachContext(): CoachContext {
  const ctx = buildCoachContextFromData({ items: [], profile: null, raceGoal: null, racePlan: null });
  return ctx;
}

export async function buildCoachContextFromSupabase(): Promise<CoachContext> {
  const [historyResult, profileResult, raceResult, completedRaceResult] = await Promise.all([
    loadHistoryItems(["sleep", "workout", "body", "meal", "pain", "strength"]),
    loadProfileFromSupabase(),
    loadActiveRaceGoalAndPlan(),
    loadRaceResults(5),
  ]);

  return buildCoachContextFromData({
    items: historyResult.ok ? historyResult.items : [],
    profile: profileResult.ok ? profileResult.profile ?? null : null,
    raceGoal: raceResult.ok ? raceResult.goal : null,
    racePlan: raceResult.ok ? raceResult.plan : null,
    raceResults: completedRaceResult.ok ? completedRaceResult.results : [],
  });
}

export function buildCoachContextFromData(input: {
  items: LocalHistoryItem[];
  profile: Record<string, unknown> | null;
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
  raceResults?: RaceResult[];
}): CoachContext {
  const today = todayBangkok();
  const cutoff = dateBefore(7);
  const race = buildRaceContext(input.raceGoal, today);
  const items = input.items.filter((item) => normalizeDateString(item.createdAt));

  const sleepItems = items
    .filter((i) => i.type === "sleep")
    .filter((i) => i.createdAt.slice(0, 10) >= cutoff);
  const sleep7d: WeekSleepRow[] = sleepItems.map((item) => {
    const d = item.data as SleepAnalysis;
    return {
      date: item.createdAt.slice(0, 10),
      durationH: d?.extracted?.sleepDuration ?? null,
      score: d?.extracted?.sleepScore ?? null,
      readiness: d?.coach?.readinessScore ?? null,
    };
  });

  const scores = sleep7d.map((s) => s.readiness).filter((n): n is number => n != null);
  const avgReadiness = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const workoutItems = items
    .filter((i) => i.type === "workout")
    .filter((i) => i.createdAt.slice(0, 10) >= cutoff);

  const strengthItems = items
    .filter((i) => i.type === "strength")
    .filter((i) => i.createdAt.slice(0, 10) >= cutoff);

  const dayMap = new Map<string, DayWorkoutSummary>();
  const ensureDay = (date: string) => {
    if (!dayMap.has(date)) dayMap.set(date, { date, runs: [], walks: [], other: [] });
    return dayMap.get(date)!;
  };

  let totalRunKm = 0;
  let totalSessions = 0;
  let longestRun7dKm: number | null = null;
  let lastRun: CoachContext["lastRun"] = null;

  for (const item of workoutItems) {
    const date = item.createdAt.slice(0, 10);
    const d = item.data as WorkoutAnalysis;
    const ext = d?.extracted;
    if (!ext) continue;

    const durationMin = parseDurationToMin(ext.duration);
    if (!durationMin) continue;

    const day = ensureDay(date);
    totalSessions++;

    if (ext.workoutKind === "outdoor_run" || ext.workoutKind === "treadmill") {
      const km = ext.distanceKm ?? 0;
      totalRunKm += km;
      day.runs.push({ km, durationMin, avgHR: ext.avgHR ?? null, pace: ext.avgPace ?? null });
      longestRun7dKm = Math.max(longestRun7dKm ?? 0, km);
      if (!lastRun || date > lastRun.date) {
        lastRun = { date, km, durationMin, avgHR: ext.avgHR ?? null, pace: ext.avgPace ?? null };
      }
    } else if (ext.workoutKind === "walk") {
      day.walks.push({ km: ext.distanceKm ?? null, durationMin });
    } else {
      const label = ext.workoutKind === "strength" ? "เวท" : ext.workoutKind === "cycling" ? "ปั่นจักรยาน" : "ออกกำลังกาย";
      day.other.push({ label, durationMin });
    }
  }

  for (const item of strengthItems) {
    const date = item.createdAt.slice(0, 10);
    const d = item.data as StrengthLog;
    if (!d) continue;

    const day = ensureDay(date);
    totalSessions++;
    day.other.push({ label: `เวท (${d.routineName})`, durationMin: d.durationMin || 15 });
  }

  const workouts7d = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  const nutrition7d = buildNutritionSummaries(items, cutoff);
  const nutritionToday = nutrition7d.find((day) => day.date === today) ?? null;
  const recentRaceResults = (input.raceResults ?? []).map(compactRaceResult);
  const latestCompletedRace = recentRaceResults[0] ?? null;
  const runDays7d = workouts7d.filter((day) => day.runs.length > 0).length;
  const lastWorkoutDate = workouts7d[0]?.date ?? null;

  // Pain logs — last 7 days, most recent first
  const painItems = items
    .filter((i) => i.type === "pain")
    .filter((i) => i.createdAt.slice(0, 10) >= cutoff);
  const recentPainLogs: PainSummary[] = painItems.map((item) => {
    const d = item.data as PainLog;
    return {
      id: item.id,
      date: item.createdAt.slice(0, 10),
      painLocation: d?.painLocation ?? "ไม่ระบุ",
      painLevel: d?.painLevel ?? 0,
      riskLevel: d?.riskLevel ?? "unknown",
      trainingImpact: d?.trainingImpact ?? "unknown",
      coachAdvice: d?.coachAdvice ?? "",
    };
  });

  const latestBodyItem = items.filter((i) => i.type === "body")[0];
  let latestBody: CoachContext["latestBody"] = null;
  if (latestBodyItem) {
    const bd = latestBodyItem.data as BodyCompositionAnalysis;
    latestBody = {
      weightKg: bd?.extracted?.weightKg ?? null,
      bodyFatPct: bd?.extracted?.bodyFatPercent ?? null,
      muscleKg: bd?.extracted?.skeletalMuscleKg ?? null,
    };
  }

  return {
    profile: input.profile,
    raceGoal: input.raceGoal,
    racePlan: input.racePlan,
    activeRaceStatus: race.activeRaceStatus,
    activeRaceGoal: input.raceGoal,
    raceDate: race.raceDate,
    raceDistance: race.raceDistance,
    raceName: race.raceName,
    daysUntilRace: race.daysUntilRace,
    isRaceToday: race.isRaceToday,
    isRaceTomorrow: race.isRaceTomorrow,
    isRaceWeek: race.isRaceWeek,
    raceGoalType: race.raceGoalType,
    targetTime: race.targetTime,
    sleep7d,
    avgReadiness,
    workouts7d,
    nutritionToday,
    nutrition7d,
    latestCompletedRace,
    recentRaceResults,
    totalRunKm: Math.round(totalRunKm * 10) / 10,
    totalSessions,
    runDays7d,
    longestRun7dKm,
    lastWorkoutDate,
    lastRun,
    latestBody,
    todayDate: today,
    recentPainLogs,
    contextNotes: buildContextNotes({
      raceGoal: input.raceGoal,
      racePlan: input.racePlan,
      raceResults: recentRaceResults,
      sleep7d,
      workouts7d,
      totalRunKm,
      runDays7d,
      longestRun7dKm,
      lastWorkoutDate,
      recentPainLogs,
      strengthCount: items.filter((i) => i.type === "strength" && i.createdAt.slice(0, 10) >= cutoff).length,
    }),
  };
}

function buildNutritionSummaries(items: LocalHistoryItem[], cutoff: string): NutritionDaySummary[] {
  const mealItems = items
    .filter((item) => item.type === "meal")
    .filter((item) => item.createdAt.slice(0, 10) >= cutoff);
  const byDate = new Map<string, MealAnalysis[]>();
  for (const item of mealItems) {
    const date = item.createdAt.slice(0, 10);
    const list = byDate.get(date) ?? [];
    list.push(item.data as MealAnalysis);
    byDate.set(date, list);
  }

  return [...byDate.entries()]
    .map(([date, meals]) => ({
      date,
      mealCount: meals.length,
      caloriesKcal: sumMeals(meals, "caloriesKcal"),
      proteinG: sumMeals(meals, "proteinG"),
      carbsG: sumMeals(meals, "carbsG"),
      fatG: sumMeals(meals, "fatG"),
      notes: meals.map((meal) => meal.trainingFit?.coachNote).filter((note): note is string => Boolean(note)).slice(0, 2),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function sumMeals(meals: MealAnalysis[], key: keyof MealAnalysis["nutrition"]): number | null {
  let total = 0;
  let found = false;
  for (const meal of meals) {
    const value = Number(meal.nutrition?.[key]);
    if (Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? Math.round(total) : null;
}

function compactRaceResult(result: RaceResult): RaceResult {
  return {
    id: result.id,
    raceGoalId: result.raceGoalId,
    linkedHistoryItemId: result.linkedHistoryItemId,
    raceName: result.raceName,
    raceDate: result.raceDate,
    raceDistance: result.raceDistance,
    goalType: result.goalType,
    targetTime: result.targetTime,
    actualDistanceKm: result.actualDistanceKm,
    actualTime: result.actualTime,
    actualPace: result.actualPace,
    avgHr: result.avgHr,
    maxHr: result.maxHr,
    goalResult: result.goalResult,
    coachSummary: result.coachSummary,
    resultStatus: result.resultStatus,
  };
}

function buildContextNotes(input: {
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
  raceResults: RaceResult[];
  sleep7d: WeekSleepRow[];
  workouts7d: DayWorkoutSummary[];
  totalRunKm: number;
  runDays7d: number;
  recentPainLogs?: PainSummary[];
  longestRun7dKm: number | null;
  lastWorkoutDate: string | null;
  strengthCount?: number;
}): string[] {
  const notes: string[] = [];
  if (!input.raceGoal) notes.push("No active race goal is set. Do not infer an upcoming race from old imported memories.");
  if (input.raceGoal) {
    const race = buildRaceContext(input.raceGoal, todayBangkok());
    const raceCompletedToday = input.raceResults.some((result) => result.raceDate === todayBangkok());
    if (raceCompletedToday) notes.push("Race result was saved today. Treat today as post-race recovery; do not recommend pre-race plans or extra hard training.");
    else if (race.isRaceToday) notes.push(`Race day today: ${race.raceName ?? "race"} ${race.raceDistance ?? ""} target ${race.targetTime ?? race.raceGoalType ?? "not set"}. Prioritize warm-up, pacing, hydration, and recovery. Do not suggest heavy extra training.`);
    else if (race.isRaceTomorrow) notes.push(`Race is tomorrow: ${race.raceName ?? "race"} ${race.raceDistance ?? ""}. Avoid long run/heavy workout; keep legs fresh.`);
    else if (race.isRaceWeek) notes.push(`Race is within 7 days (${race.daysUntilRace} days). Be conservative with training load.`);
  }
  if (input.raceResults[0]) {
    const latest = input.raceResults[0];
    notes.push(`Latest completed race: ${latest.raceName ?? "race"} ${latest.raceDistance ?? ""} target ${latest.targetTime ?? "none"} actual ${latest.actualTime ?? "unknown"} result ${latest.goalResult ?? "unknown"}.`);
    if (latest.coachSummary) notes.push(`Race coach summary: ${latest.coachSummary}`);
  }
  if (!input.racePlan) notes.push("No active weekly/race plan is set. For tomorrow questions, state that the plan is inferred from recent data.");
  if (input.sleep7d.length === 0) notes.push("No sleep data in the last 7 days.");
  if (input.workouts7d.length === 0) notes.push("No workout data in the last 7 days.");
  if (input.totalRunKm > 0) notes.push(`Last 7 days running load: ${Math.round(input.totalRunKm * 10) / 10} km across ${input.runDays7d} run days.`);
  if (input.longestRun7dKm != null) notes.push(`Longest run in last 7 days: ${input.longestRun7dKm.toFixed(1)} km.`);
  if (input.lastWorkoutDate) notes.push(`Last workout date: ${input.lastWorkoutDate}.`);
  if (input.strengthCount && input.strengthCount > 0) {
    notes.push(`Strength training in last 7 days: completed ${input.strengthCount} strength session(s).`);
  }
  if (input.recentPainLogs?.length) {
    const highMedium = input.recentPainLogs.filter((p) => p.riskLevel === "high" || p.riskLevel === "medium");
    for (const pain of input.recentPainLogs.slice(0, 3)) {
      notes.push(`Pain report (${pain.date}): ${pain.painLocation} level ${pain.painLevel}/10 risk=${pain.riskLevel} impact=${pain.trainingImpact}.`);
    }
    if (highMedium.length > 0) {
      notes.push("IMPORTANT: User has recent medium/high risk pain. Do NOT recommend hard training, speed work, or races. Prioritize easy/rest based on pain impact.");
    }
  }
  return notes;
}

function buildRaceContext(raceGoal: Record<string, unknown> | null, today: string) {
  const raceDate = normalizeDateString(raceGoal?.raceDate);
  const daysUntilRace = raceDate ? dateDiffDays(today, raceDate) : null;
  const activeRaceStatus: CoachContext["activeRaceStatus"] =
    daysUntilRace == null ? "none" : daysUntilRace === 0 ? "today" : daysUntilRace > 0 ? "scheduled" : "past";

  return {
    activeRaceStatus,
    raceDate,
    raceDistance: stringOrNull(raceGoal?.raceDistance),
    raceName: stringOrNull(raceGoal?.raceName),
    daysUntilRace,
    isRaceToday: daysUntilRace === 0,
    isRaceTomorrow: daysUntilRace === 1,
    isRaceWeek: daysUntilRace != null && daysUntilRace >= 0 && daysUntilRace <= 7,
    raceGoalType: stringOrNull(raceGoal?.goalType),
    targetTime: stringOrNull(raceGoal?.targetTime),
  };
}

function normalizeDateString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T12:00:00+07:00`);
  return Number.isNaN(parsed.getTime()) ? null : date;
}

function dateDiffDays(fromDate: string, toDate: string): number | null {
  const from = Date.parse(`${fromDate}T12:00:00+07:00`);
  const to = Date.parse(`${toDate}T12:00:00+07:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseDurationToMin(dur: string | null): number | null {
  if (!dur) return null;
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  return null;
}
