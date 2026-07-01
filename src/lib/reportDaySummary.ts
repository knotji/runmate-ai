/**
 * Pure helper — no React, no "use client".
 * Extracts a compact day summary from history items for the collapsed Report card.
 */

import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis, WorkoutAnalysis, BodyCompositionAnalysis } from "@/types/logs";
import type { PainLog } from "@/types/pain";
import type { StrengthLog } from "@/types/strength";
import { extractMealData, normalizeMealNutrition } from "@/lib/mealMerge";

export type ReportDaySummary = {
  dateKey: string;
  readiness: number | null;
  sleepHours: number | null;
  runKm: number | null;
  strengthMins: number | null;
  walkMins: number | null;
  hasRestWorkout: boolean;
  mealCount: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  caloriesKcal: number | null;
  /** "active" | "resolved" | null */
  painStatus: "active" | "resolved" | null;
  painLevel: number | null;
  bodyWeightKg: number | null;
  hasDailySummary: boolean;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function readinessFromSleep(item: LocalHistoryItem): number | null {
  const score = (item.data as SleepAnalysis)?.coach?.readinessScore;
  return score != null && score > 0 ? score : null;
}

function sleepHoursFromItem(item: LocalHistoryItem): number | null {
  const d = item.data as Record<string, unknown> | null;
  const ext = d?.extracted as Record<string, unknown> | undefined;
  const candidates: unknown[] = [
    ext?.actualSleepDurationMinutes,
    ext?.sleepDuration,
    ext?.duration,
    d?.sleepDurationHours,
    d?.sleepDurationMinutes,
    d?.totalSleepMinutes,
  ];
  for (const v of candidates) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
      // If value looks like minutes (> 12) convert to hours; if already hours keep
      return v > 12 ? v / 60 : v;
    }
    if (typeof v === "string" && v.includes(":")) {
      const [h, m] = v.split(":").map(Number);
      if (!isNaN(h) && !isNaN(m)) return h + m / 60;
    }
  }
  return null;
}

function parseDurationMins(duration: string | null | undefined): number | null {
  if (!duration) return null;
  const parts = duration.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return Math.round(parts[0] * 60 + parts[1] + parts[2] / 60) || null;
  if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]) || null;
  return null;
}

function workoutKind(item: LocalHistoryItem): string | undefined {
  return (item.data as WorkoutAnalysis)?.extracted?.workoutKind;
}

function isRun(item: LocalHistoryItem): boolean {
  const k = workoutKind(item);
  return k === "outdoor_run" || k === "treadmill" || k === "run";
}

function isWalk(item: LocalHistoryItem): boolean {
  return workoutKind(item) === "walk";
}

function isStrength(item: LocalHistoryItem): boolean {
  return workoutKind(item) === "strength";
}

function isRest(item: LocalHistoryItem): boolean {
  return workoutKind(item) === "other";
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildReportDaySummary(items: LocalHistoryItem[], dateKey: string): ReportDaySummary {
  const sleeps   = items.filter((i) => i.type === "sleep");
  const workouts = items.filter((i) => i.type === "workout");
  const meals    = items.filter((i) => i.type === "meal");
  const strengths = items.filter((i) => i.type === "strength");
  const pains    = items.filter((i) => i.type === "pain");
  const bodies   = items.filter((i) => i.type === "body");
  const summaries = items.filter((i) => i.type === "summary");

  // Readiness — best score from sleep items
  let readiness: number | null = null;
  for (const s of sleeps) {
    const r = readinessFromSleep(s);
    if (r != null && (readiness === null || r > readiness)) readiness = r;
  }

  // Sleep hours — latest sleep item
  const latestSleep = [...sleeps].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const sleepHours = latestSleep ? sleepHoursFromItem(latestSleep) : null;

  // Run km
  let runKm: number | null = null;
  for (const w of workouts.filter(isRun)) {
    const km = Number((w.data as WorkoutAnalysis)?.extracted?.distanceKm);
    if (km > 0) runKm = (runKm ?? 0) + km;
  }

  // Strength duration — prefer type:"strength" items (have durationMin), else type:"workout"
  let strengthMins: number | null = null;
  if (strengths.length > 0) {
    const log = strengths[0].data as StrengthLog;
    strengthMins = log?.durationMin ?? null;
  } else {
    const sw = workouts.find(isStrength);
    if (sw) strengthMins = parseDurationMins((sw.data as WorkoutAnalysis)?.extracted?.duration);
  }

  // Walk duration
  let walkMins: number | null = null;
  const walkWorkout = workouts.find(isWalk);
  if (walkWorkout) {
    walkMins = parseDurationMins((walkWorkout.data as WorkoutAnalysis)?.extracted?.duration);
  }

  // Rest
  const hasRestWorkout = workouts.some(isRest);

  // Meals / nutrition
  const mealCount = meals.length;
  let proteinG: number | null = null;
  let carbsG: number | null = null;
  let fatG: number | null = null;
  let caloriesKcal: number | null = null;
  for (const m of meals) {
    const n = normalizeMealNutrition(extractMealData(m) as unknown as Record<string, unknown>);
    if (n.proteinG != null) proteinG = (proteinG ?? 0) + n.proteinG;
    if (n.carbsG != null) carbsG = (carbsG ?? 0) + n.carbsG;
    if (n.fatG != null) fatG = (fatG ?? 0) + n.fatG;
    if (n.caloriesKcal != null) caloriesKcal = (caloriesKcal ?? 0) + n.caloriesKcal;
  }

  // Pain
  let painStatus: "active" | "resolved" | null = null;
  let painLevel: number | null = null;
  if (pains.length > 0) {
    const p = pains[0].data as PainLog | undefined;
    const lvl = Number(p?.painLevel);
    const resolved = lvl === 0 && Boolean(p?.resolved || p?.status === "resolved");
    painStatus = resolved ? "resolved" : "active";
    painLevel = Number.isFinite(lvl) ? lvl : null;
  }

  // Body weight
  const bodyWeightKg = (bodies[0]?.data as BodyCompositionAnalysis)?.extracted?.weightKg ?? null;

  return {
    dateKey,
    readiness,
    sleepHours: sleepHours != null ? Math.round(sleepHours * 10) / 10 : null,
    runKm: runKm != null ? Math.round(runKm * 10) / 10 : null,
    strengthMins,
    walkMins,
    hasRestWorkout,
    mealCount,
    proteinG: proteinG != null ? Math.round(proteinG) : null,
    carbsG: carbsG != null ? Math.round(carbsG) : null,
    fatG: fatG != null ? Math.round(fatG) : null,
    caloriesKcal: caloriesKcal != null ? Math.round(caloriesKcal) : null,
    painStatus,
    painLevel,
    bodyWeightKg: bodyWeightKg != null ? Math.round(bodyWeightKg * 10) / 10 : null,
    hasDailySummary: summaries.length > 0,
  };
}
