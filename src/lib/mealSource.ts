export type MealSourceType = "image" | "manual" | "mixed" | "unknown";

export type MealSourceInfo = {
  sourceType: MealSourceType;
  badgeText: string | null;
  assessmentText: string;
};

export function isQuickProteinMeal(meal: unknown): boolean {
  if (!meal || typeof meal !== "object") return false;
  const m = meal as Record<string, unknown>;
  return m.quickLog === true && m.quickLogKind === "protein";
}

export function getMealSourceInfo(meal: unknown): MealSourceInfo {
  if (!meal || typeof meal !== "object") {
    return {
      sourceType: "unknown",
      badgeText: null,
      assessmentText: "ประเมินจากข้อมูลอาหาร",
    };
  }

  const m = meal as Record<string, unknown>;

  // Quick-log records: protein-only, no full meal analysis
  if (isQuickProteinMeal(m)) {
    const proteinG = (m.quickLogProteinG ?? m.proteinG) as number | undefined;
    const assessmentText = proteinG != null ? `กินโปรตีนแล้ว · ${proteinG}g` : "บันทึกไว ๆ";
    return { sourceType: "manual", badgeText: "บันทึกไว ๆ", assessmentText };
  }

  // Detect inputMode or sourceType
  const inputMode = m.inputMode as string | undefined;
  const sourceTypeField = m.sourceType as string | undefined;

  // Check counts
  const imageCount = typeof m.imageCount === "number" ? m.imageCount : null;
  const entriesCount = Array.isArray(m.entries) ? m.entries.length : null;
  const detectedFoodsCount = Array.isArray(m.detectedFoods) ? m.detectedFoods.length : null;

  // Check for image evidence (e.g. image URLs, entries array, or imageCount > 0)
  const hasImageUrl = !!(m.imageUrl || m.imageUrl === "");
  const hasEntries = entriesCount !== null && entriesCount > 0;
  const hasImageEvidence = hasImageUrl || hasEntries || (imageCount !== null && imageCount > 0);

  // Check for text evidence
  const hasTextEvidence = !!(m.originalMealText || m.note);

  // Determine SourceType
  let resolvedSource: MealSourceType = "unknown";
  if (sourceTypeField === "image" || inputMode === "image") {
    resolvedSource = "image";
  } else if (sourceTypeField === "manual" || inputMode === "text") {
    resolvedSource = "manual";
  } else if (hasImageEvidence) {
    resolvedSource = "image";
  } else if (hasTextEvidence) {
    resolvedSource = "manual";
  }

  // Determine BadgeText
  let badgeText: string | null = null;
  if (resolvedSource === "image") {
    const finalImageCount = imageCount ?? entriesCount ?? 1;
    badgeText = `${finalImageCount} รูป`;
  } else if (resolvedSource === "manual") {
    const itemsCount = detectedFoodsCount ?? 0;
    if (itemsCount > 0) {
      badgeText = `${itemsCount} รายการ`;
    } else {
      badgeText = "พิมพ์เอง";
    }
  } else {
    // Unknown or legacy fallback
    if (hasImageEvidence) {
      const finalImageCount = imageCount ?? entriesCount ?? 1;
      badgeText = `${finalImageCount} รูป`;
    } else if (detectedFoodsCount !== null && detectedFoodsCount > 0) {
      badgeText = `${detectedFoodsCount} รายการ`;
    } else {
      badgeText = null;
    }
  }

  // Determine AssessmentText
  let assessmentText = "ประเมินจากข้อมูลอาหาร";
  if (resolvedSource === "image") {
    assessmentText = "ประเมินจากรูปอาหาร";
  } else if (resolvedSource === "manual") {
    assessmentText = "ประเมินจากข้อมูลที่บันทึก";
  }

  return {
    sourceType: resolvedSource,
    badgeText,
    assessmentText,
  };
}
