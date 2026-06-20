"use client";

import { createClient } from "@/lib/supabase/client";
import {
  friendlySupabaseError,
  logSupabaseSyncError,
  logSupabaseSyncStart,
  logSupabaseSyncSuccess,
} from "@/lib/supabase/debug";
import type { UserProfile } from "@/types/profile";

type ProfileRow = {
  id: string;
  updated_at: string | null;
  display_name: string | null;
  birth_date: string | null;
  birth_year: number | null;
  age: number | null;
  gender: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  timezone: string | null;
  work_schedule: string | null;

  main_goal: string | null;
  secondary_goal: string | null;
  target_distance: string | null;
  goal_priority: string | null;
  target_race_date: string | null;
  target_time: string | null;

  current_level: string | null;
  current_longest_run_km: number | null;
  weekly_mileage_km: number | null;
  weekly_training_days: number | null;
  running_days_per_week: number | null;
  easy_pace: string | null;
  tempo_pace: string | null;
  race_pace: string | null;
  easy_hr_cap: string | null;
  max_hr: number | null;
  lactate_threshold_hr: number | null;
  vo2max: number | null;
  average_cadence: number | null;

  preferred_training_days: string[] | null;
  available_training_days: string | null;
  preferred_long_run_day: string | null;
  preferred_run_time: string | null;
  usual_run_time: string | null;
  strength_training_days_per_week: number | null;
  available_equipment: string[] | null;
  gear_notes: string | null;
  shoe_rotation: string | null;
  watch_device: string | null;
  treadmill_access: boolean | null;
  training_constraints: string | null;

  injury_history: string | null;
  injury_notes: string | null;
  current_pain_notes: string | null;
  risk_notes: string | null;

  nutrition_goal: string | null;
  food_preferences: string | null;
  allergies_or_restrictions: string | null;
  caffeine_habit: string | null;
  supplement_notes: string | null;
  nutrition_notes: string | null;

  average_sleep_hours: number | null;
  normal_sleep_score: number | null;
  normal_energy_score: number | null;
  normal_resting_hr: number | null;
  normal_hrv: number | null;
  recovery_rules: string | null;
  sleep_notes: string | null;

  coaching_tone: string | null;
  coach_tone: string | null;
  response_detail: string | null;
  language: string | null;
  field_sources: Record<string, string | undefined> | null;
};

export async function ensureSupabaseProfileSession() {
  const supabase = createClient();
  if (!supabase) {
    console.warn("[supabase-auth-user]", { hasUser: false, reason: "missing-env" });
    return { ok: false as const, reason: "missing-env" as const };
  }

  const { data, error } = await supabase.auth.getUser();
  console.info("[supabase-auth-user]", {
    hasUser: Boolean(data.user),
    userId: data.user?.id ?? null,
    error: error?.message ?? null,
  });

  if (error || !data.user) {
    return {
      ok: false as const,
      reason: "not-authenticated" as const,
      message: "ไม่พบ session ผู้ใช้ กรุณา login ใหม่ก่อนบันทึกหรือโหลดข้อมูล",
    };
  }
  return { ok: true as const, supabase, userId: data.user.id };
}

export async function loadProfileFromSupabase() {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return session;

  logSupabaseSyncStart({ table: "profiles", operation: "select", userId: session.userId });
  const { data, error } = await session.supabase
    .from("profiles")
    .select("*")
    .eq("id", session.userId)
    .maybeSingle();

  if (error) {
    logSupabaseSyncError({ table: "profiles", operation: "select", userId: session.userId, error });
    return {
      ok: false as const,
      reason: "load-failed" as const,
      message: friendlySupabaseError(error),
    };
  }
  if (!data) {
    logSupabaseSyncSuccess({ table: "profiles", operation: "select", userId: session.userId, count: 0 });
    return { ok: true as const, profile: null, userId: session.userId };
  }

  const profile = rowToProfile(data as ProfileRow);
  logSupabaseSyncSuccess({ table: "profiles", operation: "select", userId: session.userId, count: 1 });
  return { ok: true as const, profile, userId: session.userId };
}

