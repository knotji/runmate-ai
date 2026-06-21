import type { ProfileAnalysisSuggestions } from "@/lib/analyzeHistory";
import type { UserProfile } from "@/types/profile";

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

/**
 * Returns true only for values that are safe to write into a profile field.
 * Rejects: null, undefined, NaN, Infinity, empty strings, empty arrays.
 */
export function isValidSuggestionValue(val: unknown): boolean {
  if (val == null) return false;
  if (typeof val === "number") return Number.isFinite(val);
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val)) return val.length > 0;
  return false;
}

/**
 * Coerces AI suggestion values so they survive profileToRow's type guards.
 * e.g. if AI returns easyHrCap as a number (152), convert to "152" so cleanText() doesn't null it.
 */
function normalizeSuggestion(key: keyof ProfileAnalysisSuggestions, val: unknown): unknown {
  if (STRING_SUGGESTION_FIELDS.has(key) && typeof val === "number" && Number.isFinite(val)) {
    return String(val);
  }
  return val;
}

export type SafeMergeAction = "updated" | "kept_existing" | "no_existing" | "skipped_manual" | "skipped_invalid";

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
  if (confidence === "low") return { toSave: {}, manualSkipped: [], decisions: [] };

  const allowed: Array<keyof ProfileAnalysisSuggestions> =
    confidence === "high"
      ? [...MEDIUM_SAVE_FIELDS, ...HIGH_ONLY_FIELDS]
      : MEDIUM_SAVE_FIELDS;

  const toSave: Partial<Record<string, unknown>> = {};
  const manualSkipped: string[] = [];
  const decisions: SafeMergeDecision[] = [];

  for (const key of allowed) {
    const rawSuggested = suggestions[key];
    const normalized = normalizeSuggestion(key, rawSuggested);
    const existing = existingProfile?.[key as keyof UserProfile];

    // Manual field — user explicitly set this; don't overwrite
    if (existingSources?.[key] === "manual") {
      manualSkipped.push(key);
      decisions.push({ key, existingValue: existing, suggestedValue: normalized, confidence, action: "skipped_manual" });
      continue;
    }

    if (!isValidSuggestionValue(normalized)) {
      const hasExisting = isValidSuggestionValue(existing);
      decisions.push({
        key,
        existingValue: existing,
        suggestedValue: rawSuggested,
        confidence,
        action: hasExisting ? "kept_existing" : "no_existing",
      });
      continue;
    }

    toSave[key] = normalized;
    decisions.push({ key, existingValue: existing, suggestedValue: normalized, confidence, action: "updated" });
  }

  if (process.env.NODE_ENV === "development") {
    for (const d of decisions) {
      console.info("[profile-safe-merge]", {
        field: d.key,
        existingValue: d.existingValue,
        suggestedValue: d.suggestedValue,
        confidence: d.confidence,
        action: d.action,
      });
    }
    console.info("[profile-safe-merge]", {
      finalUpdatePayloadKeys: Object.keys(toSave),
      manualSkipped,
    });
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
