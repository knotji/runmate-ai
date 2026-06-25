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
  confidence: "low",
  unclearFields: ["date", "distanceKm", "duration", "avgHR"],
};

export async function POST(request: Request) {
  const body = await request.json();
  const imageDataUrls = readImageDataUrls(body);
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const contextCtx = buildAnalysisContext(body.context);
  const system = [workoutPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

  const result = await jsonFromAI<WorkoutAnalysis>({
    system,
    user: imageDataUrls.length > 1
      ? `Analyze these ${imageDataUrls.length} workout screenshots together and merge them into one workout record. Apply the multi-image merge rules from the system prompt.`
      : "Analyze this workout screenshot and return JSON in the requested schema.",
    imageDataUrl: imageDataUrls[0],
    imageDataUrls,
    fallback,
  });

  const normalized = normalizeWorkoutExtraction(
    normalizeReadQuality(mergeWithFallback(result.data, fallback)),
    imageDataUrls.length,
  );

  return NextResponse.json({ ...result, data: normalized });
}

function readImageDataUrls(body: Record<string, unknown>): string[] {
  const urls = Array.isArray(body.imageDataUrls)
    ? body.imageDataUrls.filter((v): v is string => typeof v === "string" && v.startsWith("data:image/"))
    : [];
  if (urls.length) return urls;
  return typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")
    ? [body.imageDataUrl]
    : [];
}

function normalizeReadQuality(data: WorkoutAnalysis): WorkoutAnalysis {
  return {
    ...data,
    confidence: data.confidence ?? "low",
    unclearFields: Array.isArray(data.unclearFields) ? data.unclearFields : [],
  };
}

function normalizeWorkoutExtraction(data: WorkoutAnalysis, imageCount: number): WorkoutAnalysis {
  const ext = data.extracted;
  const isStrength = ext.workoutKind === "strength";
  let { avgPace } = ext;

  // Derive average pace from distance + duration when AI left it null
  // Skip for strength workouts — distance/pace are intentionally absent
  if (!isStrength && !avgPace && ext.distanceKm && ext.distanceKm > 0 && ext.duration) {
    const totalMin = parseDurationToMinutes(ext.duration);
    if (totalMin && totalMin > 0) {
      const paceMinPerKm = totalMin / ext.distanceKm;
      const paceMin = Math.floor(paceMinPerKm);
      const paceSec = Math.round((paceMinPerKm - paceMin) * 60);
      avgPace = `${paceMin}:${paceSec.toString().padStart(2, "0")}`;
    }
  }

  const unclearFields = recomputeUnclearFields(data.unclearFields ?? [], ext, avgPace, isStrength);

  return {
    ...data,
    extracted: {
      ...ext,
      avgPace,
      mergedFromMultipleImages: imageCount > 1,
    },
    unclearFields,
  };
}

function recomputeUnclearFields(
  existing: string[],
  ext: WorkoutAnalysis["extracted"],
  avgPace: string | null,
  isStrength = false,
): string[] {
  const cleared = new Set<string>();
  if (ext.distanceKm != null) cleared.add("distanceKm");
  if (ext.duration) cleared.add("duration");
  if (ext.avgHR != null) cleared.add("avgHR");
  if (avgPace) cleared.add("avgPace");
  if (ext.date) cleared.add("date");
  // For strength workouts, distance and pace are intentionally absent — remove them from unclear list
  if (isStrength) {
    cleared.add("distanceKm");
    cleared.add("avgPace");
    cleared.add("avgSpeedKmh");
  }
  return existing.filter((field) => !cleared.has(field));
}

function parseDurationToMinutes(duration: string): number | null {
  const parts = duration.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return null;
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
