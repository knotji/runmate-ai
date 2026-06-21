"use client";

import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import {
  friendlySupabaseError,
  logSupabaseSyncError,
  logSupabaseSyncStart,
  logSupabaseSyncSuccess,
} from "@/lib/supabase/debug";
import type { WorkoutAnalysis } from "@/types/logs";
import type { GoalResult, RaceGoal, RaceResult } from "@/types/race";

type RaceResultRow = {
  id: string;
  race_goal_id: string | null;
  linked_history_item_id: string | null;
  race_name: string | null;
  race_date: string | null;
  race_distance: string | null;
  goal_type: string | null;
  target_time: string | null;
  actual_distance_km: number | null;
  actual_time: string | null;
  actual_pace: string | null;
  avg_hr: number | null;
  max_hr: number | null;
  cadence: number | null;
  calories: number | null;
  elevation_m: number | null;
  result_status: string | null;
  goal_result: GoalResult | null;
  coach_summary: string | null;
  reflection: string | null;
  raw_workout_data: unknown;
  created_at: string;
  updated_at: string | null;
};

export type RaceMatch = {
  goal: RaceGoal;
  workoutDate: string;
  distanceMatches: boolean;
};

export function getWorkoutLocalDate(workout: WorkoutAnalysis, todayBangkok?: string): string | null {
  const ext = workout.extracted as Record<string, unknown>;
  const candidates = [ext?.date, ext?.workoutDate, ext?.activityDate, ext?.startTime, ext?.endTime];
  for (const candidate of candidates) {
    const normalized = normalizeLocalDate(candidate);
    if (normalized) return normalized;
  }
  return todayBangkok ?? null;
}

export function detectRaceMatch(workout: WorkoutAnalysis, goal: RaceGoal | null, todayBangkok?: string): RaceMatch | null {
  if (!goal?.raceDate) return null;
  const workoutDate = getWorkoutLocalDate(workout, todayBangkok);
  const raceDate = normalizeLocalDate(goal.raceDate);
  if (!workoutDate || !raceDate || workoutDate !== raceDate) return null;
  return {
    goal,
    workoutDate,
    distanceMatches: distanceMatchesGoal(workout.extracted?.distanceKm ?? null, goal.raceDistance),
  };
}

export function buildRaceResultFromWorkout({
  workout,
  goal,
  linkedHistoryItemId,
}: {
  workout: WorkoutAnalysis;
  goal: RaceGoal;
  linkedHistoryItemId?: string | null;
}): RaceResult {
  const ext = workout.extracted;
  const goalResult = calculateGoalResult(goal, ext.distanceKm ?? null, ext.duration ?? null);
  return {
    raceGoalId: goal.id ?? null,
    linkedHistoryItemId: linkedHistoryItemId ?? null,
    raceName: goal.raceName,
    raceDate: normalizeLocalDate(goal.raceDate),
    raceDistance: goal.raceDistance,
    goalType: goal.goalType,
    targetTime: goal.targetTime ?? null,
    actualDistanceKm: ext.distanceKm ?? null,
    actualTime: ext.duration ?? null,
    actualPace: ext.avgPace ?? null,
    avgHr: ext.avgHR ?? null,
    maxHr: ext.maxHR ?? null,
    cadence: ext.cadence ?? null,
    calories: ext.calories ?? null,
    elevationM: ext.elevationGain ?? null,
    resultStatus: "completed",
    goalResult,
    coachSummary: buildRaceCoachSummary(goal, workout, goalResult),
    rawWorkoutData: workout,
  };
}

export async function saveRaceResult(result: RaceResult): Promise<{ ok: true; result: RaceResult } | { ok: false; error: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: session.message ?? session.reason };

  const payload = {
    user_id: session.userId,
    race_goal_id: result.raceGoalId ?? null,
    linked_history_item_id: result.linkedHistoryItemId ?? null,
    race_name: result.raceName,
    race_date: result.raceDate,
    race_distance: result.raceDistance,
    goal_type: result.goalType,
    target_time: result.targetTime ?? null,
    actual_distance_km: result.actualDistanceKm ?? null,
    actual_time: result.actualTime ?? null,
    actual_pace: result.actualPace ?? null,
    avg_hr: result.avgHr ?? null,
    max_hr: result.maxHr ?? null,
    cadence: result.cadence ?? null,
    calories: result.calories ?? null,
    elevation_m: result.elevationM ?? null,
    result_status: result.resultStatus ?? "completed",
    goal_result: result.goalResult ?? "unknown",
    coach_summary: result.coachSummary ?? null,
    reflection: result.reflection ?? null,
    raw_workout_data: result.rawWorkoutData as Record<string, unknown>,
    updated_at: new Date().toISOString(),
  };

  logSupabaseSyncStart({ table: "race_results", operation: "insert", userId: session.userId, count: 1 });
  const { data, error } = await session.supabase.from("race_results").insert(payload).select("*").single();
  if (error) {
    logSupabaseSyncError({ table: "race_results", operation: "insert", userId: session.userId, error });
    return { ok: false, error: friendlySupabaseError(error) };
  }
  logSupabaseSyncSuccess({ table: "race_results", operation: "insert", userId: session.userId, count: 1 });
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  return { ok: true, result: rowToRaceResult(data as RaceResultRow) };
}

