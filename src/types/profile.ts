export type RunningLevel = "beginner" | "can_run_5k" | "can_run_10k" | "half_marathon_ready" | "returning";
export type NutritionGoal = "recovery" | "lean_muscle" | "race_fuel" | "weight_control";

/**
 * Source of a profile field value.
 * "default"  — never touched; could be safely overwritten by analysis
 * "auto"     — set by profile history analysis (stored as "history_analysis" in DB)
 * "manual"   — explicitly edited by the user; analysis must NOT overwrite this
 */
export type ProfileFieldSource = "default" | "auto" | "manual";

export type UserProfile = {
  id?: string;
  updatedAt?: string;

  // Basic Info
  displayName: string;
  birthDate?: string;
  birthYear?: number;
  age?: number;
  gender?: string;
  heightCm?: number;
  weightKg?: number;
  timezone?: string;
  workSchedule?: string;

  // Running Goal
  mainGoal?: string;
  secondaryGoal?: string;
  targetDistance?: "5K" | "10K" | "Half Marathon" | "Full Marathon" | "Custom";
  goalPriority?: "finish" | "time" | "injury_free" | "consistency" | "fitness";
  targetRaceDate?: string;
  targetTime?: string;

  // Running Baseline
  currentLevel?: string;
  currentLongestRunKm?: number;
  weeklyMileageKm?: number;
  weeklyTrainingDays?: number;
  runningDaysPerWeek?: number;
  easyPace?: string;
  tempoPace?: string;
  racePace?: string;
  easyHrCap?: string;
  maxHr?: number;
  lactateThresholdHr?: number;
  vo2max?: number;
  averageCadence?: number;

  // Training Preferences
  preferredTrainingDays?: string[];
  availableTrainingDays?: string;
  preferredLongRunDay?: string;
  preferredRunTime?: "morning" | "evening" | "night" | "flexible";
  usualRunTime?: string;
  strengthTrainingDaysPerWeek?: number;
  availableEquipment?: string[];
  gearNotes?: string;
  shoeRotation?: string;
  watchDevice?: string;
  treadmillAccess?: boolean;
  trainingConstraints?: string;

  // Injury & Risk
  injuryHistory?: string;
  injuryNotes?: string;
  currentPainNotes?: string;
  riskNotes?: string;

  // Nutrition
  nutritionGoal?: NutritionGoal;
  proteinTargetG?: number;
  carbTargetRestDayG?: number;
  carbTargetEasyDayG?: number;
  carbTargetHardDayG?: number;
  foodPreferences?: string;
  allergiesOrRestrictions?: string;
  caffeineHabit?: string;
  supplementNotes?: string;
  nutritionNotes?: string;

  // Sleep & Recovery
  averageSleepHours?: number;
  normalSleepScore?: number;
  normalEnergyScore?: number;
  normalRestingHr?: number;
  normalHrv?: number;
  recoveryRules?: string;
  sleepNotes?: string;

  // Field source tracking (populated by history analysis vs manual)
  fieldSources?: Partial<Record<string, "history_analysis" | "manual">>;

  // Coaching Style
  coachingTone?: "friendly" | "direct" | "gentle" | "strict";
  coachTone?: string;
  responseDetail?: "short" | "medium" | "detailed";
  language?: "th" | "en" | "mixed";
};

export const defaultProfile: UserProfile = {
  displayName: "นักวิ่ง",
  currentLevel: "วิ่งได้ประมาณ 10K",
  currentLongestRunKm: 10,
  weeklyTrainingDays: 4,
  runningDaysPerWeek: 4,
  preferredLongRunDay: "อาทิตย์",
  mainGoal: "อยากจบมาราธอนในอนาคตแบบปลอดภัยและสม่ำเสมอ",
  goalPriority: "injury_free",
  language: "th",
  coachingTone: "friendly",
  responseDetail: "medium",
};
