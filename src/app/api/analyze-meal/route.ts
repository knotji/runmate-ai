import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { mealPrompt } from "@/lib/prompts/meal";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { MealAnalysis } from "@/types/logs";

const MAX_IMAGE_BYTES = 7 * 1024 * 1024;
const ANALYSIS_FAILED_MESSAGE = "วิเคราะห์รูปอาหารไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง";
const NON_FOOD_MESSAGE = "รูปนี้อาจไม่ใช่อาหาร ลองเลือกรูปอาหารอีกครั้ง";
const provider = (process.env.AI_PROVIDER || "gemini").toLowerCase();
const modelUsed = provider === "gemini" ? process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" : process.env.OPENAI_MODEL || "gpt-4o-mini";

const fallback: MealAnalysis = {
  mealType: "meal",
  detectedFoods: [],
  nutrition: {
    caloriesKcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
  },
  nutritionRange: {
    caloriesKcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
  },
  trainingFit: {
    bestFor: [],
    carbAdequacy: "unknown",
    proteinAdequacy: "unknown",
    fatLoad: "unknown",
    hydrationNote: "ดื่มน้ำตามกระหาย และดูบริบทการซ้อมร่วมด้วย",
    coachNote: "ประเมินจากภาพได้ไม่ชัดเจน ตัวเลขโภชนาการเป็นเพียงค่าคร่าว ๆ จากสิ่งที่มองเห็น",
  },
  confidence: "low",
  needsReview: true,
  errorLikeMessage: null,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
    const mealType = typeof body.mealType === "string" ? body.mealType.trim() : "";

    logMealApi("request", {
      method: request.method,
      hasImageDataUrl: Boolean(imageDataUrl),
      imageDataUrlPrefix: imageDataUrl.slice(0, 30),
      mealType,
      hasContext: Boolean(body.context),
      modelUsed,
    });

    if (!imageDataUrl) {
      return NextResponse.json({ error: "missing_image", message: "ไม่พบรูปอาหาร" }, { status: 400 });
    }
    if (!imageDataUrl.startsWith("data:image/")) {
      return NextResponse.json({ error: "missing_image", message: "ไม่พบรูปอาหาร" }, { status: 400 });
    }
    if (!mealType) {
      return NextResponse.json({ error: "missing_meal_type", message: "ไม่พบประเภทมื้ออาหาร" }, { status: 400 });
    }
    if (estimateDataUrlBytes(imageDataUrl) > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "image_too_large", message: "รูปภาพใหญ่เกินไป ลองลดขนาดรูปแล้วอัปโหลดใหม่" }, { status: 413 });
    }

    const profileCtx = buildRunnerProfileContext(body.profile ?? (body.context as { profile?: unknown } | null)?.profile ?? null);
    const contextCtx = buildMealContext(body.context);
    const system = [mealPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

    logMealApi("openai-call-start", { modelUsed });
    const result = await jsonFromAI<MealAnalysis>({
      system,
      user: `Analyze this ${mealType} photo for a runner. Return JSON only. If uncertain, return nullable nutrition values and low confidence instead of failing.`,
      imageDataUrl,
      fallback,
    });
    logMealApi("openai-call-success", { source: result.source });

    const data = normalizeMealResult(mergeWithFallback(result.data, { ...fallback, mealType }));
    logMealApi("json-parse-success", {
      source: result.source,
      detectedFoodCount: data.detectedFoods.length,
      confidence: data.confidence,
      hasErrorLikeMessage: Boolean(data.errorLikeMessage),
    });
    return NextResponse.json({ ...result, data });
  } catch (error) {
    const debugMessage = error instanceof Error ? error.message : String(error);
    logMealApi("error", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      errorMessage: debugMessage,
    });
    return NextResponse.json(
      {
        error: "analysis_failed",
        message: ANALYSIS_FAILED_MESSAGE,
        ...(process.env.NODE_ENV === "development" ? { debugMessage } : {}),
      },
      { status: 500 },
    );
  }
}

function buildMealContext(context: unknown) {
  if (!context || typeof context !== "object") return "";
  const ctx = context as Record<string, unknown>;
  return [
    "Current running context for meal analysis:",
    `todayDate: ${ctx.todayDate ?? "unknown"}`,
    `isRaceToday: ${Boolean(ctx.isRaceToday)}`,
    `isRaceTomorrow: ${Boolean(ctx.isRaceTomorrow)}`,
    `raceDistance: ${ctx.raceDistance ?? "none"}`,
    `targetTime: ${ctx.targetTime ?? "none"}`,
    `recentRunDistance: ${typeof (ctx.lastRun as { km?: unknown } | null)?.km === "number" ? (ctx.lastRun as { km: number }).km : "unknown"}`,
    `lastWorkoutDate: ${ctx.lastWorkoutDate ?? "unknown"}`,
    `avgReadiness: ${ctx.avgReadiness ?? "unknown"}`,
  ].join("\n");
}

function normalizeMealResult(data: MealAnalysis): MealAnalysis {
  const nutritionValues = Object.values(data.nutrition ?? {});
  const hasNutrition = nutritionValues.some((value) => typeof value === "number" && Number.isFinite(value));
  const hasFood = Array.isArray(data.detectedFoods) && data.detectedFoods.length > 0;
  const isNonFoodOrUnclear = !hasFood && !hasNutrition;

  return {
    ...data,
    detectedFoods: Array.isArray(data.detectedFoods) ? data.detectedFoods : [],
    confidence: data.confidence ?? "low",
    needsReview: data.needsReview ?? true,
    errorLikeMessage: data.errorLikeMessage ?? (isNonFoodOrUnclear ? NON_FOOD_MESSAGE : null),
    trainingFit: {
      ...fallback.trainingFit,
      ...data.trainingFit,
      coachNote: data.trainingFit?.coachNote || (isNonFoodOrUnclear ? NON_FOOD_MESSAGE : fallback.trainingFit.coachNote),
    },
  };
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function logMealApi(event: string, meta: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[meal-analysis-api]", { event, ...meta });
}
