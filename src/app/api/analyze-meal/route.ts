import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { mealPrompt } from "@/lib/prompts/meal";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { MealAnalysis } from "@/types/logs";

const fallback: MealAnalysis = {
  extracted: {
    detectedFood: "ประเมินจากภาพไม่ได้ชัดเจน",
    proteinLevel: "moderate",
    carbLevel: "moderate",
    fatLevel: "moderate",
    hydrationSuggestion: "ดื่มน้ำเพิ่มเล็กน้อย โดยเฉพาะถ้ามีซ้อมวันนี้",
    trainingFit: "เป็นการประเมินคร่าว ๆ จากภาพ ไม่ใช่การนับแคลอรี่แบบแม่นยำ",
  },
  coach: {
    aiSummary: "มื้อนี้ดูพอเป็นมื้อสมดุลแบบคร่าว ๆ แต่ยังต้องดูบริบทการซ้อมทั้งวัน",
    suggestion: "ถ้าก่อนวิ่งให้เน้นคาร์บย่อยง่าย ถ้าหลังวิ่งให้เติมโปรตีนและคาร์บร่วมกัน",
  },
};

export async function POST(request: Request) {
  const body = await request.json();
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const system = profileCtx ? `${mealPrompt}\n\n${profileCtx}` : mealPrompt;

  const result = await jsonFromAI<MealAnalysis>({
    system,
    user: `Analyze this ${body.mealType || "meal"} photo for a runner. Return JSON only.`,
    imageDataUrl: body.imageDataUrl,
    fallback,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, fallback), imageUrl: body.imageUrl });
}
