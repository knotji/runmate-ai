import { GOAL_LABEL_TH } from "./goalTypes";
import type { GoalType, UserGoalProfile } from "./goalTypes";

export const DEFAULT_GOAL_PROFILE: UserGoalProfile = {
  primaryGoal: "running_consistency",
  secondaryGoals: [],
  guardrailGoals: ["injury_prevention"],
  raceGoal: { enabled: false },
  bodyGoal: { enabled: false },
  lifestyleGoal: {},
};

export function validateGoalProfile(raw: Partial<UserGoalProfile>): UserGoalProfile {
  const primaryGoal: GoalType = isValidGoalType(raw.primaryGoal)
    ? raw.primaryGoal
    : DEFAULT_GOAL_PROFILE.primaryGoal;

  // Max 2 secondary goals; primary cannot appear in secondary list
  const secondaryGoals = (Array.isArray(raw.secondaryGoals) ? raw.secondaryGoals : [])
    .filter((g): g is GoalType => isValidGoalType(g) && g !== primaryGoal)
    .slice(0, 2);

  const guardrailGoals = (Array.isArray(raw.guardrailGoals) ? raw.guardrailGoals : [])
    .filter((g): g is GoalType => isValidGoalType(g));

  return {
    primaryGoal,
    secondaryGoals,
    guardrailGoals: guardrailGoals.length > 0 ? guardrailGoals : DEFAULT_GOAL_PROFILE.guardrailGoals,
    raceGoal: raw.raceGoal ?? { enabled: false },
    bodyGoal: raw.bodyGoal ?? { enabled: false },
    lifestyleGoal: raw.lifestyleGoal ?? {},
    updatedAt: raw.updatedAt,
  };
}

export function mergeGoalProfile(
  existing: UserGoalProfile | null | undefined,
  updates: Partial<UserGoalProfile>,
): UserGoalProfile {
  return validateGoalProfile({ ...(existing ?? DEFAULT_GOAL_PROFILE), ...updates });
}

const VALID_GOAL_TYPES = new Set<string>([
  "race_performance",
  "running_consistency",
  "general_health",
  "fat_loss",
  "six_pack",
  "muscle_gain",
  "injury_prevention",
  "injury_recovery",
  "sleep_better",
  "stress_balance",
]);

export function isValidGoalType(value: unknown): value is GoalType {
  return typeof value === "string" && VALID_GOAL_TYPES.has(value);
}

export function hasBodyGoal(profile: UserGoalProfile | null | undefined): boolean {
  if (!profile) return false;
  const bodyGoalTypes: GoalType[] = ["six_pack", "fat_loss", "muscle_gain"];
  return (
    bodyGoalTypes.includes(profile.primaryGoal) ||
    profile.secondaryGoals.some((g) => bodyGoalTypes.includes(g))
  );
}

export function hasRaceGoal(profile: UserGoalProfile | null | undefined): boolean {
  if (!profile) return false;
  return (
    profile.primaryGoal === "race_performance" ||
    (profile.raceGoal?.enabled === true)
  );
}

export function goalProfileSummaryTh(profile: UserGoalProfile): string {
  const lines: string[] = [];
  lines.push(`หลัก: ${GOAL_LABEL_TH[profile.primaryGoal] ?? profile.primaryGoal}`);
  if (profile.secondaryGoals.length > 0) {
    lines.push(`รอง: ${profile.secondaryGoals.map((g) => GOAL_LABEL_TH[g] ?? g).join(", ")}`);
  }
  if (profile.guardrailGoals.length > 0) {
    lines.push(`กันพลาด: ${profile.guardrailGoals.map((g) => GOAL_LABEL_TH[g] ?? g).join(", ")}`);
  }
  return lines.join("\n");
}
