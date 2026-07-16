import type { WorkoutAnalysis } from "@/types/logs";

// Shape of one entry in Fitbit's Activity Log API response
// (GET /1/user/-/activities/list.json — "activities" array).
export type FitbitActivityLogEntry = {
  logId: number;
  activityName: string;
  activityTypeId: number;
  startTime: string;
  duration: number; // ms
  distance?: number;
  distanceUnit?: string;
  calories?: number;
  averageHeartRate?: number;
  elevationGain?: number;
};

// A handful of Fitbit's built-in activityTypeIds worth mapping directly;
// anything else (weights, yoga, elliptical, etc.) falls back to "other" rather
// than guessing at a RunMate workoutKind that doesn't apply.
const RUN_TYPE_IDS = new Set([90009, 90013, 90001]); // Run, Treadmill (run subtype), Race
const WALK_TYPE_IDS = new Set([90011, 17190]); // Walk
const CYCLING_TYPE_IDS = new Set([90001, 1071, 90019]); // Bike variants

function inferWorkoutKind(activityTypeId: number, activityName: string): WorkoutAnalysis["extracted"]["workoutKind"] {
  const nameLower = activityName.toLowerCase();
  if (RUN_TYPE_IDS.has(activityTypeId) || nameLower.includes("run")) {
    return nameLower.includes("treadmill") ? "treadmill" : "outdoor_run";
  }
  if (WALK_TYPE_IDS.has(activityTypeId) || nameLower.includes("walk")) return "walk";
  if (CYCLING_TYPE_IDS.has(activityTypeId) || nameLower.includes("bike") || nameLower.includes("cycl")) return "cycling";
  if (nameLower.includes("weight") || nameLower.includes("strength")) return "strength";
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

/** Maps one Fitbit activity log entry to the `extracted` half of WorkoutAnalysis.
 *  `coach` is filled in separately via AI — see
 *  src/lib/prompts/coachFromStructuredData.ts. */
export function mapFitbitActivityToExtracted(entry: FitbitActivityLogEntry): WorkoutAnalysis["extracted"] {
  const distanceKm = entry.distance != null
    ? (entry.distanceUnit === "Mile" ? entry.distance * 1.60934 : entry.distance)
    : null;

  return {
    workoutKind: inferWorkoutKind(entry.activityTypeId, entry.activityName),
    date: entry.startTime.slice(0, 10),
    distanceKm,
    duration: formatDurationMs(entry.duration),
    avgPace: formatPace(distanceKm, entry.duration),
    avgSpeedKmh: distanceKm != null ? Number((distanceKm / (entry.duration / 3_600_000)).toFixed(1)) : null,
    avgHR: entry.averageHeartRate ?? null,
    maxHR: null,
    cadence: null,
    calories: entry.calories ?? null,
    elevationGain: entry.elevationGain ?? null,
    vo2Max: null,
    sweatLossMl: null,
    visibleMetrics: ["นำเข้าอัตโนมัติจาก Fitbit"],
    mergedFromMultipleImages: false,
    exercises: null,
    muscleGroups: null,
    intensity: null,
    rpe: null,
    swimKind: null,
    distanceM: null,
  };
}

/** Deterministic history_items id for a Fitbit activity log — makes re-syncing
 *  the same log an upsert instead of a duplicate row. */
export function fitbitActivityHistoryItemId(logId: number): string {
  return `fitbit-activity-${logId}`;
}
