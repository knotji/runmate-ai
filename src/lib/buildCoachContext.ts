"use client";

import { loadHistoryItems } from "@/lib/cloudHistory";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import { formatSleepMinutesShortThai, formatSleepMinutesThai, parseSleepDurationToMinutes } from "@/lib/sleepDuration";
import { dedupeSleepItems } from "@/lib/sleepDedupe";
import { loadRaceResults } from "@/lib/raceResults";
import { extractMealData, normalizeMealNutrition } from "@/lib/mealMerge";
import { buildDailyNutritionBalance } from "@/lib/dailyNutritionBalance";
import type { DailyNutritionBalance } from "@/lib/dailyNutritionBalance";
import type { LocalHistoryItem } from "@/lib/localHistory";
import { getHistoryItemDateKey } from "@/lib/date";
import type { SleepAnalysis, WorkoutAnalysis, BodyCompositionAnalysis, MealAnalysis, HealthCheckAnalysis, LabValue } from "@/types/logs";
import type { PainLog } from "@/types/pain";
import type { RaceResult } from "@/types/race";
import type { StrengthLog } from "@/types/strength";
import { normalizeMealSlot, getMealSlotLabel } from "@/lib/mealSlots";

export type DayWorkoutSummary = {
  date: string;
  runs: { km: number; durationMin: number; avgHR: number | null; pace: string | null }[];
  walks: { km: number | null; durationMin: number }[];
  other: { label: string; durationMin: number }[];
};

export type TodayCompletedWorkoutSummary = {
  date: string;
  kind: "run" | "walk" | "strength" | "cycling" | "race" | "other";
  label: string;
  distanceKm: number | null;
  durationMin: number | null;
  durationText: string | null;
  avgHR: number | null;
  pace: string | null;
  calories: number | null;
};

export type WeekSleepRow = {
  date: string;
  durationH: string | null;
  durationMinutes: number | null;
  score: number | null;
  readiness: number | null;
  restingHR: number | null;
  hrv: number | null;
  energyScore: number | null;
};

