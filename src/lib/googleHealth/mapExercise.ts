import type { WorkoutAnalysis } from "@/types/logs";
import { intervalCivilDateKey, type GoogleHealthExerciseDataPoint } from "@/lib/googleHealth/api";
import { googleHealthDataPointId } from "@/lib/googleHealth/mapSleep";

export function googleHealthExerciseHistoryItemId(name: string): string {
  return `ghealth-exercise-${googleHealthDataPointId(name)}`;
}

// Confirmed against the real exerciseType enum (182 values) in the discovery doc —
// e.g. "RUNNING", "TREADMILL", "TREADMILL_WALK", "WALKING", "NORDIC_WALKING",
// "BIKING", "STRENGTH_TRAINING", "WEIGHTLIFTING". Substring matching (rather than an
// exhaustive switch over all 182) keeps this simple and still catches every relevant
// variant since Google's naming is consistent — but must stay specific enough not to
// false-positive on unrelated types: a bare "BIK" substring check matched
// "YOGA_BIKRAM", so this uses "BIKE"/"BIKING"/"CYCL" instead.
function inferWorkoutKind(exerciseType: string | undefined): WorkoutAnalysis["extracted"]["workoutKind"] {
  const t = exerciseType ?? "";
  if (t.includes("TREADMILL")) return "treadmill";
  if (t.includes("RUN")) return "outdoor_run";
  if (t.includes("WALK") || t.includes("HIK")) return "walk";
  if (t.includes("BIKE") || t.includes("BIKING") || t.includes("CYCL")) return "cycling";
  if (t.includes("STRENGTH") || t.includes("WEIGHT")) return "strength";
  return "other";
}

/** Parses a google-duration string ("1698.134s") to milliseconds. */
function parseGoogleDurationMs(duration: string | undefined): number | null {
  if (!duration || !duration.endsWith("s")) return null;
  const seconds = Number(duration.slice(0, -1));
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function formatDurationMs(ms: number): string {
  const totalMinutes = Math.round(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} m`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** Fallback pace calc from distance+duration, only used when Google's own
 *  averagePaceSecondsPerMeter isn't present on the metricsSummary. */
function formatPaceFromDistance(distanceKm: number | null, durationMs: number): string | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const minutesPerKm = durationMs / 60000 / distanceKm;
  const min = Math.floor(minutesPerKm);
  const sec = Math.round((minutesPerKm - min) * 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function formatPaceSecondsPerMeter(secPerMeter: number): string {
  const secPerKm = secPerMeter * 1000;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

/** Maps one Google Health exercise data point to the `extracted` half of
 *  WorkoutAnalysis. `coach` is filled in separately via AI — see
 *  src/lib/prompts/coachFromStructuredData.ts.
 *
 *  Field names/units confirmed against the real discovery document
 *  (MetricsSummary schema). Prefers Google's own computed pace/speed/duration
 *  (averagePaceSecondsPerMeter, averageSpeedMillimetersPerSecond, activeDuration)
 *  over deriving them from raw distance/interval-duration — Google's versions
 *  already exclude paused time and match what the Google Health/Fit apps
 *  themselves display, so a naive distance÷wall-clock-duration calc would
 *  disagree with the source app for any session with pauses. Falls back to the
 *  naive calc only when the direct field is absent. */
export function mapGoogleHealthExerciseToExtracted(dp: GoogleHealthExerciseDataPoint): WorkoutAnalysis["extracted"] {
  const { interval, exerciseType, displayName, activeDuration, metricsSummary, notes } = dp.exercise;
  const wallClockDurationMs = new Date(interval.endTime).getTime() - new Date(interval.startTime).getTime();
  const durationMs = parseGoogleDurationMs(activeDuration) ?? wallClockDurationMs;
  const distanceKm = metricsSummary?.distanceMillimeters != null ? metricsSummary.distanceMillimeters / 1_000_000 : null;
  const avgHR = metricsSummary?.averageHeartRateBeatsPerMinute != null ? Number(metricsSummary.averageHeartRateBeatsPerMinute) : null;

  const avgPace = metricsSummary?.averagePaceSecondsPerMeter != null
    ? formatPaceSecondsPerMeter(metricsSummary.averagePaceSecondsPerMeter)
    : durationMs > 0 ? formatPaceFromDistance(distanceKm, durationMs) : null;

  const avgSpeedKmh = metricsSummary?.averageSpeedMillimetersPerSecond != null
    ? Number((metricsSummary.averageSpeedMillimetersPerSecond * 0.0036).toFixed(1)) // mm/s -> km/h
    : distanceKm != null && durationMs > 0 ? Number((distanceKm / (durationMs / 3_600_000)).toFixed(1)) : null;

  const visibleMetrics = [displayName, notes, "นำเข้าอัตโนมัติจาก Google Health"].filter((v): v is string => Boolean(v));

  return {
    workoutKind: inferWorkoutKind(exerciseType),
    date: intervalCivilDateKey(interval, "start"),
    distanceKm,
    duration: durationMs > 0 ? formatDurationMs(durationMs) : null,
    avgPace,
    avgSpeedKmh,
    avgHR,
    maxHR: null,
    cadence: null,
    calories: metricsSummary?.caloriesKcal ?? null,
    elevationGain: metricsSummary?.elevationGainMillimeters != null ? Math.round(metricsSummary.elevationGainMillimeters / 1000) : null,
    vo2Max: metricsSummary?.runVo2Max ?? null,
    sweatLossMl: null,
    visibleMetrics,
    mergedFromMultipleImages: false,
    exercises: null,
    muscleGroups: null,
    intensity: null,
    rpe: null,
    swimKind: null,
    distanceM: null,
  };
}
