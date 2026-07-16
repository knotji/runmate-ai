import type { WorkoutAnalysis } from "@/types/logs";
import type { GoogleHealthExerciseDataPoint } from "@/lib/googleHealth/api";
import { googleHealthDataPointId } from "@/lib/googleHealth/mapSleep";

export function googleHealthExerciseHistoryItemId(name: string): string {
  return `ghealth-exercise-${googleHealthDataPointId(name)}`;
}

function inferWorkoutKind(exerciseType: string | undefined): WorkoutAnalysis["extracted"]["workoutKind"] {
  const t = (exerciseType ?? "").toUpperCase();
  if (t.includes("TREADMILL")) return "treadmill";
  if (t.includes("RUN")) return "outdoor_run";
  if (t.includes("WALK") || t.includes("HIK")) return "walk";
  if (t.includes("BIK") || t.includes("CYCL")) return "cycling";
  if (t.includes("STRENGTH") || t.includes("WEIGHT")) return "strength";
  return "other";
}

function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} m`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} m`;
}

function formatPace(distanceKm: number | null, durationMs: number): string | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const minutesPerKm = durationMs / 60000 / distanceKm;
  const min = Math.floor(minutesPerKm);
  const sec = Math.round((minutesPerKm - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

/** Maps one Google Health exercise data point to the `extracted` half of
 *  WorkoutAnalysis. `coach` is filled in separately via AI — see
 *  src/lib/prompts/coachFromStructuredData.ts.
 *
 *  Distance is NOT confirmed from the API's own CLI source (only
 *  caloriesKcal / averageHeartRateBeatsPerMinute were) — metricsSummary is
 *  read defensively here and falls back to null rather than guessing wrong,
 *  same "not visible -> null" convention the rest of extracted uses. Verify
 *  the actual field name once real API access exists. */
export function mapGoogleHealthExerciseToExtracted(dp: GoogleHealthExerciseDataPoint): WorkoutAnalysis["extracted"] {
  const { interval, exerciseType, metricsSummary, notes } = dp.exercise;
  const durationMs = new Date(interval.endTime).getTime() - new Date(interval.startTime).getTime();
  const metrics = metricsSummary as (typeof metricsSummary & { distanceMeters?: number }) | undefined;
  const distanceKm = metrics?.distanceMeters != null ? metrics.distanceMeters / 1000 : null;

  return {
    workoutKind: inferWorkoutKind(exerciseType),
    date: interval.startTime.slice(0, 10),
    distanceKm,
    duration: durationMs > 0 ? formatDurationMs(durationMs) : null,
    avgPace: durationMs > 0 ? formatPace(distanceKm, durationMs) : null,
    avgSpeedKmh: distanceKm != null && durationMs > 0 ? Number((distanceKm / (durationMs / 3_600_000)).toFixed(1)) : null,
    avgHR: metricsSummary?.averageHeartRateBeatsPerMinute ?? null,
    maxHR: null,
    cadence: null,
    calories: metricsSummary?.caloriesKcal ?? null,
    elevationGain: null,
    vo2Max: null,
    sweatLossMl: null,
    visibleMetrics: notes ? [notes, "นำเข้าอัตโนมัติจาก Google Health"] : ["นำเข้าอัตโนมัติจาก Google Health"],
    mergedFromMultipleImages: false,
    exercises: null,
    muscleGroups: null,
    intensity: null,
    rpe: null,
    swimKind: null,
    distanceM: null,
  };
}