export async function saveProfileToSupabase(profile: UserProfile) {
  const session = await ensureSupabaseProfileSession();
  if (!session.ok) return session;

  logSupabaseSyncStart({ table: "profiles", operation: "upsert", userId: session.userId, count: 1 });
  const { error } = await session.supabase
    .from("profiles")
    .upsert(profileToRow(profile, session.userId), { onConflict: "id" });

  if (error) {
    logSupabaseSyncError({ table: "profiles", operation: "upsert", userId: session.userId, error });
    return {
      ok: false as const,
      reason: "save-failed" as const,
      message: friendlySupabaseError(error),
    };
  }
  logSupabaseSyncSuccess({ table: "profiles", operation: "upsert", userId: session.userId, count: 1 });
  return { ok: true as const, userId: session.userId };
}

function profileToRow(profile: UserProfile, userId: string): Partial<ProfileRow> & { id: string; updated_at: string } {
  return {
    id: userId,
    display_name: cleanText(profile.displayName),
    birth_date: cleanText(profile.birthDate),
    birth_year: cleanNumber(profile.birthYear),
    age: cleanNumber(profile.age),
    gender: cleanText(profile.gender),
    height_cm: cleanNumber(profile.heightCm),
    weight_kg: cleanNumber(profile.weightKg),
    timezone: cleanText(profile.timezone),
    work_schedule: cleanText(profile.workSchedule),

    main_goal: cleanText(profile.mainGoal),
    secondary_goal: cleanText(profile.secondaryGoal),
    target_distance: cleanText(profile.targetDistance),
    goal_priority: cleanText(profile.goalPriority),
    target_race_date: cleanText(profile.targetRaceDate),
    target_time: cleanText(profile.targetTime),

    current_level: cleanText(profile.currentLevel),
    current_longest_run_km: cleanNumber(profile.currentLongestRunKm),
    weekly_mileage_km: cleanNumber(profile.weeklyMileageKm),
    weekly_training_days: cleanNumber(profile.weeklyTrainingDays),
    running_days_per_week: cleanNumber(profile.runningDaysPerWeek),
    easy_pace: cleanText(profile.easyPace),
    tempo_pace: cleanText(profile.tempoPace),
    race_pace: cleanText(profile.racePace),
    easy_hr_cap: cleanText(profile.easyHrCap),
    max_hr: cleanNumber(profile.maxHr),
    lactate_threshold_hr: cleanNumber(profile.lactateThresholdHr),
    vo2max: cleanNumber(profile.vo2max),
    average_cadence: cleanNumber(profile.averageCadence),

    preferred_training_days: cleanArray(profile.preferredTrainingDays),
    available_training_days: cleanText(profile.availableTrainingDays),
    preferred_long_run_day: cleanText(profile.preferredLongRunDay),
    preferred_run_time: cleanText(profile.preferredRunTime),
    usual_run_time: cleanText(profile.usualRunTime),
    strength_training_days_per_week: cleanNumber(profile.strengthTrainingDaysPerWeek),
    available_equipment: cleanArray(profile.availableEquipment),
    gear_notes: cleanText(profile.gearNotes),
    shoe_rotation: cleanText(profile.shoeRotation),
    watch_device: cleanText(profile.watchDevice),
    treadmill_access: profile.treadmillAccess ?? null,
    training_constraints: cleanText(profile.trainingConstraints),

    injury_history: cleanText(profile.injuryHistory),
    injury_notes: cleanText(profile.injuryNotes),
    current_pain_notes: cleanText(profile.currentPainNotes),
    risk_notes: cleanText(profile.riskNotes),

    nutrition_goal: cleanText(profile.nutritionGoal),
    food_preferences: cleanText(profile.foodPreferences),
    allergies_or_restrictions: cleanText(profile.allergiesOrRestrictions),
    caffeine_habit: cleanText(profile.caffeineHabit),
    supplement_notes: cleanText(profile.supplementNotes),
    nutrition_notes: cleanText(profile.nutritionNotes),

    average_sleep_hours: cleanNumber(profile.averageSleepHours),
    normal_sleep_score: cleanNumber(profile.normalSleepScore),
    normal_energy_score: cleanNumber(profile.normalEnergyScore),
    normal_resting_hr: cleanNumber(profile.normalRestingHr),
    normal_hrv: cleanNumber(profile.normalHrv),
    recovery_rules: cleanText(profile.recoveryRules),
    sleep_notes: cleanText(profile.sleepNotes),

    coaching_tone: cleanText(profile.coachingTone),
    coach_tone: cleanText(profile.coachTone),
    response_detail: cleanText(profile.responseDetail),
    language: cleanText(profile.language) ?? "th",
    field_sources: profile.fieldSources ?? null,

    updated_at: new Date().toISOString(),
  };
}

function rowToProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    updatedAt: row.updated_at ?? undefined,
    displayName: row.display_name ?? "",
    birthDate: row.birth_date ?? undefined,
    birthYear: row.birth_year ?? undefined,
    age: row.age ?? undefined,
    gender: row.gender ?? undefined,
    heightCm: row.height_cm ?? undefined,
    weightKg: row.weight_kg ?? undefined,
    timezone: row.timezone ?? undefined,
    workSchedule: row.work_schedule ?? undefined,

    mainGoal: row.main_goal ?? undefined,
    secondaryGoal: row.secondary_goal ?? undefined,
    targetDistance: (row.target_distance as UserProfile["targetDistance"]) ?? undefined,
    goalPriority: (row.goal_priority as UserProfile["goalPriority"]) ?? undefined,
    targetRaceDate: row.target_race_date ?? undefined,
    targetTime: row.target_time ?? undefined,

    currentLevel: row.current_level ?? undefined,
    currentLongestRunKm: row.current_longest_run_km ?? undefined,
    weeklyMileageKm: row.weekly_mileage_km ?? undefined,
    weeklyTrainingDays: row.weekly_training_days ?? undefined,
    runningDaysPerWeek: row.running_days_per_week ?? undefined,
    easyPace: row.easy_pace ?? undefined,
    tempoPace: row.tempo_pace ?? undefined,
    racePace: row.race_pace ?? undefined,
    easyHrCap: row.easy_hr_cap ?? undefined,
    maxHr: row.max_hr ?? undefined,
    lactateThresholdHr: row.lactate_threshold_hr ?? undefined,
    vo2max: row.vo2max ?? undefined,
    averageCadence: row.average_cadence ?? undefined,

    preferredTrainingDays: row.preferred_training_days ?? undefined,
    availableTrainingDays: row.available_training_days ?? undefined,
    preferredLongRunDay: row.preferred_long_run_day ?? undefined,
    preferredRunTime: (row.preferred_run_time as UserProfile["preferredRunTime"]) ?? undefined,
    usualRunTime: row.usual_run_time ?? undefined,
    strengthTrainingDaysPerWeek: row.strength_training_days_per_week ?? undefined,
    availableEquipment: row.available_equipment ?? undefined,
    gearNotes: row.gear_notes ?? undefined,
    shoeRotation: row.shoe_rotation ?? undefined,
    watchDevice: row.watch_device ?? undefined,
    treadmillAccess: row.treadmill_access ?? undefined,
    trainingConstraints: row.training_constraints ?? undefined,

    injuryHistory: row.injury_history ?? undefined,
    injuryNotes: row.injury_notes ?? undefined,
    currentPainNotes: row.current_pain_notes ?? undefined,
    riskNotes: row.risk_notes ?? undefined,

    nutritionGoal: row.nutrition_goal ?? undefined,
    foodPreferences: row.food_preferences ?? undefined,
    allergiesOrRestrictions: row.allergies_or_restrictions ?? undefined,
    caffeineHabit: row.caffeine_habit ?? undefined,
    supplementNotes: row.supplement_notes ?? undefined,
    nutritionNotes: row.nutrition_notes ?? undefined,

    averageSleepHours: row.average_sleep_hours ?? undefined,
    normalSleepScore: row.normal_sleep_score ?? undefined,
    normalEnergyScore: row.normal_energy_score ?? undefined,
    normalRestingHr: row.normal_resting_hr ?? undefined,
    normalHrv: row.normal_hrv ?? undefined,
    recoveryRules: row.recovery_rules ?? undefined,
    sleepNotes: row.sleep_notes ?? undefined,

    coachingTone: (row.coaching_tone as UserProfile["coachingTone"]) ?? undefined,
    coachTone: row.coach_tone ?? undefined,
    responseDetail: (row.response_detail as UserProfile["responseDetail"]) ?? undefined,
    language: (row.language as UserProfile["language"]) ?? "th",
    fieldSources: (row.field_sources as UserProfile["fieldSources"]) ?? undefined,
  };
}

function cleanText(value: unknown) {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanNumber(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cleanArray(value: unknown): string[] | null {
  if (value == null) return null;
  if (Array.isArray(value)) {
    const arr = value.map((v) => String(v).trim()).filter(Boolean);
    return arr.length > 0 ? arr : null;
  }
  if (typeof value === "string") {
    const arr = value.split(",").map((v) => v.trim()).filter(Boolean);
    return arr.length > 0 ? arr : null;
  }
  return null;
}
