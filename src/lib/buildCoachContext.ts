"use client";

import { loadHistoryItems } from "@/lib/cloudHistory";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis, WorkoutAnalysis, BodyCompositionAnalysis } from "@/types/logs";

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

export type CoachContext = {
  profile: Record<string, unknown> | null;
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
  activeRaceStatus: "none" | "scheduled" | "today" | "past";
  sleep7d: WeekSleepRow[];
  avgReadiness: number | null;
  workouts7d: DayWorkoutSummary[];
  totalRunKm: number;
  totalSessions: number;
  runDays7d: number;
  longestRun7dKm: number | null;
  lastWorkoutDate: string | null;
  lastRun: { date: string; km: number; durationMin: number; avgHR: number | null; pace: string | null } | null;
  latestBody: { weightKg: number | null; bodyFatPct: number | null; muscleKg: number | null } | null;
  todayDate: string;
  contextNotes: string[];
};

const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;

function todayBangkok(): string {
  return new Date(Date.now() + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function dateBefore(days: number): string {
  return new Date(Date.now() + TZ_OFFSET_MS - days * 86400000).toISOString().slice(0, 10);
}

export function buildCoachContext(): CoachContext {
  return buildCoachContextFromData({ items: [], profile: null, raceGoal: null, racePlan: null });
}

export async function buildCoachContextFromSupabase(): Promise<CoachContext> {
  const [historyResult, profileResult, raceResult] = await Promise.all([
    loadHistoryItems(["sleep", "workout", "body"]),
    loadProfileFromSupabase(),
    loadActiveRaceGoalAndPlan(),
  ]);

  return buildCoachContextFromData({
    items: historyResult.ok ? historyResult.items : [],
    profile: profileResult.ok ? profileResult.profile ?? null : null,
    raceGoal: raceResult.ok ? raceResult.goal : null,
    racePlan: raceResult.ok ? raceResult.plan : null,
  });
}

export function buildCoachContextFromData(input: {
  items: LocalHistoryItem[];
  profile: Record<string, unknown> | null;
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
}): CoachContext {
  const today = todayBangkok();
  const cutoff = dateBefore(7);

  const sleepItems = input.items
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

  const workoutItems = input.items
    .filter((i) => i.type === "workout")
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

  const workouts7d = [...dayMap.values()].sort((a, b) => b.date.localeCompare(a.date));
  const runDays7d = workouts7d.filter((day) => day.runs.length > 0).length;
  const lastWorkoutDate = workouts7d[0]?.date ?? null;

  const latestBodyItem = input.items.filter((i) => i.type === "body")[0];
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
    activeRaceStatus: raceStatus(input.raceGoal, today),
    sleep7d,
    avgReadiness,
    workouts7d,
    totalRunKm: Math.round(totalRunKm * 10) / 10,
    totalSessions,
    runDays7d,
    longestRun7dKm,
    lastWorkoutDate,
    lastRun,
    latestBody,
    todayDate: today,
    contextNotes: buildContextNotes({
      raceGoal: input.raceGoal,
      racePlan: input.racePlan,
      sleep7d,
      workouts7d,
      totalRunKm,
      runDays7d,
      longestRun7dKm,
      lastWorkoutDate,
    }),
  };
}

function raceStatus(raceGoal: Record<string, unknown> | null, today: string): CoachContext["activeRaceStatus"] {
  const date = typeof raceGoal?.raceDate === "string" ? raceGoal.raceDate : null;
  if (!date) return "none";
  if (date === today) return "today";
  return date > today ? "scheduled" : "past";
}

function buildContextNotes(input: {
  raceGoal: Record<string, unknown> | null;
  racePlan: Record<string, unknown> | null;
  sleep7d: WeekSleepRow[];
  workouts7d: DayWorkoutSummary[];
  totalRunKm: number;
  runDays7d: number;
  longestRun7dKm: number | null;
  lastWorkoutDate: string | null;
}): string[] {
  const notes: string[] = [];
  if (!input.raceGoal) notes.push("No active race goal is set. Do not infer an upcoming race from old imported memories.");
  if (!input.racePlan) notes.push("No active weekly/race plan is set. For tomorrow questions, state that the plan is inferred from recent data.");
  if (input.sleep7d.length === 0) notes.push("No sleep data in the last 7 days.");
  if (input.workouts7d.length === 0) notes.push("No workout data in the last 7 days.");
  if (input.totalRunKm > 0) notes.push(`Last 7 days running load: ${Math.round(input.totalRunKm * 10) / 10} km across ${input.runDays7d} run days.`);
  if (input.longestRun7dKm != null) notes.push(`Longest run in last 7 days: ${input.longestRun7dKm.toFixed(1)} km.`);
  if (input.lastWorkoutDate) notes.push(`Last workout date: ${input.lastWorkoutDate}.`);
  return notes;
}

function parseDurationToMin(dur: string | null): number | null {
  if (!dur) return null;
  const parts = dur.split(":").map(Number);
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60);
  if (parts.length === 2) return Math.round(parts[0] + parts[1] / 60);
  return null;
}
