import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { sleepPrompt } from "@/lib/prompts/sleep";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { SleepAnalysis } from "@/types/logs";

const fallback: SleepAnalysis = {
  extracted: {
    date: null,
    sleepDuration: null,
    sleepScore: null,
    energyScore: null,
    restingHR: null,
    hrv: null,
    sleepQualityLabel: null,
    visibleNotes: null,
  },
  coach: {
    readinessScore: 68,
    readinessLabel: "Fair",
    aiSummary: "จากข้อมูลที่เห็นยังประเมินตัวเลขได้ไม่ครบ วันนี้ควรซ้อมแบบระวังและฟังร่างกาย",
    todayRecommendation: "อาจเหมาะกับ Easy Run 4-6 km หรือพักถ้ารู้สึกล้า",
    nutritionFocus: "เติมคาร์บพอดี ดื่มน้ำ และอย่าปล่อยให้หิวก่อนวิ่ง",
    recoveryFocus: "ลดความหนัก ยืดเบา ๆ และพักให้มากขึ้น",
    sleepFocus: "คืนนี้ลองเข้านอนให้เร็วขึ้น 30-45 นาที",
    warningNotes: "ถ้ามีอาการเจ็บ หน้ามืด หรือแน่นหน้าอก ควรหยุดซ้อมและปรึกษาผู้เชี่ยวชาญ",
  },
};

export async function POST(request: Request) {
  const body = await request.json();
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const contextCtx = buildAnalysisContext(body.context);
  const system = [sleepPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

  const result = await jsonFromAI<SleepAnalysis>({
    system,
    user: "Analyze this sleep screenshot and return JSON in the requested schema.",
    imageDataUrl: body.imageDataUrl,
    fallback,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, fallback), imageUrl: body.imageUrl });
}

function buildAnalysisContext(context: unknown) {
  if (!context || typeof context !== "object") return "";
  const ctx = context as Record<string, unknown>;
  const lines = [
    "Current app context:",
    `todayDate: ${ctx.todayDate ?? "unknown"}`,
    `isRaceToday: ${Boolean(ctx.isRaceToday)}`,
    `isRaceTomorrow: ${Boolean(ctx.isRaceTomorrow)}`,
    `isRaceWeek: ${Boolean(ctx.isRaceWeek)}`,
    `raceDate: ${ctx.raceDate ?? "none"}`,
    `raceName: ${ctx.raceName ?? "none"}`,
    `raceDistance: ${ctx.raceDistance ?? "none"}`,
    `targetTime: ${ctx.targetTime ?? "none"}`,
    "If isRaceToday is true, mention race-day readiness and avoid suggesting heavy extra training.",
  ];
  return lines.join("\n");
}
