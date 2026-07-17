import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCoachContextFromData } from "@/lib/buildCoachContext";
import type { LocalHistoryItem, HistoryType } from "@/lib/localHistory";

const RELEVANT_TYPES: HistoryType[] = ["sleep", "workout", "body", "pain", "strength", "health_check", "sick"];

// buildCoachContextFromData is pure (no Supabase/React inside), so it's safe to reuse
// here across every subscriber in the cron loop — unlike buildCoachContextFromSupabase,
// which depends on a browser-session Supabase client and can't run for an arbitrary
// user from a service-role cron job. raceGoal/racePlan/profile are passed as null:
// sleepNeed only depends on dayLoad + the recovery/load/sleep axis scores (all derived
// from `items`), so omitting them is the same as the app's own empty-state constructor.
export async function buildSleepTargetLabel(admin: SupabaseClient, userId: string): Promise<string | null> {
  const cutoffIso = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("history_items")
    .select("id, type, created_at, data")
    .eq("user_id", userId)
    .in("type", RELEVANT_TYPES)
    .gte("created_at", cutoffIso);

  if (error || !rows || rows.length === 0) return null;

  const items: LocalHistoryItem[] = rows.map((row) => ({
    id: row.id as string,
    type: row.type as HistoryType,
    createdAt: row.created_at as string,
    data: row.data,
  }));

  try {
    const ctx = buildCoachContextFromData({ items, profile: null, raceGoal: null, racePlan: null });
    return ctx.recoveryLoop.sleepNeed.label || null;
  } catch {
    return null;
  }
}
