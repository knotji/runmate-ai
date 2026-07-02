import type { ProfileAnalysisSuggestions } from "@/lib/analyzeHistory";
import type { UserProfile, ProfileFieldSource } from "@/types/profile";

/**
 * Normalise the raw stored source value (which may be the legacy "history_analysis"
 * string) into the canonical ProfileFieldSource enum.
 */
export function getFieldSource(
  raw: string | undefined,
): ProfileFieldSource {
  if (raw === "manual") return "manual";
  if (raw === "history_analysis" || raw === "auto") return "auto";
  return "default";
}

/**
 * Returns true when an analysis result is allowed to overwrite this field.
 * Manual edits are always protected.
 */
export function canAutoUpdateField(
  raw: string | undefined,
): boolean {
  return getFieldSource(raw) !== "manual";
}

type Confidence = "high" | "medium" | "low";

// String-typed suggestion fields (AI may return a number at runtime for these)
const STRING_SUGGESTION_FIELDS = new Set<keyof ProfileAnalysisSuggestions>([
  "easyPace",
  "easyHrCap",
  "currentLevel",
  "preferredLongRunDay",
  "recoveryRules",
  "riskNotes",
  "injuryHistory",
  "trainingPreferenceSummary",
]);

// Protected manual fields (Rule 2)
export const PROTECTED_FIELDS = new Set<string>([
  "proteinTargetG",
  "carbTargetRestDayG",
  "carbTargetEasyDayG",
  "carbTargetHardDayG",
  "nutritionGoal",
  "foodPreferences",
  "allergiesOrRestrictions",
  "caffeineHabit",
  "supplementNotes",
  "easyPace",
  "easyHrCap",
  "maxHr",
  "weightKg",
  "injuryHistory",
  "currentPainNotes",
  "coachingTone",
  "responseDetail",
  "language"
]);

// Safe auto-update fields (Rule 3)
export const SAFE_AUTO_UPDATE_FIELDS = new Set<string>([
  "currentLevel",
  "currentLongestRunKm",
  "weeklyMileageKm",
  "runningDaysPerWeek",
  "averageCadence",
  "vo2max",
  "normalSleepScore",
  "averageSleepHours",
  "normalEnergyScore",
  "normalRestingHr",
  "normalHrv",
  "weightKg",
  "bodyFatPercent",
  "muscleKg"
]);

/**
 * Returns true only for values that are safe to write into a profile field.
 * Rejects: null, undefined, NaN, Infinity, empty strings, empty arrays.
 */
export function isValidSuggestionValue(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "number") {
    return !Number.isNaN(val) && Number.isFinite(val);
  }
  if (typeof val === "string") {
    return val.trim().length > 0 && val !== "NaN";
  }
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

/**
 * Coerces AI suggestion values so they survive profileToRow's type guards.
 */
function normalizeSuggestion(key: keyof ProfileAnalysisSuggestions, val: unknown): unknown {
  if (STRING_SUGGESTION_FIELDS.has(key) && typeof val === "number" && Number.isFinite(val)) {
    return String(val);
  }
  return val;
}

export type SafeMergeAction = "updated" | "kept_existing" | "no_existing" | "skipped_manual" | "skipped_invalid" | "skipped_low_confidence" | "skipped_protected_field";

export type SafeMergeDecision = {
  key: string;
  existingValue: unknown;
  suggestedValue: unknown;
  confidence: Confidence;
  action: SafeMergeAction;
};

/**
 * Core safe-merge function. Returns which fields to save and a decision log.
 * Rules:
 *  - null / undefined / "" / NaN → skip (keep existing)
 *  - fieldSources[key] === "manual" → skip (caller shows override UI)
 *  - confidence "low" → nothing saved
 *  - valid suggestion → include in updates
 */
