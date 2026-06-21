import type { MealAnalysis, MealEntry } from "@/types/logs";
import type { LocalHistoryItem } from "@/lib/localHistory";

export type NormalizedNutrition = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** valid + valid = sum; valid + invalid = valid; invalid + invalid = null */
export function safeAddNutritionValue(a: unknown, b: unknown): number | null {
  const na = cleanNumber(a);
  const nb = cleanNumber(b);
  if (na === null && nb === null) return null;
  return Math.round(((na ?? 0) + (nb ?? 0)) * 10) / 10;
}

/**
 * Normalize nutrition from any known storage shape.
 * Handles: data.nutrition.*, data.*, legacy flat keys.
 */
export function normalizeMealNutrition(data: Record<string, unknown>): NormalizedNutrition {
  const n = (typeof data.nutrition === "object" && data.nutrition !== null
    ? data.nutrition
    : {}) as Record<string, unknown>;
  return {
    caloriesKcal: cleanNumber(n.caloriesKcal ?? data.caloriesKcal ?? data.kcal),
    proteinG:     cleanNumber(n.proteinG     ?? data.proteinG     ?? data.protein),
    carbsG:       cleanNumber(n.carbsG       ?? data.carbsG       ?? data.carbs),
    fatG:         cleanNumber(n.fatG         ?? data.fatG         ?? data.fat),
    fiberG:       cleanNumber(n.fiberG       ?? data.fiberG       ?? data.fiber),
  };
}

/**
 * Unwrap meal data from a history item.
 * Handles the old wrapped format { data: MealAnalysis } produced by the
 * pre-fix merge path, and the current direct MealAnalysis format.
 */
export function extractMealData(item: LocalHistoryItem): MealAnalysis {
  const d = item.data as Record<string, unknown>;
  if (d?.data && typeof d.data === "object" && !Array.isArray(d.data)) {
    const inner = d.data as Record<string, unknown>;
    if ("mealType" in inner || "nutrition" in inner || "detectedFoods" in inner) {
      return inner as unknown as MealAnalysis;
    }
  }
  return d as unknown as MealAnalysis;
}

/** Build a merged MealAnalysis from an existing and a new analysis. */
export function buildMergedMeal(existing: MealAnalysis, incoming: MealAnalysis): MealAnalysis {
  const existNutr = normalizeMealNutrition(existing as unknown as Record<string, unknown>);
  const incomNutr = normalizeMealNutrition(incoming as unknown as Record<string, unknown>);

  const seen = new Set<string>();
  const mergedFoods = [...(existing.detectedFoods ?? []), ...(incoming.detectedFoods ?? [])].filter(
    (f) => {
      if (!f.name || seen.has(f.name)) return false;
      seen.add(f.name);
      return true;
    },
  );

  const existingEntries: MealEntry[] = existing.entries ?? [
    {
      detectedFoods: existing.detectedFoods ?? [],
      nutrition: existNutr,
      imageUrl: existing.imageUrl ?? null,
      createdAt: existing.createdAt,
    },
  ];
  const newEntry: MealEntry = {
    detectedFoods: incoming.detectedFoods ?? [],
    nutrition: incomNutr,
    imageUrl: incoming.imageUrl ?? null,
    createdAt: incoming.createdAt ?? new Date().toISOString(),
  };
  const entries = [...existingEntries, newEntry];

  return {
    ...incoming,
    mealType: existing.mealType || incoming.mealType,
    detectedFoods: mergedFoods,
    nutrition: {
      caloriesKcal: safeAddNutritionValue(existNutr.caloriesKcal, incomNutr.caloriesKcal),
      proteinG:     safeAddNutritionValue(existNutr.proteinG,     incomNutr.proteinG),
      carbsG:       safeAddNutritionValue(existNutr.carbsG,       incomNutr.carbsG),
      fatG:         safeAddNutritionValue(existNutr.fatG,         incomNutr.fatG),
      fiberG:       safeAddNutritionValue(existNutr.fiberG,       incomNutr.fiberG),
    },
    entries,
    imageCount: entries.length,
    entriesMerged: entries.length,
    updatedAt: new Date().toISOString(),
    imageUrl: existing.imageUrl ?? incoming.imageUrl ?? null,
    needsReview: false,
    localDate: existing.localDate ?? incoming.localDate,
    mealGroupKey: existing.mealGroupKey ?? incoming.mealGroupKey,
    confidence: existing.confidence ?? incoming.confidence,
    trainingFit: existing.trainingFit ?? incoming.trainingFit,
    coachNote: existing.coachNote ?? incoming.coachNote,
  } as MealAnalysis;
}
