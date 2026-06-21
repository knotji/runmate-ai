import type { MealAnalysis, MealEntry } from "@/types/logs";
import type { LocalHistoryItem } from "@/lib/localHistory";

export type NormalizedNutrition = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
};

const IMAGE_KEYS = new Set([
  "imageUrl",
  "imageUrls",
  "imagePath",
  "imagePaths",
  "storagePath",
  "storagePaths",
  "thumbnailUrl",
  "thumbnailUrls",
  "base64",
  "imageDataUrl",
  "imageDataUrls",
]);

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

type MealLike = Record<string, unknown> | null | undefined;

export function normalizeMealNutrition(data: MealLike): NormalizedNutrition {
  if (!data) {
    return { caloriesKcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null };
  }
  const n = (typeof data.nutrition === "object" && data.nutrition !== null
    ? data.nutrition
    : {}) as Record<string, unknown>;
  return {
    caloriesKcal: cleanNumber(n.caloriesKcal ?? n.calories ?? data.caloriesKcal ?? data.calories ?? data.kcal),
    proteinG:     cleanNumber(n.proteinG     ?? n.protein      ?? data.proteinG     ?? data.protein),
    carbsG:       cleanNumber(n.carbsG       ?? n.carbs        ?? data.carbsG       ?? data.carbs),
    fatG:         cleanNumber(n.fatG         ?? n.fat          ?? data.fatG         ?? data.fat),
    fiberG:       cleanNumber(n.fiberG       ?? n.fiber        ?? data.fiberG       ?? data.fiber),
  };
}

/** Merge two meal nutrition datasets safely. */
export function mergeMealNutrition(existing: MealLike, incoming: MealLike): NormalizedNutrition {
  const existNutr = normalizeMealNutrition(existing);
  const incomNutr = normalizeMealNutrition(incoming);
  return {
    caloriesKcal: safeAddNutritionValue(existNutr.caloriesKcal, incomNutr.caloriesKcal),
    proteinG:     safeAddNutritionValue(existNutr.proteinG,     incomNutr.proteinG),
    carbsG:       safeAddNutritionValue(existNutr.carbsG,       incomNutr.carbsG),
    fatG:         safeAddNutritionValue(existNutr.fatG,         incomNutr.fatG),
    fiberG:       safeAddNutritionValue(existNutr.fiberG,       incomNutr.fiberG),
  };
}

/** Unwrap meal data from a history item. */
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

function stripImageReferences<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripImageReferences(item)) as T;
  }
  if (!value || typeof value !== "object") return value;
  const cleaned: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (IMAGE_KEYS.has(key)) continue;
    cleaned[key] = stripImageReferences(nestedValue);
  }
  return cleaned as T;
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
      createdAt: existing.createdAt,
    },
  ];
  const newEntry: MealEntry = {
    detectedFoods: incoming.detectedFoods ?? [],
    nutrition: incomNutr,
    createdAt: incoming.createdAt ?? new Date().toISOString(),
  };
  const entries = stripImageReferences([...existingEntries, newEntry]);

  return stripImageReferences({
    ...incoming,
    mealType: existing.mealType || incoming.mealType,
    detectedFoods: mergedFoods,
    nutrition: mergeMealNutrition(existing, incoming),
    entries,
    imageCount: entries.length,
    entriesMerged: entries.length,
    updatedAt: new Date().toISOString(),
    needsReview: false,
    localDate: existing.localDate ?? incoming.localDate,
    mealGroupKey: existing.mealGroupKey ?? incoming.mealGroupKey,
    confidence: existing.confidence ?? incoming.confidence,
    trainingFit: existing.trainingFit ?? incoming.trainingFit,
    coachNote: existing.coachNote ?? incoming.coachNote,
  } as MealAnalysis);
}
