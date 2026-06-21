import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { bodyCompositionPrompt } from "@/lib/prompts/bodyComposition";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { BodyCompositionAnalysis } from "@/types/logs";

const fallback: BodyCompositionAnalysis = {
  extracted: {
    date: null,
    weightKg: null,
    skeletalMuscleKg: null,
    bodyFatPercent: null,
    fatMassKg: null,
    bodyWaterKg: null,
    bmi: null,
    bmrCalories: null,
    visibleNotes: null,
  },
  coach: {
    bodySummary: "อัปโหลด body composition แล้ว แต่ยังอ่านค่าจากภาพได้ไม่ครบ",
    runnerInterpretation: "ใช้ตัวเลขนี้ดูแนวโน้มระยะยาวมากกว่าตัดสินจากวันเดียว",
    nutritionFocus: "กินให้พอสำหรับการซ้อม โดยเฉพาะโปรตีนและคาร์บหลังออกกำลังกาย",
    strengthFocus: "คงเวท 2-3 วันต่อสัปดาห์เพื่อช่วยกล้ามเนื้อและลดเสี่ยงเจ็บ",
    cautionNotes: "นี่เป็นค่าประเมินจากอุปกรณ์ ไม่ใช่การวินิจฉัยทางการแพทย์",
    coachNote: "อย่าให้ตัวเลขน้ำหนักวันเดียวกำหนดคุณภาพการซ้อม ดู trend และความรู้สึกควบคู่กัน",
  },
  confidence: "low",
  unclearFields: ["weightKg", "skeletalMuscleKg", "bodyFatPercent", "bmrCalories"],
};

export async function POST(request: Request) {
  const body = await request.json();
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const system = profileCtx ? `${bodyCompositionPrompt}\n\n${profileCtx}` : bodyCompositionPrompt;

  const result = await jsonFromAI<BodyCompositionAnalysis>({
    system,
    user: "Analyze these body composition screenshots and return JSON.",
    imageDataUrls: body.imageDataUrls,
    imageDataUrl: body.imageDataUrl,
    fallback,
  });

  return NextResponse.json({ ...result, data: normalizeReadQuality(mergeWithFallback(result.data, fallback)) });
}

function normalizeReadQuality(data: BodyCompositionAnalysis): BodyCompositionAnalysis {
  return {
    ...data,
    confidence: data.confidence ?? "low",
    unclearFields: Array.isArray(data.unclearFields) ? data.unclearFields : [],
  };
}
