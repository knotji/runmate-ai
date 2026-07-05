export type GoalType =
  | "race_performance"
  | "running_consistency"
  | "general_health"
  | "fat_loss"
  | "six_pack"
  | "muscle_gain"
  | "injury_prevention"
  | "injury_recovery"
  | "sleep_better"
  | "stress_balance";

export type RaceGoalConfig = {
  enabled: boolean;
  distanceKm?: number;
  targetTimeSec?: number;
  raceDate?: string | null;
  targetRacePaceSecPerKm?: number;
};

export type BodyGoal = {
  enabled: boolean;
  type?: "six_pack" | "lean_body" | "fat_loss" | "muscle_gain";
  targetWeightKg?: number | null;
  targetBodyFatPercent?: number | null;
  focusAreas?: ("core" | "upper_body" | "legs" | "full_body")[];
};

export type LifestyleGoal = {
  sleepTargetHours?: number | null;
  weeklyWorkoutDays?: number | null;
  dailyStepsTarget?: number | null;
  stressManagement?: boolean;
};

export type UserGoalProfile = {
  primaryGoal: GoalType;
  secondaryGoals: GoalType[];
  guardrailGoals: GoalType[];
  raceGoal?: RaceGoalConfig;
  bodyGoal?: BodyGoal;
  lifestyleGoal?: LifestyleGoal;
  updatedAt?: string;
};

// Display helpers
export const GOAL_LABEL_TH: Record<GoalType, string> = {
  race_performance: "แข่งให้ได้เวลาเป้าหมาย",
  running_consistency: "วิ่งสม่ำเสมอ",
  general_health: "สุขภาพดีขึ้น",
  fat_loss: "ลดพุง / หุ่น lean",
  six_pack: "Six pack",
  muscle_gain: "เพิ่มกล้าม",
  injury_prevention: "ไม่เจ็บซ้ำ",
  injury_recovery: "ฟื้นจากอาการเจ็บ",
  sleep_better: "นอนให้ดีขึ้น",
  stress_balance: "ลดความเครียด / สมดุลชีวิต",
};

export const GUARDRAIL_LABEL_TH: Record<string, string> = {
  injury_prevention: "ไม่เจ็บซ้ำ",
  injury_recovery: "ฟื้นตัวให้ดี",
  stress_balance: "ไม่ฝืนเกิน",
};

export const BODY_GOAL_TYPE_LABEL: Record<string, string> = {
  six_pack: "Six pack / core",
  lean_body: "Lean body",
  fat_loss: "Fat loss",
  muscle_gain: "Muscle gain",
};

// Goals that require body details
export const BODY_GOALS: GoalType[] = ["six_pack", "fat_loss", "muscle_gain"];

// Goals that require race details
export const RACE_GOALS: GoalType[] = ["race_performance"];

// Goals that can be secondary
export const SECONDARY_GOAL_OPTIONS: GoalType[] = [
  "running_consistency",
  "general_health",
  "fat_loss",
  "six_pack",
  "muscle_gain",
  "injury_prevention",
  "injury_recovery",
  "sleep_better",
  "stress_balance",
];

export const GUARDRAIL_OPTIONS: GoalType[] = [
  "injury_prevention",
  "injury_recovery",
  "stress_balance",
];
