import type { ProfileAnalysisSuggestions } from "@/lib/analyzeHistory";
import type { UserProfile } from "@/types/profile";

type Confidence = "high" | "medium" | "low";

// Objective, data-backed fields — safe at medium or high confidence
const MEDIUM_SAVE_FIELDS: Array<keyof ProfileAnalysisSuggestions> = [
  "currentLongestRunKm",
  "weeklyMileageKm",
  "runningDaysPerWeek",
  "easyPace",
  "easyHrCap",
  "maxHr",
  "averageCadence",
  "averageSleepHours",
  "normalSleepScore",
  "normalEnergyScore",
  "normalRestingHr",
  "normalHrv",
];

// Behavioral / pattern fields — save only at high confidence
const HIGH_ONLY_FIELDS: Array<keyof ProfileAnalysisSuggestions> = [
  "preferredTrainingDays",
  "preferredLongRunDay",
  "recoveryRules",
  "riskNotes",
];

// Fields never auto-saved — always show for review
export const REVIEW_ONLY_FIELDS: Array<keyof ProfileAnalysisSuggestions> = [
  "currentLevel",
  "vo2max",
  "injuryHistory",
  "trainingPreferenceSummary",
];

export function getAutoSavableProfileUpdates({
  suggestions,
  confidence,
}: {
  suggestions: ProfileAnalysisSuggestions;
  confidence: Confidence;
}): Partial<UserProfile> {
  if (confidence === "low") return {};

  const allowed =
    confidence === "high"
      ? [...MEDIUM_SAVE_FIELDS, ...HIGH_ONLY_FIELDS]
      : MEDIUM_SAVE_FIELDS;

  const updates: Partial<Record<string, unknown>> = {};
  for (const key of allowed) {
    const val = suggestions[key];
    if (val != null) updates[key] = val;
  }
  return updates as Partial<UserProfile>;
}

/** Remove fields the user has manually edited — returns rest + list of skipped keys */
export function filterManualFields({
  updates,
  existingSources,
}: {
  updates: Partial<UserProfile>;
  existingSources: UserProfile["fieldSources"];
}): { toSave: Partial<UserProfile>; manualSkipped: string[] } {
  if (!existingSources) return { toSave: updates, manualSkipped: [] };

  const toSave: Partial<Record<string, unknown>> = {};
  const manualSkipped: string[] = [];

  for (const [key, val] of Object.entries(updates)) {
    if (existingSources[key] === "manual") {
      manualSkipped.push(key);
    } else {
      toSave[key] = val;
    }
  }
  return { toSave: toSave as Partial<UserProfile>, manualSkipped };
}

/** Build field_sources update record for a list of auto-saved keys */
export function buildSourceUpdates(
  keys: string[],
): Record<string, "history_analysis"> {
  return Object.fromEntries(keys.map((k) => [k, "history_analysis" as const]));
}
