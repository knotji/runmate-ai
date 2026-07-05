"use client";

import { createClient } from "@/lib/supabase/client";
import { ensureSupabaseProfileSession } from "@/lib/profileStorage";
import { DEFAULT_GOAL_PROFILE, validateGoalProfile } from "./goalProfile";
import type { UserGoalProfile } from "./goalTypes";

export async function loadGoalProfileFromSupabase(): Promise<{
  ok: true;
  goalProfile: UserGoalProfile;
} | { ok: false; reason: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, reason: session.reason };

  const { data, error } = await session.supabase
    .from("profiles")
    .select("goal_profile")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) return { ok: false, reason: error.message };

  const raw = (data as Record<string, unknown> | null)?.goal_profile;
  if (!raw || typeof raw !== "object") {
    return { ok: true, goalProfile: DEFAULT_GOAL_PROFILE };
  }

  return { ok: true, goalProfile: validateGoalProfile(raw as Partial<UserGoalProfile>) };
}

export async function saveGoalProfileToSupabase(goalProfile: UserGoalProfile): Promise<{
  ok: true;
} | { ok: false; reason: string }> {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return { ok: false, reason: session.reason };

  const validated = validateGoalProfile(goalProfile);

  const { error } = await session.supabase
    .from("profiles")
    .upsert(
      {
        id: session.userId,
        goal_profile: { ...validated, updatedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// For use in server components / API routes (uses service client)
export async function loadGoalProfileServer(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<UserGoalProfile | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("profiles")
    .select("goal_profile")
    .eq("id", userId)
    .maybeSingle();
  const raw = (data as Record<string, unknown> | null)?.goal_profile;
  if (!raw || typeof raw !== "object") return DEFAULT_GOAL_PROFILE;
  return validateGoalProfile(raw as Partial<UserGoalProfile>);
}
