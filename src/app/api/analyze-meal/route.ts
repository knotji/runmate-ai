import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { mealPrompt } from "@/lib/prompts/meal";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { MealAnalysis } from "@/types/logs";

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
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.imageDataUrl || typeof body.imageDataUrl !== "string") {
      return NextResponse.json({ error: "missing imageDataUrl" }, { status: 400 });
    }
    const profileCtx = buildRunnerProfileContext(body.profile ?? null);
    const contextCtx = buildMealContext(body.context);
    const system = [mealPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

    const result = await jsonFromAI<MealAnalysis>({
      system,
      user: `Analyze this ${body.mealType || "meal"} photo for a runner. Return JSON only.`,
      imageDataUrl: body.imageDataUrl,
      fallback,
    });

    const data = mergeWithFallback(result.data, { ...fallback, mealType: body.mealType || "meal" });
    return NextResponse.json({ ...result, data, imageUrl: body.imageUrl });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[meal-analysis-error]", error);
    }
    return NextResponse.json({ error: "วิเคราะห์รูปอาหารไม่สำเร็จ ลองเลือกรูปใหม่อีกครั้ง" }, { status: 500 });
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