export function buildAutoSaveDecisions({
  suggestions,
  confidence,
  existingProfile,
  existingSources,
}: {
  suggestions: ProfileAnalysisSuggestions;
  confidence: Confidence;
  existingProfile?: Partial<UserProfile>;
  existingSources?: UserProfile["fieldSources"];
}): {
  toSave: Partial<UserProfile>;
  manualSkipped: string[];
  decisions: SafeMergeDecision[];
} {
  const toSave: Partial<Record<string, unknown>> = {};
  const manualSkipped: string[] = [];
  const decisions: SafeMergeDecision[] = [];
  const finalConfidence = confidence || "low";

  for (const [key, rawSuggested] of Object.entries(suggestions)) {
    const normalized = normalizeSuggestion(key as keyof ProfileAnalysisSuggestions, rawSuggested);
    const existing = existingProfile?.[key as keyof UserProfile];

    const isManual = existingSources?.[key] === "manual" ||
      (existing !== undefined && existing !== null && existing !== "" && existingSources?.[key] !== "history_analysis");

    // 4. Never overwrite with invalid values
    if (!isValidSuggestionValue(normalized)) {
      decisions.push({
        key,
        existingValue: existing,
        suggestedValue: rawSuggested,
        confidence: finalConfidence,
        action: "skipped_invalid"
      });
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: rawSuggested,
          fieldSource: existingSources?.[key] || "none",
          action: "skipped_invalid"
        });
      }
      continue;
    }

    if (isManual) {
      manualSkipped.push(key);
      decisions.push({
        key,
        existingValue: existing,
        suggestedValue: normalized,
        confidence: finalConfidence,
        action: "skipped_manual"
      });
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: normalized,
          fieldSource: "manual",
          action: "skipped_manual"
        });
      }
      continue;
    }

    if (finalConfidence === "low") {
      decisions.push({
        key,
        existingValue: existing,
        suggestedValue: normalized,
        confidence: finalConfidence,
        action: "skipped_low_confidence"
      });
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: normalized,
          fieldSource: existingSources?.[key] || "none",
          action: "skipped_low_confidence"
        });
      }
      continue;
    }

    // Must be in safe auto-update fields to auto-save (Rule 3)
    const isSafe = SAFE_AUTO_UPDATE_FIELDS.has(key);
    if (!isSafe) {
      manualSkipped.push(key);
      decisions.push({
        key,
        existingValue: existing,
        suggestedValue: normalized,
        confidence: finalConfidence,
        action: "skipped_protected_field"
      });
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: normalized,
          fieldSource: existingSources?.[key] || "none",
          action: "skipped_protected_field"
        });
      }
      continue;
    }

    toSave[key] = normalized;
    decisions.push({
      key,
      existingValue: existing,
      suggestedValue: normalized,
      confidence: finalConfidence,
      action: "updated"
    });
    if (process.env.NODE_ENV === "development") {
      console.info(`[profile-safe-sync]`, {
        fieldName: key,
        currentValue: existing,
        suggestedValue: normalized,
        fieldSource: existingSources?.[key] || "none",
        action: "updated"
      });
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.info(`[profile-safe-sync] final update payload keys:`, Object.keys(toSave));
  }

  return { toSave: toSave as Partial<UserProfile>, manualSkipped, decisions };
}

/** Legacy wrapper kept for any callers that still use it */
export function getAutoSavableProfileUpdates({
  suggestions,
  confidence,
}: {
  suggestions: ProfileAnalysisSuggestions;
  confidence: Confidence;
}): Partial<UserProfile> {
  const { toSave } = buildAutoSaveDecisions({ suggestions, confidence });
  return toSave;
}

/** Remove fields the user has manually edited — returns rest + list of skipped keys */
export function filterManualFields({
  updates,
  existingSources,
  existingProfile,
}: {
  updates: Partial<UserProfile>;
  existingSources: UserProfile["fieldSources"];
  existingProfile?: Partial<UserProfile>;
}): { toSave: Partial<UserProfile>; manualSkipped: string[] } {
  const toSave: Partial<Record<string, unknown>> = {};
  const manualSkipped: string[] = [];

  for (const [key, val] of Object.entries(updates)) {
    const existing = existingProfile?.[key as keyof UserProfile];
    const isManual = existingSources?.[key] === "manual" ||
      (existing !== undefined && existing !== null && existing !== "" && existingSources?.[key] !== "history_analysis");

    // 4. Never overwrite with invalid values
    if (!isValidSuggestionValue(val)) {
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: val,
          fieldSource: existingSources?.[key] || "none",
          action: "skipped_invalid"
        });
      }
      continue;
    }

    if (isManual) {
      manualSkipped.push(key);
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: val,
          fieldSource: "manual",
          action: "skipped_manual"
        });
      }
    } else {
      toSave[key] = val;
      if (process.env.NODE_ENV === "development") {
        console.info(`[profile-safe-sync]`, {
          fieldName: key,
          currentValue: existing,
          suggestedValue: val,
          fieldSource: existingSources?.[key] || "none",
          action: "updated"
        });
      }
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.info(`[profile-safe-sync] final update payload keys:`, Object.keys(toSave));
  }

  return { toSave: toSave as Partial<UserProfile>, manualSkipped };
}

/** Build field_sources update record for a list of auto-saved keys */
export function buildSourceUpdates(
  keys: string[],
): Record<string, "history_analysis"> {
  return Object.fromEntries(keys.map((k) => [k, "history_analysis" as const]));
}
