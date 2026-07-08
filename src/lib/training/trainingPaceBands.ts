// Pure function — no React, no Supabase. Safe to import anywhere.
import type { TrainingPaceBands, PaceBandKey, PaceRange } from "./trainingPaceTypes";
import type { DailyReadiness } from "@/lib/readiness/readinessTypes";

const RACE_DISTANCE_KM: Record<string, number> = {
  "5K": 5,
  "10K": 10,
  "Half Marathon": 21.1,
  "Full Marathon": 42.195,
};

/**
 * Parses a target time string (HH:MM:SS or MM:SS) into total seconds.
 * Returns null if the string is invalid or absent.
 */
function parseTargetTimeSec(targetTime: string | undefined | null): number | null {
  if (!targetTime) return null;
  const parts = targetTime.trim().split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

/**
 * Formats seconds-per-km into a "M:SS/km" display string.
 */
export function secPerKmToPaceDisplay(sec: number): string {
  const minutes = Math.floor(sec / 60);
  const seconds = Math.round(sec % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

/**
 * Builds training pace bands from a race goal with a target time.
 * Returns null when the goal lacks a valid target time or known distance.
 *
 * Formulas (offset from race pace, in sec/km):
 *   easy     = racePace + 70  to  racePace + 110
 *   long     = racePace + 45  to  racePace + 90
 *   tempo    = racePace + 10  to  racePace + 25
 *   interval = racePace - 20  to  racePace - 5
 */
export function buildTrainingPaceBands(goal: { raceDistance: string; targetTime?: string | null }): TrainingPaceBands | null {
  const distKm = RACE_DISTANCE_KM[goal.raceDistance];
  if (!distKm) return null;

  const totalSec = parseTargetTimeSec(goal.targetTime);
  if (totalSec === null || totalSec <= 0) return null;

  const racePaceSec = totalSec / distKm;

  return {
    racePaceSec,
    easy: { minSecPerKm: racePaceSec + 70, maxSecPerKm: racePaceSec + 110 },
    long: { minSecPerKm: racePaceSec + 45, maxSecPerKm: racePaceSec + 90 },
    tempo: { minSecPerKm: racePaceSec + 10, maxSecPerKm: racePaceSec + 25 },
    interval: { minSecPerKm: racePaceSec - 20, maxSecPerKm: racePaceSec - 5 },
  };
}

/**
 * Returns the subset of pace bands appropriate given today's readiness.
 * Higher-intensity bands are excluded when readiness restricts them.
 */
export function getAllowedPaceBandsForReadiness({
  bands,
  dailyReadiness,
}: {
  bands: TrainingPaceBands;
  dailyReadiness: Pick<DailyReadiness, "band" | "loadTarget">;
}): PaceBandKey[] {
  const { band, loadTarget } = dailyReadiness;

  if (band === "pain_risk") return [];
  if (band === "red" || loadTarget === "walk") return [];
  if (loadTarget === "easy") return ["easy", "long"];
  if (band === "yellow") return ["easy", "long", "tempo"];

  // green band
  if (loadTarget === "build" || loadTarget === "moderate") {
    return ["easy", "long", "tempo", "interval"];
  }
  return ["easy", "long", "tempo"];
}

/**
 * Filters allowed pace bands down to what the Today page should display.
 *
 * Today shows the full allowed set only on genuine full-training days
 * (green band + build or moderate load). On all caution/recovery/easy
 * days the card shows Easy only, because showing Tempo/Interval alongside
 * a recovery recommendation creates contradictory guidance.
 *
 * The Race page always shows all four bands — use getAllowedPaceBandsForReadiness
 * directly and let the caller mark non-allowed rows as visually muted.
 */
export function getTodayDisplayPaceKeys(
  allowedKeys: PaceBandKey[],
  band: string,
  loadTarget: string,
): PaceBandKey[] {
  const isFullTrainingDay =
    band === "green" && (loadTarget === "build" || loadTarget === "moderate");
  if (isFullTrainingDay) return allowedKeys;
  if (allowedKeys.includes("easy")) return ["easy"];
  return allowedKeys.slice(0, 1);
}

/**
 * Formats a PaceRange as "M:SS – M:SS/km".
 */
export function formatPaceRange(range: PaceRange): string {
  return `${secPerKmToPaceDisplay(range.minSecPerKm)} – ${secPerKmToPaceDisplay(range.maxSecPerKm)}`;
}
