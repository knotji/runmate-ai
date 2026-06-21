import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { workoutPrompt } from "@/lib/prompts/workout";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { WorkoutAnalysis } from "@/types/logs";

const fallback: WorkoutAnalysis = {
  extracted: {
    workoutKind: "other",
    date: null,
    distanceKm: null,
    duration: null,
    avgPace: null,
    avgSpeedKmh: null,
    avgHR: null,
    maxHR: null,
    cadence: null,
    calories: null,
    elevationGain: null,
    vo2Max: null,
    sweatLossMl: null,
    visibleMetrics: [],
  },
  coach: {
    workoutSummary: "อัปโหลดข้อมูลซ้อมแล้ว แต่ยังอ่านตัวเลขได้ไม่ครบ",
    intensityAssessment: "ให้ประเมินจากความรู้สึกและ HR ถ้าหอบมากหรือ HR สูงกว่าปกติ ให้ถือว่าเป็นวันหนัก",
    trainingLoadNote: "เก็บความสม่ำเสมอก่อนเพิ่มความหนัก",
    wasTooHard: false,
    recoveryAdvice: "เดินคลาย ยืดเบา ๆ และนอนให้พอ",
    nutritionAfterWorkout: "เติมน้ำ คาร์บ และโปรตีนในมื้อถัดไป",
    nextWorkoutSuggestion: "ครั้งถัดไปเลือก easy หรือ strength เบา ๆ ตามความล้า",
    coachNote: "ซ้อมให้ต่อเนื่องและไม่ฝืนสำคัญกว่าตัวเลขสวยในวันเดียว",
  },
};

export async function POST(request: Request) {
  const body = await request.json();
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const contextCtx = buildAnalysisContext(body.context);
  const system = [workoutPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

  const result = await jsonFromAI<WorkoutAnalysis>({
    system,
    user: "Analyze these workout screenshots together and return JSON.",
    imageDataUrls: body.imageDataUrls,
    imageDataUrl: body.imageDataUrl,
    fallback,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, fallback), imageUrls: body.imageUrls });
}

function buildAnalysisContext(context: unknown) {
  if (!context || typeof context !== "object") return "";
  const ctx = context as Record<string, unknown>;
  return [
    "Current app context:",
    `todayDate: ${ctx.todayDate ?? "unknown"}`,
    `isRaceToday: ${Boolean(ctx.isRaceToday)}`,
    `isRaceTomorrow: ${Boolean(ctx.isRaceTomorrow)}`,
    `isRaceWeek: ${Boolean(ctx.isRaceWeek)}`,
    `raceDate: ${ctx.raceDate ?? "none"}`,
    `raceName: ${ctx.raceName ?? "none"}`,
    `raceDistance: ${ctx.raceDistance ?? "none"}`,
    `targetTime: ${ctx.targetTime ?? "none"}`,
    "If isRaceToday is true, treat a same-day run as possible race-day performance and include race-day recovery context.",
  ].join("\n");
}
