import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { runPrompt } from "@/lib/prompts/run";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { RunAnalysis } from "@/types/logs";

const fallback: RunAnalysis = {
  extracted: {
    date: null,
    distanceKm: null,
    duration: null,
    avgPace: null,
    avgHR: null,
    maxHR: null,
    cadence: null,
    calories: null,
    elevationGain: null,
    trainingEffect: null,
  },
  coach: {
    runSummary: "บันทึกการวิ่งถูกอัปโหลดแล้ว แต่ยังอ่านตัวเลขไม่ได้ครบ",
    intensityAssessment: "ถ้าวิ่งแล้วหอบหรือ HR สูงกว่าปกติ ให้ถือว่าเป็นวันค่อนข้างหนักและลดความเข้มพรุ่งนี้",
    wasTooHard: false,
    recoveryAdvice: "เดินคลาย ยืดเบา ๆ และนอนให้พอ",
    nutritionAfterRun: "เติมน้ำ คาร์บ และโปรตีนภายในมื้อถัดไป",
    nextRunSuggestion: "ครั้งถัดไปแนะนำ Easy Run สั้น ๆ หรือพักตามความล้า",
    coachNote: "เก็บข้อมูลต่อเนื่องสำคัญกว่าวิ่งให้หนักทุกครั้ง",
  },
};

export async function POST(request: Request) {
  const body = await request.json();
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const system = profileCtx ? `${runPrompt}\n\n${profileCtx}` : runPrompt;

  const result = await jsonFromAI<RunAnalysis>({
    system,
    user: "Analyze this running result screenshot. Extract visible values only and return JSON.",
    imageDataUrl: body.imageDataUrl,
    fallback,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, fallback), imageUrl: body.imageUrl });
}