export async function loadRaceResults(limit = 20): Promise<{ ok: true; results: RaceResult[] } | { ok: false; error: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: session.message ?? session.reason };

  logSupabaseSyncStart({ table: "race_results", operation: "select", userId: session.userId });
  const { data, error } = await session.supabase
    .from("race_results")
    .select("*")
    .eq("user_id", session.userId)
    .order("race_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logSupabaseSyncError({ table: "race_results", operation: "select", userId: session.userId, error });
    return { ok: false, error: friendlySupabaseError(error) };
  }
  const results = ((data ?? []) as RaceResultRow[]).map(rowToRaceResult);
  logSupabaseSyncSuccess({ table: "race_results", operation: "select", userId: session.userId, count: results.length });
  return { ok: true, results };
}

export function normalizeLocalDate(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const s = value.trim();

  // YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS...
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const date = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const parsed = new Date(`${date}T12:00:00+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : date;
  }

  // YYYY/MM/DD
  const slashYMD = s.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slashYMD) {
    const date = `${slashYMD[1]}-${slashYMD[2]}-${slashYMD[3]}`;
    const parsed = new Date(`${date}T12:00:00+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : date;
  }

  // DD/MM/YYYY or DD-MM-YYYY (European / Thai short)
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dmy) {
    const d = dmy[1].padStart(2, "0");
    const m = dmy[2].padStart(2, "0");
    const y = dmy[3];
    const date = `${y}-${m}-${d}`;
    const parsed = new Date(`${date}T12:00:00+07:00`);
    return Number.isNaN(parsed.getTime()) ? null : date;
  }

  return null;
}

function rowToRaceResult(row: RaceResultRow): RaceResult {
  return {
    id: row.id,
    raceGoalId: row.race_goal_id,
    linkedHistoryItemId: row.linked_history_item_id,
    raceName: row.race_name,
    raceDate: row.race_date,
    raceDistance: row.race_distance,
    goalType: row.goal_type,
    targetTime: row.target_time,
    actualDistanceKm: row.actual_distance_km,
    actualTime: row.actual_time,
    actualPace: row.actual_pace,
    avgHr: row.avg_hr,
    maxHr: row.max_hr,
    cadence: row.cadence,
    calories: row.calories,
    elevationM: row.elevation_m,
    resultStatus: row.result_status,
    goalResult: row.goal_result,
    coachSummary: row.coach_summary,
    reflection: row.reflection,
    rawWorkoutData: row.raw_workout_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  };
}

function calculateGoalResult(goal: RaceGoal, distanceKm: number | null, actualTime: string | null): GoalResult {
  const distanceOk = distanceMatchesGoal(distanceKm, goal.raceDistance);
  if (goal.goalType === "จบให้ได้" && distanceOk) return "completed";
  if (!goal.targetTime || !actualTime || !distanceOk) return distanceOk ? "completed" : "unknown";
  const targetSec = parseDurationSeconds(goal.targetTime);
  const actualSec = parseDurationSeconds(actualTime);
  if (targetSec == null || actualSec == null) return "unknown";
  return actualSec <= targetSec ? "achieved" : "missed";
}

function distanceMatchesGoal(distanceKm: number | null, raceDistance: string) {
  if (distanceKm == null || !(distanceKm > 0)) return false;
  const range = distanceRange(raceDistance);
  if (!range) return false;
  return distanceKm >= range[0] && distanceKm <= range[1];
}

function distanceRange(raceDistance: string): [number, number] | null {
  if (raceDistance === "5K") return [4.8, 5.3];
  if (raceDistance === "10K") return [9.6, 10.6];
  if (raceDistance === "Half Marathon") return [20.5, 21.5];
  if (raceDistance === "Full Marathon") return [41.0, 42.8];
  return null;
}

function parseDurationSeconds(value: string): number | null {
  const parts = value.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function buildRaceCoachSummary(goal: RaceGoal, workout: WorkoutAnalysis, goalResult: GoalResult) {
  const ext = workout.extracted;
  const resultText =
    goalResult === "achieved" ? "ทำได้ตามเป้าหมาย"
    : goalResult === "missed" ? "ยังช้ากว่าเป้าหมาย"
    : goalResult === "completed" ? "จบการแข่งขันแล้ว"
    : "บันทึกผลแข่งแล้ว";
  return `${resultText}: ${goal.raceName} ระยะ ${goal.raceDistance}${ext.duration ? ` เวลา ${ext.duration}` : ""}${ext.avgPace ? ` pace ${ext.avgPace}/km` : ""}. หลังแข่งให้เน้น recovery, เติมน้ำ และดู HR/อาการล้า 24-48 ชม.`;
}
