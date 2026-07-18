/**
 * Pure helper — no Supabase/React. Google Health's own per-record dedup (see
 * googleHealthExerciseHistoryItemId) only prevents re-importing the exact same
 * session record on a repeat sync. It can't catch the case reported live: two
 * different devices/apps (e.g. phone + watch) both syncing the *same*
 * real-world run into Health Connect as two separate session records —
 * different session ids, near-identical distance/time, so each looks like a
 * legitimate distinct workout to that per-record check.
 */

const START_TIME_TOLERANCE_MS = 30 * 60 * 1000;
const DISTANCE_TOLERANCE_RATIO = 0.25;

export type WorkoutFingerprint = {
  startTimeMs: number;
  distanceKm: number | null;
};

/** True if `candidate` looks like the same real-world workout as `existing` —
 *  start times within 30 minutes of each other AND distances within 25% of
 *  one another. Requires a distance on both sides to avoid false positives
 *  from close-together-but-unrelated sessions with no comparable metric. */
export function isLikelyDuplicateWorkout(candidate: WorkoutFingerprint, existing: WorkoutFingerprint): boolean {
  if (Math.abs(candidate.startTimeMs - existing.startTimeMs) > START_TIME_TOLERANCE_MS) return false;
  if (candidate.distanceKm == null || existing.distanceKm == null) return false;

  const larger = Math.max(candidate.distanceKm, existing.distanceKm);
  if (larger === 0) return false;
  return Math.abs(candidate.distanceKm - existing.distanceKm) / larger <= DISTANCE_TOLERANCE_RATIO;
}
