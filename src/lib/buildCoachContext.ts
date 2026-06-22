"use client";

import { loadHistoryItems } from "@/lib/cloudHistory";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import { formatSleepMinutesThai } from "@/lib/sleepDuration";
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
  workouts7d: DayWorkoutSummary[];
  hasWorkoutToday: boolean;
  todayWorkouts: TodayCompletedWorkoutSummary[];
  todayPrimaryWorkout: TodayCompletedWorkoutSummary | null;
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
  latestPain: PainSummary | null;
  recentMaxPain: PainSummary | null;
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

function isResolvedPainLog(log: PainLog | undefined, painLevel: number, redFlags: string[], painType: string[]): boolean {
  if (!log) return false;
  const markedResolved = log.resolved === true || log.status === "resolved";
  if (!markedResolved || painLevel !== 0) return false;
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

function bangkokDateKey(isoString: string): string {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString.slice(0, 10);
  return new Date(d.getTime() + TZ_OFFSET_MS).toISOString().slice(0, 10);
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
    .filter((i) => bangkokDateKey(i.createdAt) >= cutoff);
  const sleep7d: WeekSleepRow[] = sleepItems.map((item) => {
    const d = item.data as SleepAnalysis;
    return {
      date: bangkokDateKey(item.createdAt),
      durationH: d?.extracted?.actualSleepDurationMinutes
        ? formatSleepMinutesThai(d.extracted.actualSleepDurationMinutes)
        : d?.extracted?.sleepDuration ?? null,
      score: d?.extracted?.sleepScore ?? null,
      readiness: d?.coach?.readinessScore ?? null,
      restingHR: d?.extracted?.restingHR ?? null,
      hrv: d?.extracted?.hrv ?? null,
      energyScore: d?.extracted?.energyScore ?? null,
    };
  });

  const scores = sleep7d.map((s) => s.readiness).filter((n): n is number => n != null);
  const avgReadiness = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  const workoutItems = items
    .filter((i) => i.type === "workout")
    .filter((i) => bangkokDateKey(i.createdAt) >= cutoff);

  const strengthItems = items
    .filter((i) => i.type === "strength")
    .filter((i) => bangkokDateKey(i.createdAt) >= cutoff);

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
    const date = bangkokDateKey(item.createdAt);
    const d = item.data as WorkoutAnalysis;
    const ext = d?.extracted;
    if (!ext) continue;

    const durationMin = parseDurationToMin(ext.duration);
    if (date === today) {
      todayWorkouts.push({
        date,
        kind: workoutKindToTodayKind(ext.workoutKind),
        label: workoutKindLabel(ext.workoutKind),
        distanceKm: ext.distanceKm ?? null,
        durationMin,
        durationText: ext.duration ?? null,
        avgHR: ext.avgHR ?? null,
        pace: ext.avgPace ?? null,
        calories: ext.calories ?? null,
      });
    }
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
    const date = bangkokDateKey(item.createdAt);
    const d = item.data as StrengthLog;
    if (!d) continue;

    const day = ensureDay(date);
    totalSessions++;
    day.other.push({ label: `เวท (${d.routineName})`, durationMin: d.durationMin || 15 });
    if (date === today) {
      todayWorkouts.push({
        date,
        kind: "strength",
        label: d.routineName ? `เวท (${d.routineName})` : "เวทเทรนนิ่ง",
        distanceKm: null,
        durationMin: d.durationMin || null,
        durationText: d.durationMin ? `${d.durationMin} นาที` : null,
        avgHR: null,
        pace: null,
        calories: null,
      });
    }
  }

  const workouts7d = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  const nutrition7d = buildNutritionSummaries(items, cutoff);
  const nutritionToday = nutrition7d.find((day) => day.date === today) ?? null;
  const recentRaceResults = (input.raceResults ?? []).map(compactRaceResult);
  for (const result of recentRaceResults.filter((raceResult) => raceResult.raceDate === today)) {
    todayWorkouts.push({
      date: today,
      kind: "race",
      label: result.raceName ? `Race ${result.raceName}` : "Race Result",
      distanceKm: result.actualDistanceKm ?? null,
      durationMin: parseDurationToMin(result.actualTime ?? null),
      durationText: result.actualTime ?? null,
      avgHR: result.avgHr ?? null,
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
    .filter((i) => bangkokDateKey(i.createdAt) >= cutoff)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recentPainLogs: PainSummary[] = painItems.map((item) => {
    const d = item.data as PainLog;
    const redFlags = Array.isArray(d?.redFlags) ? d.redFlags : [];
    const painType = Array.isArray(d?.painType) ? d.painType : [];
    const painLevel = Number.isFinite(Number(d?.painLevel)) ? Number(d?.painLevel) : 0;
    const resolved = isResolvedPainLog(d, painLevel, redFlags, painType);
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
      date: bangkokDateKey(item.createdAt),
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
    hasWorkoutToday: todayWorkouts.length > 0,
    todayWorkouts,
    todayPrimaryWorkout,
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
    latestPain,
    recentMaxPain,
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
      recentPainLogs,
      latestPain,
      recentMaxPain,
      strengthCount: items.filter((i) => i.type === "strength" && bangkokDateKey(i.createdAt) >= cutoff).length,
    }),
  };
}

function buildNutritionSummaries(items: LocalHistoryItem[], cutoff: string): NutritionDaySummary[] {
  const mealItems = items
    .filter((item) => item.type === "meal")
    .filter((item) => bangkokDateKey(item.createdAt) >= cutoff);
  const byDate = new Map<string, MealAnalysis[]>();
  for (const item of mealItems) {
    const date = bangkokDateKey(item.createdAt);
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
  workouts7d: DayWorkoutSummary[];
  hasWorkoutToday?: boolean;
  todayPrimaryWorkout?: TodayCompletedWorkoutSummary | null;
  todayWorkouts?: TodayCompletedWorkoutSummary[];
  totalRunKm: number;
  runDays7d: number;
  recentPainLogs?: PainSummary[];
  latestPain?: PainSummary | null;
  recentMaxPain?: PainSummary | null;
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
  if (input.hasWorkoutToday && input.todayPrimaryWorkout) {
    const workout = input.todayPrimaryWorkout;
    const details = [
      workout.distanceKm != null ? `${workout.distanceKm.toFixed(2)} km` : null,
      workout.durationText ?? (workout.durationMin != null ? `${workout.durationMin} min` : null),
      workout.avgHR != null ? `avg HR ${workout.avgHR}` : null,
      workout.pace ? `pace ${workout.pace}` : null,
    ].filter(Boolean).join(", ");
    notes.push(`TODAY WORKOUT COMPLETED: ${workout.label}${details ? ` (${details})` : ""}. Today Focus should switch to post-workout recovery and must not recommend extra hard training.`);
  }
  if (input.totalRunKm > 0) notes.push(`Last 7 days running load: ${Math.round(input.totalRunKm * 10) / 10} km across ${input.runDays7d} run days.`);
  if (input.longestRun7dKm != null) notes.push(`Longest run in last 7 days: ${input.longestRun7dKm.toFixed(1)} km.`);
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

function parseDurationToMin(dur: string | null): number | null {
  if (!dur) return null;
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  return null;
}