export type PainSummary = {
  id: string;
  date: string;
  painLocation: string;
  painSide: string;
  painLevel: number;
  riskLevel: string;
  trainingImpact: string;
  coachAdvice: string;
  swellingOrRedness: string;
  canBearWeight: string;
  redFlags: string[];
  painType: string[];
  painStatus: "active" | "resolved";
  hasActivePain: boolean;
  hasResolvedPain: boolean;
  resolved: boolean;
  resolvedAt: string | null;
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
  sleepAvg7dHours: number | null;
  sleepAvg7dText: string | null;
  sleepNightCount7d: number;
  latestSleepDurationText: string | null;
  latestSleepScore: number | null;
  latestEnergyScore: number | null;
  latestSleepDateKey: string | null;
  workouts7d: DayWorkoutSummary[];
  hasWorkoutToday: boolean;
  todayWorkouts: TodayCompletedWorkoutSummary[];
  todayPrimaryWorkout: TodayCompletedWorkoutSummary | null;
  nutritionToday: NutritionDaySummary | null;
  nutrition7d: NutritionDaySummary[];
  mealsToday: MealContextSummary[];
  latestCompletedRace: RaceResult | null;
  recentRaceResults: RaceResult[];
  latestHealthCheck: HealthCheckContext | null;
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
  latestPain: PainSummary | null;
  recentMaxPain: PainSummary | null;
  activePain: boolean;
  recentPainHistory: boolean;
  painResolved: boolean;
  nutritionBalanceToday: DailyNutritionBalance | null;
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

export type MealContextSummary = {
  mealType: string;
  foods: string[];
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  fatLoad: string | null;
  coachNote: string | null;
};

export type HealthCheckContext = {
  checkupDate: string | null;
  createdAt: string;
  nutritionFlags: HealthCheckAnalysis["nutritionFlags"];
  coachSummary: string;
  foodGuidance: HealthCheckAnalysis["foodGuidance"];
  keyLabs: { key: string; label: string; value: string; status: string }[];
  confidence: HealthCheckAnalysis["confidence"];
};

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

function painHasRedFlag(input: {
  swellingOrRedness?: string | null;
  canBearWeight?: string | null;
  redFlags?: string[] | null;
  painType?: string[] | null;
}): boolean {
  return input.swellingOrRedness === "yes"
    || input.canBearWeight === "no"
    || Boolean(input.redFlags?.length)
    || Boolean(input.painType?.some((type) => /sharp|numb|แปลบ|ชา/i.test(type)));
}

function isResolvedPainLog(log: PainLog | undefined, redFlags: string[], painType: string[]): boolean {
  if (!log) return false;
  const markedResolved = log.resolved === true || log.status === "resolved";
  if (!markedResolved) return false;
  return !painHasRedFlag({
    swellingOrRedness: log.swellingOrRedness,
    canBearWeight: log.canBearWeight,
    redFlags,
    painType,
  });
}

function todayBangkok(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function dateBefore(days: number): string {
  return new Date(Date.now() + TZ_OFFSET_MS - days * 86400000).toISOString().slice(0, 10);
}


function getSleepDurationMinutes(item: LocalHistoryItem): number | null {
  const data = item.data as Record<string, unknown> | null;
  const extracted = data?.extracted as Record<string, unknown> | undefined;
  const sleep = data?.sleep as Record<string, unknown> | undefined;
  const candidates = [
    extracted?.actualSleepDurationMinutes,
    extracted?.actualSleepDurationText,
    extracted?.sleepDuration,
    extracted?.duration,
    extracted?.sleepTime,
    data?.sleepDuration,
    data?.duration,
    data?.sleepTime,
    data?.sleepDurationHours,
    data?.sleepDurationMinutes,
    data?.totalSleepMinutes,
    sleep?.duration,
    sleep?.sleepDuration,
    sleep?.totalSleepMinutes,
  ];
  for (const candidate of candidates) {
    const minutes = parseSleepDurationToMinutes(candidate);
    if (minutes != null) return minutes;
  }
  return null;
}

function averageSleepMinutes(rows: WeekSleepRow[]): number | null {
  const values = rows.map((row) => row.durationMinutes).filter((value): value is number => value != null && value > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDistanceKm(value: unknown): string | null {
  const distance = toFiniteNumber(value);
  if (distance == null) return null;
  return `${distance.toFixed(2)} km`;
}

function formatDurationMin(value: unknown): string | null {
  const duration = toFiniteNumber(value);
  if (duration == null) return null;
  return `${Math.round(duration)} min`;
}

function formatAvgHr(value: unknown): string | null {
  const hr = toFiniteNumber(value);
  if (hr == null) return null;
  return `avg HR ${Math.round(hr)}`;
}

export function buildCoachContext(): CoachContext {
  const ctx = buildCoachContextFromData({ items: [], profile: null, raceGoal: null, racePlan: null });
  return ctx;
}

export async function buildCoachContextFromSupabase(): Promise<CoachContext> {
  const [historyResult, profileResult, raceResult, completedRaceResult] = await Promise.all([
    loadHistoryItems(["sleep", "workout", "body", "meal", "pain", "strength", "health_check"]),
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

  const sleepItems = dedupeSleepItems(
    items
      .filter((i) => i.type === "sleep")
      .filter((i) => getHistoryItemDateKey(i) >= cutoff),
  );
  const sleep7d: WeekSleepRow[] = sleepItems.map((item) => {
    const d = item.data as SleepAnalysis;
    const durationMinutes = getSleepDurationMinutes(item);
    return {
      date: getHistoryItemDateKey(item),
      durationH: durationMinutes
        ? formatSleepMinutesThai(durationMinutes)
        : d?.extracted?.sleepDuration ?? null,
      durationMinutes,
      score: d?.extracted?.sleepScore ?? null,
      readiness: d?.coach?.readinessScore ?? null,
      restingHR: d?.extracted?.restingHR ?? null,
      hrv: d?.extracted?.hrv ?? null,
      energyScore: d?.extracted?.energyScore ?? null,
    };
  });

  const scores = sleep7d.map((s) => s.readiness).filter((n): n is number => n != null);
  const avgReadiness = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const avgSleepMinutes = averageSleepMinutes(sleep7d);
  const sleepAvg7dHours = avgSleepMinutes != null ? Math.round((avgSleepMinutes / 60) * 10) / 10 : null;
  const sleepAvg7dText = avgSleepMinutes != null ? formatSleepMinutesShortThai(avgSleepMinutes) : null;
  const latestSleep = sleep7d[0] ?? null;

  const workoutItems = items
    .filter((i) => i.type === "workout")
    .filter((i) => getHistoryItemDateKey(i) >= cutoff);

  const strengthItems = items
    .filter((i) => i.type === "strength")
    .filter((i) => getHistoryItemDateKey(i) >= cutoff);

  const dayMap = new Map<string, DayWorkoutSummary>();
  const ensureDay = (date: string) => {
    if (!dayMap.has(date)) dayMap.set(date, { date, runs: [], walks: [], other: [] });
    return dayMap.get(date)!;
  };

  let totalRunKm = 0;
  let totalSessions = 0;
  let longestRun7dKm: number | null = null;
  let lastRun: CoachContext["lastRun"] = null;
  const todayWorkouts: TodayCompletedWorkoutSummary[] = [];

  for (const item of workoutItems) {
    const date = getHistoryItemDateKey(item);
    const d = item.data as WorkoutAnalysis;
    const ext = d?.extracted;
    if (!ext) continue;

    const durationMin = parseDurationToMin(ext.duration);
    const distanceKm = toFiniteNumber(ext.distanceKm);
    const avgHR = toFiniteNumber(ext.avgHR);
    const calories = toFiniteNumber(ext.calories);
    if (date === today) {
      todayWorkouts.push({
        date,
        kind: workoutKindToTodayKind(ext.workoutKind),
        label: workoutKindLabel(ext.workoutKind),
        distanceKm,
        durationMin,
        durationText: typeof ext.duration === "string" && ext.duration.trim() ? ext.duration : null,
        avgHR,
        pace: ext.avgPace ?? null,
        calories,
      });
    }
    if (!durationMin) continue;

    const day = ensureDay(date);
    totalSessions++;

    if (ext.workoutKind === "outdoor_run" || ext.workoutKind === "treadmill") {
      const km = distanceKm ?? 0;
      totalRunKm += km;
      day.runs.push({ km, durationMin, avgHR, pace: ext.avgPace ?? null });
      longestRun7dKm = Math.max(longestRun7dKm ?? 0, km);
      if (!lastRun || date > lastRun.date) {
        lastRun = { date, km, durationMin, avgHR, pace: ext.avgPace ?? null };
      }
    } else if (ext.workoutKind === "walk") {
      day.walks.push({ km: distanceKm, durationMin });
    } else {
      const label = ext.workoutKind === "strength" ? "เวท" : ext.workoutKind === "cycling" ? "ปั่นจักรยาน" : "ออกกำลังกาย";
      day.other.push({ label, durationMin });
    }
  }

  for (const item of strengthItems) {
    const date = getHistoryItemDateKey(item);
    const d = item.data as StrengthLog;
    if (!d) continue;
    const durationMin = toFiniteNumber(d.durationMin) ?? 15;

    const day = ensureDay(date);
    totalSessions++;
    day.other.push({ label: `เวท (${d.routineName})`, durationMin });
    if (date === today) {
      todayWorkouts.push({
        date,
        kind: "strength",
        label: d.routineName ? `เวท (${d.routineName})` : "เวทเทรนนิ่ง",
        distanceKm: null,
        durationMin,
        durationText: `${durationMin} นาที`,
        avgHR: null,
        pace: null,
        calories: null,
      });
    }
  }

  const workouts7d = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  const nutrition7d = buildNutritionSummaries(items, cutoff);
  const nutritionToday = nutrition7d.find((day) => day.date === today) ?? null;
  const mealsToday = items
    .filter((item) => item.type === "meal" && getHistoryItemDateKey(item) === today)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(compactMealForCoach);
  const latestHealthCheck = items
    .filter((i) => i.type === "health_check")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(compactHealthCheck)
    .find((item): item is HealthCheckContext => Boolean(item)) ?? null;
  const recentRaceResults = (input.raceResults ?? []).map(compactRaceResult);
  for (const result of recentRaceResults.filter((raceResult) => raceResult.raceDate === today)) {
    todayWorkouts.push({
      date: today,
      kind: "race",
      label: result.raceName ? `Race ${result.raceName}` : "Race Result",
      distanceKm: toFiniteNumber(result.actualDistanceKm),
      durationMin: parseDurationToMin(result.actualTime ?? null),
      durationText: result.actualTime ?? null,
      avgHR: toFiniteNumber(result.avgHr),
      pace: result.actualPace ?? null,
      calories: null,
    });
  }
  const latestCompletedRace = recentRaceResults[0] ?? null;
  const runDays7d = workouts7d.filter((day) => day.runs.length > 0).length;
  const lastWorkoutDate = workouts7d[0]?.date ?? null;
  const todayPrimaryWorkout = pickTodayPrimaryWorkout(todayWorkouts);

  // Pain logs — last 7 days, most recent first
  const painItems = items
    .filter((i) => i.type === "pain")
    .filter((i) => getHistoryItemDateKey(i) >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recentPainLogs: PainSummary[] = painItems.map((item) => {
    const d = item.data as PainLog;
    const redFlags = Array.isArray(d?.redFlags) ? d.redFlags : [];
    const painType = Array.isArray(d?.painType) ? d.painType : [];
    const painLevel = Number.isFinite(Number(d?.painLevel)) ? Number(d?.painLevel) : 0;
    const resolved = isResolvedPainLog(d, redFlags, painType);
    const hasActivePain = !resolved && (
      painLevel > 0
      || painHasRedFlag({
        swellingOrRedness: d?.swellingOrRedness,
        canBearWeight: d?.canBearWeight,
        redFlags,
        painType,
      })
    );
    return {
      id: item.id,
      date: getHistoryItemDateKey(item),
      painLocation: d?.painLocation ?? "ไม่ระบุ",
      painSide: d?.painSide ?? "unknown",
      painLevel,
      riskLevel: d?.riskLevel ?? "unknown",
      trainingImpact: d?.trainingImpact ?? "unknown",
      coachAdvice: d?.coachAdvice ?? "",
      swellingOrRedness: d?.swellingOrRedness ?? "unknown",
      canBearWeight: d?.canBearWeight ?? "unknown",
      redFlags,
      painType,
      painStatus: resolved ? "resolved" : "active",
      hasActivePain,
      hasResolvedPain: resolved,
      resolved,
      resolvedAt: d?.resolvedAt ?? null,
    };
  });
  const recentPainCutoff3d = dateBefore(3);
  const latestPain = recentPainLogs[0] ?? null;
  const recentMaxPain = recentPainLogs
    .filter((pain) => pain.date >= recentPainCutoff3d)
    .reduce<PainSummary | null>((max, pain) => (!max || pain.painLevel > max.painLevel ? pain : max), null);
  const activePain = Boolean(latestPain?.hasActivePain);
  const painResolved = Boolean(latestPain?.hasResolvedPain);
  const recentPainHistory = Boolean(
    recentMaxPain
    && recentMaxPain.painLevel >= 3
    && (painResolved || recentMaxPain.painLevel > (latestPain?.painLevel ?? 0))
  );

  const nutritionBalanceToday = mealsToday.length > 0
    ? buildDailyNutritionBalance({
        dateKey: today,
        mealsToday,
        latestHealthCheck,
        todayPrimaryWorkout: pickTodayPrimaryWorkout(todayWorkouts),
        isRecoveryDay: todayWorkouts.length === 0,
      })
    : null;

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
    sleepAvg7dHours,
    sleepAvg7dText,
    sleepNightCount7d: sleep7d.length,
    latestSleepDurationText: latestSleep?.durationMinutes ? formatSleepMinutesThai(latestSleep.durationMinutes) : latestSleep?.durationH ?? null,
    latestSleepScore: latestSleep?.score ?? null,
    latestEnergyScore: latestSleep?.energyScore ?? null,
    latestSleepDateKey: latestSleep?.date ?? null,
    workouts7d,
    hasWorkoutToday: todayWorkouts.length > 0,
    todayWorkouts,
    todayPrimaryWorkout,
    nutritionToday,
    nutrition7d,
    mealsToday,
    latestCompletedRace,
    recentRaceResults,
    latestHealthCheck,
    totalRunKm: Math.round(totalRunKm * 10) / 10,
    totalSessions,
    runDays7d,
    longestRun7dKm,
    lastWorkoutDate,
    lastRun,
    latestBody,
    todayDate: today,
    recentPainLogs,
    latestPain,
    recentMaxPain,
    activePain,
    recentPainHistory,
    painResolved,
    nutritionBalanceToday,
    contextNotes: buildContextNotes({
      raceGoal: input.raceGoal,
      racePlan: input.racePlan,
      raceResults: recentRaceResults,
      sleep7d,
      workouts7d,
      hasWorkoutToday: todayWorkouts.length > 0,
      todayPrimaryWorkout,
      todayWorkouts,
      totalRunKm,
      runDays7d,
      longestRun7dKm,
      lastWorkoutDate,
      sleepAvg7dText,
      sleepNightCount7d: sleep7d.length,
      latestSleepDurationText: latestSleep?.durationMinutes ? formatSleepMinutesThai(latestSleep.durationMinutes) : latestSleep?.durationH ?? null,
      latestSleepScore: latestSleep?.score ?? null,
      latestEnergyScore: latestSleep?.energyScore ?? null,
      latestSleepDateKey: latestSleep?.date ?? null,
      recentPainLogs,
      latestPain,
      recentMaxPain,
      latestHealthCheck,
      mealsToday,
      nutritionBalanceToday,
      strengthCount: items.filter((i) => i.type === "strength" && getHistoryItemDateKey(i) >= cutoff).length,
    }),
  };
}

function buildNutritionSummaries(items: LocalHistoryItem[], cutoff: string): NutritionDaySummary[] {
  const mealItems = items
    .filter((item) => item.type === "meal")
    .filter((item) => getHistoryItemDateKey(item) >= cutoff);
  const byDate = new Map<string, MealAnalysis[]>();
  for (const item of mealItems) {
    const date = getHistoryItemDateKey(item);
    const list = byDate.get(date) ?? [];
    list.push(extractMealData(item));
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

function compactMealForCoach(item: LocalHistoryItem): MealContextSummary {
  const meal = extractMealData(item);
  const slot = normalizeMealSlot(meal.mealSlot || meal.mealType, item.recordedAt || item.createdAt);
  const slotLabel = getMealSlotLabel(slot);
  const nutrition = normalizeMealNutrition(meal as unknown as Record<string, unknown>);
  const foods = (meal.detectedFoods ?? [])
    .map((food) => food.name?.trim())
    .filter((food): food is string => Boolean(food))
    .slice(0, 8);
  return {
    mealType: slotLabel,
    foods,
    caloriesKcal: nutrition.caloriesKcal,
    proteinG: nutrition.proteinG,
    carbsG: nutrition.carbsG,
    fatG: nutrition.fatG,
    fiberG: nutrition.fiberG,
    fatLoad: meal.trainingFit?.fatLoad ?? null,
    coachNote: meal.trainingFit?.coachNote ?? meal.coachNote ?? null,
  };
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

function compactHealthCheck(item: LocalHistoryItem): HealthCheckContext | null {
  const data = item.data as HealthCheckAnalysis | null;
  if (!data) return null;
  const keyLabs = getHealthCheckKeyLabs(data).slice(0, 10).map(([key, lab]) => ({
    key,
    label: lab.label,
    value: formatHealthLabValue(lab),
    status: lab.status ?? "unknown",
  }));
  return {
    checkupDate: data.checkupDate ?? null,
    createdAt: item.createdAt,
    nutritionFlags: data.nutritionFlags,
    coachSummary: data.coachSummary,
    foodGuidance: data.foodGuidance,
    keyLabs,
    confidence: data.confidence,
  };
}

function getHealthCheckKeyLabs(healthCheck: HealthCheckAnalysis): [string, LabValue][] {
  const order: (keyof HealthCheckAnalysis["labs"])[] = [
    "fbs",
    "hba1c",
    "totalCholesterol",
    "triglyceride",
    "ldl",
    "hdl",
    "uricAcid",
    "creatinine",
    "egfr",
    "sgotAst",
    "sgptAlt",
  ];
  const labs = healthCheck.labs ?? {};
  return order
    .map((key) => [key, labs[key]] as [string, LabValue | undefined])
    .filter((entry): entry is [string, LabValue] => Boolean(entry[1]?.label || entry[1]?.value != null));
}

function formatHealthLabValue(lab: LabValue): string {
  const value = lab.value == null || lab.value === "" ? "-" : String(lab.value);
  return lab.unit ? `${value} ${lab.unit}` : value;
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

function workoutKindToTodayKind(kind: WorkoutAnalysis["extracted"]["workoutKind"]): TodayCompletedWorkoutSummary["kind"] {
  if (kind === "outdoor_run" || kind === "treadmill") return "run";
  if (kind === "walk") return "walk";
  if (kind === "strength") return "strength";
  if (kind === "cycling") return "cycling";
  return "other";
}

function workoutKindLabel(kind: WorkoutAnalysis["extracted"]["workoutKind"]): string {
  if (kind === "outdoor_run") return "วิ่งนอก";
  if (kind === "treadmill") return "วิ่งลู่";
  if (kind === "walk") return "เดิน";
  if (kind === "strength") return "เวทเทรนนิ่ง";
  if (kind === "cycling") return "ปั่นจักรยาน";
  return "ออกกำลังกาย";
}

function pickTodayPrimaryWorkout(workouts: TodayCompletedWorkoutSummary[]): TodayCompletedWorkoutSummary | null {
  if (workouts.length === 0) return null;
  return [...workouts].sort((a, b) => todayWorkoutRank(b) - todayWorkoutRank(a))[0] ?? null;
}

function todayWorkoutRank(workout: TodayCompletedWorkoutSummary): number {
  const kindScore =
    workout.kind === "race" ? 50 :
    workout.kind === "run" ? 40 :
    workout.kind === "strength" ? 30 :
    workout.kind === "cycling" ? 20 :
    workout.kind === "walk" ? 10 :
    0;
  return kindScore + (workout.distanceKm ?? 0) + ((workout.durationMin ?? 0) / 100);
}

function buildContextNotes(input: {
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
  raceResults: RaceResult[];
  sleep7d: WeekSleepRow[];
  sleepAvg7dText?: string | null;
  sleepNightCount7d?: number;
  latestSleepDurationText?: string | null;
  latestSleepScore?: number | null;
  latestEnergyScore?: number | null;
  latestSleepDateKey?: string | null;
  workouts7d: DayWorkoutSummary[];
  hasWorkoutToday?: boolean;
  todayPrimaryWorkout?: TodayCompletedWorkoutSummary | null;
  todayWorkouts?: TodayCompletedWorkoutSummary[];
  totalRunKm: number;
  runDays7d: number;
  recentPainLogs?: PainSummary[];
  latestPain?: PainSummary | null;
  recentMaxPain?: PainSummary | null;
  latestHealthCheck?: HealthCheckContext | null;
  mealsToday?: MealContextSummary[];
  nutritionBalanceToday?: DailyNutritionBalance | null;
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
  if (input.latestHealthCheck) {
    const health = input.latestHealthCheck;
    const flagLabels: string[] = [];
    const flags = health.nutritionFlags;
    if (flags.watchLDL || flags.watchTotalCholesterol) flagLabels.push("LDL/Cholesterol");
    if (flags.watchLiverEnzymes) flagLabels.push("liver enzymes");
    if (flags.watchBloodSugar) flagLabels.push("blood sugar");
    if (flags.watchUricAcid) flagLabels.push("uric acid");
    if (flags.watchKidney) flagLabels.push("kidney values");

    const prefer = health.foodGuidance.prefer.slice(0, 3).join(", ");
    const limit = health.foodGuidance.limit.slice(0, 3).join(", ");

    const parts = [
      flagLabels.length ? flagLabels.map(f => `watch ${f}`).join(", ") : null,
      prefer ? `prefer ${prefer}` : null,
      limit ? `limit ${limit}` : null,
    ].filter(Boolean);

    notes.push(`Health check: ${parts.join("; ")}.`);
  }
  if (input.mealsToday?.length) {
    notes.push(`MEALS TODAY: ${input.mealsToday.map((meal) => `${meal.mealType}: ${meal.foods.join(", ") || "foods not specified"}`).join(" | ")}. Use this to avoid repeating the same main protein or menu style in the next meal.`);
  } else {
    notes.push("No meals logged today. Do not pretend the user already ate a meal.");
  }
  if (input.nutritionBalanceToday && input.nutritionBalanceToday.mealCount > 0) {
    const nb = input.nutritionBalanceToday;
    const parts = [
      `protein=${nb.proteinStatus}`,
      `carbs=${nb.carbStatus}`,
      `veggie/fiber=${nb.veggieFiberStatus}`,
      `fried/fat=${nb.friedFatStatus}`,
      `sugar=${nb.sugarStatus}`,
      `variety=${nb.varietyStatus}`,
    ];
    if (nb.repeatedItems.length) parts.push(`repeated: ${nb.repeatedItems.join(", ")}`);
    notes.push(`DAILY NUTRITION BALANCE: ${parts.join("; ")}. Summary: ${nb.summaryText}. Next meal hints: ${nb.nextMealHints.join("; ") || "none"}.${nb.healthCheckBiases.length ? ` Health check biases: ${nb.healthCheckBiases.join("; ")}.` : ""} Confidence: ${nb.confidence}.`);
  }
  if (!input.racePlan) notes.push("No active weekly/race plan is set. For tomorrow questions, state that the plan is inferred from recent data.");
  if (input.sleep7d.length === 0) notes.push("No sleep data in the last 7 days.");
  if (input.sleepAvg7dText) {
    notes.push(`SLEEP AVG 7D SOURCE OF TRUTH: ${input.sleepAvg7dText} from ${input.sleepNightCount7d ?? input.sleep7d.length} deduped sleep night(s). Never use older sleep averages from chat history.`);
  }
  if (input.latestSleepDurationText) {
    notes.push(`LATEST SLEEP SOURCE OF TRUTH: ${input.latestSleepDateKey ?? "latest"} duration ${input.latestSleepDurationText}, sleep score ${input.latestSleepScore ?? "unknown"}, energy ${input.latestEnergyScore ?? "unknown"}.`);
  }
  if (input.workouts7d.length === 0) notes.push("No workout data in the last 7 days.");
  if (input.hasWorkoutToday && input.todayPrimaryWorkout) {
    const workout = input.todayPrimaryWorkout;
    const details = [
      formatDistanceKm(workout.distanceKm),
      workout.durationText ?? formatDurationMin(workout.durationMin),
      formatAvgHr(workout.avgHR),
      workout.pace ? `pace ${workout.pace}` : null,
    ].filter(Boolean).join(", ");
    notes.push(`TODAY WORKOUT COMPLETED: ${workout.label}${details ? ` (${details})` : ""}. Today Focus should switch to post-workout recovery and must not recommend extra hard training.`);
  }
  const totalRunKm = toFiniteNumber(input.totalRunKm);
  const longestRun7dKm = toFiniteNumber(input.longestRun7dKm);
  if (totalRunKm != null && totalRunKm > 0) notes.push(`Last 7 days running load: ${Math.round(totalRunKm * 10) / 10} km across ${input.runDays7d} run days.`);
  if (longestRun7dKm != null) notes.push(`Longest run in last 7 days: ${longestRun7dKm.toFixed(1)} km.`);
  if (input.lastWorkoutDate) notes.push(`Last workout date: ${input.lastWorkoutDate}.`);
  if (input.strengthCount && input.strengthCount > 0) {
    notes.push(`Strength training in last 7 days: completed ${input.strengthCount} strength session(s).`);
  }
  if (input.recentPainLogs?.length) {
    const recentCutoff3d = new Date(Date.now() + TZ_OFFSET_MS - 3 * 86400000).toISOString().slice(0, 10);
    const latest = input.latestPain ?? input.recentPainLogs[0];
    const recentMax = input.recentMaxPain ?? input.recentPainLogs
      .filter((pain) => pain.date >= recentCutoff3d)
      .reduce<PainSummary | null>((max, pain) => (!max || pain.painLevel > max.painLevel ? pain : max), null);
    const activeLatest = latest.hasActivePain || painHasRedFlag(latest);
    const latestResolved = latest.hasResolvedPain && !activeLatest;
    const highMedium = input.recentPainLogs.filter((p) => p.hasActivePain && (p.riskLevel === "high" || p.riskLevel === "medium"));
    if (latestResolved) {
      notes.push(`RESOLVED PAIN STATUS: latest ${latest.painLocation} is marked resolved on ${latest.resolvedAt ?? latest.date}. Do NOT describe this as an active injury. Use gradual ramp-up wording.`);
    } else {
      notes.push(`CURRENT PAIN STATUS: latest ${latest.painLocation} level ${latest.painLevel}/10 on ${latest.date}. Use this as current pain wording.`);
    }
    if (recentMax && recentMax.painLevel > latest.painLevel) {
      notes.push(`RECENT MAX PAIN SAFETY CONTEXT: ${recentMax.painLocation} reached ${recentMax.painLevel}/10 within the last 3 days. Mention only as history/safety context, not current pain.`);
    }
    for (const pain of input.recentPainLogs.slice(0, 3)) {
      const flags: string[] = [];
      if (pain.swellingOrRedness === "yes") flags.push("swelling/redness");
      if (pain.canBearWeight === "no") flags.push("cannot bear weight");
      if (pain.redFlags?.length) flags.push(`redFlags: ${pain.redFlags.slice(0, 3).join(", ")}`);
      const sideStr = pain.painSide !== "unknown" ? ` (${pain.painSide})` : "";
      const flagStr = flags.length ? ` [${flags.join("; ")}]` : "";
      const statusStr = pain.hasResolvedPain ? "resolved" : "active";
      notes.push(`Pain report (${pain.date}): ${pain.painLocation}${sideStr} level ${pain.painLevel}/10 status=${statusStr} risk=${pain.riskLevel} impact=${pain.trainingImpact}${flagStr}.`);
    }
    if (highMedium.length > 0) {
      notes.push("IMPORTANT: User has recent medium/high risk pain history. Do NOT recommend hard training, speed work, or races. Prioritize rest or low-impact recovery.");
    }
    const activePain = input.recentPainLogs.filter((p) => p.date >= recentCutoff3d && p.hasActivePain && p.painLevel >= 3);
    if (activePain.length > 0) {
      const safetyPain = latest.painLevel >= 3 ? latest : (recentMax ?? activePain[0]);
      if (latestResolved) {
        notes.push(`RESOLVED PAIN RAMP-UP: Latest pain is resolved, but recent max was ${safetyPain.painLevel}/10. Avoid sudden hard sessions and ramp load gradually.`);
      } else if (latest.painLevel >= 3) {
        notes.push(`INJURY CONSTRAINT: Current ${latest.painLocation} pain is level ${latest.painLevel}/10. Today/tomorrow plan MUST prioritize Rest/Recovery. Do NOT recommend 'Easy Run' as default. Easy run only as conditional if walking and warm-up are pain-free.`);
      } else {
        notes.push(`INJURY SAFETY HISTORY: Current pain is mild (${latest.painLocation} ${latest.painLevel}/10), but recent max was ${safetyPain.painLevel}/10. Today/tomorrow plan should still reduce load and avoid hard training.`);
      }
      if (safetyPain.canBearWeight === "no" || safetyPain.swellingOrRedness === "yes") {
        notes.push("RED FLAG: Injury with swelling/redness or inability to bear weight. Do NOT recommend any running. Recommend rest and professional evaluation if worsening.");
      }
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

function parseDurationToMin(dur: unknown): number | null {
  if (dur == null) return null;
  if (typeof dur === "number") return Number.isFinite(dur) ? Math.round(dur) : null;
  if (typeof dur !== "string") return null;
  const trimmed = dur.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2 && parts.every(Number.isFinite)) return Math.round(parts[0] + parts[1] / 60);
  return toFiniteNumber(trimmed);
}
