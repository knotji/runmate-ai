"use client";

import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import {
  friendlySupabaseError,
  logSupabaseSyncError,
  logSupabaseSyncStart,
  logSupabaseSyncSuccess,
} from "@/lib/supabase/debug";
import type { RaceGoal, RacePlan } from "@/types/race";

type RaceGoalRow = {
  id: string;
  race_name: string;
  race_date: string;
  race_distance: RaceGoal["raceDistance"];
  goal_type: string;
  target_time: string | null;
  current_longest_run_km: number | null;
  training_days_per_week: number | null;
  preferred_long_run_day: string | null;
  injury_notes: string | null;
  plan_preference: string | null;
  status: string | null;
  completed_at: string | null;
};

type TrainingPlanRow = {
  id: string;
  race_goal_id: string;
  start_date: string;
  end_date: string;
  total_weeks: number;
  current_phase: string | null;
  plan_summary: string | null;
  phases_json: RacePlan | null;
};

export async function loadActiveRaceGoalAndPlan(): Promise<
  | { ok: true; goal: RaceGoal | null; plan: RacePlan | null }
  | { ok: false; error: string }
> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: sessionMessage(session) };

  logSupabaseSyncStart({ table: "race_goals", operation: "select", userId: session.userId });
  const { data: goalRow, error: goalError } = await session.supabase
    .from("race_goals")
    .select("*")
    .eq("user_id", session.userId)
    .not("status", "eq", "completed")
    .order("race_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (goalError) {
    logSupabaseSyncError({ table: "race_goals", operation: "select", userId: session.userId, error: goalError });
    return { ok: false, error: friendlySupabaseError(goalError) };
  }
  if (!goalRow) {
    logSupabaseSyncSuccess({ table: "race_goals", operation: "select", userId: session.userId, count: 0 });
    return { ok: true, goal: null, plan: null };
  }
  logSupabaseSyncSuccess({ table: "race_goals", operation: "select", userId: session.userId, count: 1 });

  const goal = rowToGoal(goalRow as RaceGoalRow);
  logSupabaseSyncStart({ table: "training_plans", operation: "select", userId: session.userId });
  const { data: planRow, error: planError } = await session.supabase
    .from("training_plans")
    .select("*")
    .eq("user_id", session.userId)
    .eq("race_goal_id", goal.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) {
    logSupabaseSyncError({ table: "training_plans", operation: "select", userId: session.userId, error: planError });
    return { ok: false, error: friendlySupabaseError(planError) };
  }
  logSupabaseSyncSuccess({ table: "training_plans", operation: "select", userId: session.userId, count: planRow ? 1 : 0 });

  return { ok: true, goal, plan: planRowToPlan(planRow as TrainingPlanRow | null) };
}

export async function saveRaceGoalAndPlan(goal: RaceGoal, plan: RacePlan): Promise<
  | { ok: true; goal: RaceGoal; plan: RacePlan }
  | { ok: false; error: string }
> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: sessionMessage(session) };

  const goalPayload = {
    id: goal.id,
    user_id: session.userId,
    race_name: goal.raceName,
    race_date: goal.raceDate,
    race_distance: goal.raceDistance,
    goal_type: goal.goalType,
    target_time: goal.targetTime ?? null,
    current_longest_run_km: goal.currentLongestRunKm ?? null,
    training_days_per_week: goal.trainingDaysPerWeek ?? null,
    preferred_long_run_day: goal.preferredLongRunDay ?? null,
    injury_notes: goal.injuryNotes ?? null,
    plan_preference: goal.planPreference ?? null,
    updated_at: new Date().toISOString(),
  };

  logSupabaseSyncStart({ table: "race_goals", operation: "upsert", userId: session.userId, count: 1 });
  const { data: savedGoal, error: goalError } = await session.supabase
    .from("race_goals")
    .upsert(goalPayload)
    .select("*")
    .single();

  if (goalError) {
    logSupabaseSyncError({ table: "race_goals", operation: "upsert", userId: session.userId, error: goalError });
    return { ok: false, error: friendlySupabaseError(goalError) };
  }
  logSupabaseSyncSuccess({ table: "race_goals", operation: "upsert", userId: session.userId, count: 1 });

  const savedGoalObj = rowToGoal(savedGoal as RaceGoalRow);
  const startDate = new Date().toISOString().slice(0, 10);
  const endDate = goal.raceDate || startDate;
  const planPayload = {
    user_id: session.userId,
    race_goal_id: savedGoalObj.id,
    start_date: startDate,
    end_date: endDate,
    total_weeks: plan.totalWeeks,
    current_phase: plan.currentPhase,
    plan_summary: plan.planSummary,
    phases_json: plan,
    updated_at: new Date().toISOString(),
  };

  logSupabaseSyncStart({ table: "training_plans", operation: "insert", userId: session.userId, count: 1 });
  const { error: planError } = await session.supabase
    .from("training_plans")
    .insert(planPayload);

  if (planError) {
    logSupabaseSyncError({ table: "training_plans", operation: "insert", userId: session.userId, error: planError });
    return { ok: false, error: friendlySupabaseError(planError) };
  }
  logSupabaseSyncSuccess({ table: "training_plans", operation: "insert", userId: session.userId, count: 1 });
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  return { ok: true, goal: savedGoalObj, plan };
}

export async function markRaceGoalCompleted(goalId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: sessionMessage(session) };
  const { error } = await session.supabase
    .from("race_goals")
    .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", goalId)
    .eq("user_id", session.userId);
  if (error) {
    logSupabaseSyncError({ table: "race_goals", operation: "update", userId: session.userId, error });
    return { ok: false, error: friendlySupabaseError(error) };
  }
  logSupabaseSyncSuccess({ table: "race_goals", operation: "update", userId: session.userId, count: 1 });
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  return { ok: true };
}

export async function deleteRaceGoalAndPlan(goalId: string): Promise<{ ok: boolean; error?: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, error: sessionMessage(session) };
  const { error } = await session.supabase.from("race_goals").delete().eq("id", goalId).eq("user_id", session.userId);
  if (error) {
    logSupabaseSyncError({ table: "race_goals", operation: "delete", userId: session.userId, error });
    return { ok: false, error: friendlySupabaseError(error) };
  }
  window.dispatchEvent(new Event("runmate:cloud-data-updated"));
  return { ok: true };
}

function rowToGoal(row: RaceGoalRow): RaceGoal {
  return {
    id: row.id,
    raceName: row.race_name,
    raceDate: row.race_date,
    raceDistance: row.race_distance,
    goalType: row.goal_type,
    targetTime: row.target_time ?? undefined,
    currentLongestRunKm: row.current_longest_run_km ?? undefined,
    trainingDaysPerWeek: row.training_days_per_week ?? undefined,
    preferredLongRunDay: row.preferred_long_run_day ?? undefined,
    injuryNotes: row.injury_notes ?? undefined,
    planPreference: row.plan_preference ?? undefined,
  };
}

function planRowToPlan(row: TrainingPlanRow | null): RacePlan | null {
  return row?.phases_json ?? null;
}

function sessionMessage(session: { reason: string; message?: string }) {
  return session.message ?? session.reason;
}
