import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { mealPrompt } from "@/lib/prompts/meal";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { createClient } from "@/lib/supabase/server";
import type { MealAnalysis, SleepAnalysis } from "@/types/logs";

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
  unclearFields: [],
  needsReview: true,
  errorLikeMessage: null,
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const inputMode = body.inputMode === "text" ? "text" : "image";
    const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl : "";
    const imageDataUrls = Array.isArray(body.imageDataUrls) ? body.imageDataUrls : [];
    const mealType = typeof body.mealType === "string" ? body.mealType.trim() : "";
    const mealText = typeof body.mealText === "string" ? body.mealText.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : "";
    const freshSleep = await loadFreshLatestSleepContext();

    logMealApi("request", {
      method: request.method,
      inputMode,
      hasImageDataUrl: Boolean(imageDataUrl),
      imageDataUrlPrefix: imageDataUrl.slice(0, 30),
      imageDataUrlsCount: imageDataUrls.length,
      mealType,
      hasMealText: Boolean(mealText),
      mealTextLength: mealText.length,
      hasContext: Boolean(body.context),
      freshSleepDate: freshSleep?.date ?? null,
      freshSleepCreatedAt: freshSleep?.createdAt ?? null,
      freshSleepDuration: freshSleep?.duration ?? null,
      modelUsed,
    });

    if (!mealType) {
      return NextResponse.json({ error: "missing_meal_type", message: "ไม่พบประเภทมื้ออาหาร" }, { status: 400 });
    }
    if (inputMode === "text" && mealText.length < 2) {
      return NextResponse.json({ error: "missing_meal_text", message: "พิมพ์เมนูที่กินก่อนครับ" }, { status: 400 });
    }
    if (inputMode === "image" && !imageDataUrl && !imageDataUrls.length) {
      return NextResponse.json({ error: "missing_image", message: "ไม่พบรูปอาหาร" }, { status: 400 });
    }

    if (inputMode === "image") {
      const imagesToValidate = imageDataUrls.length ? imageDataUrls : [imageDataUrl];
      for (const img of imagesToValidate) {
        if (!img || typeof img !== "string" || !img.startsWith("data:image/")) {
          return NextResponse.json({ error: "missing_image", message: "ไม่พบรูปอาหาร" }, { status: 400 });
        }
        if (estimateDataUrlBytes(img) > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: "image_too_large", message: "รูปภาพใหญ่เกินไป ลองลดขนาดรูปแล้วอัปโหลดใหม่" }, { status: 413 });
        }
      }
    }

    const profileCtx = buildRunnerProfileContext(body.profile ?? (body.context as { profile?: unknown } | null)?.profile ?? null);
    const contextCtx = buildMealContext(body.context, freshSleep);
    const system = [mealPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

    logMealApi("openai-call-start", { modelUsed });
    const result = await jsonFromAI<MealAnalysis>({
      system,
      user: inputMode === "text"
        ? buildManualMealUserPrompt({ mealType, mealText, note })
        : buildImageMealUserPrompt({ mealType, mealText }),
      imageDataUrl: inputMode === "image" && !imageDataUrls.length ? imageDataUrl : undefined,
      imageDataUrls: inputMode === "image" && imageDataUrls.length ? imageDataUrls : undefined,
      fallback,
    });
    logMealApi("openai-call-success", { source: result.source });

    const data = normalizeMealResult(mergeWithFallback(result.data, { ...fallback, mealType }), freshSleep, {
      inputMode,
      mealText,
      note: inputMode === "image" ? mealText : note,
    });
    logMealApi("json-parse-success", {
      source: result.source,
      detectedFoodCount: data.detectedFoods.length,
      confidence: data.confidence,
      hasErrorLikeMessage: Boolean(data.errorLikeMessage),
      latestSleepDateUsed: freshSleep?.date ?? null,
      latestSleepDurationUsed: freshSleep?.duration ?? null,
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

type LatestSleepContext = {
  date: string | null;
  createdAt: string;
  duration: string | null;
  score: number | null;
  readiness: number | null;
  restingHR: number | null;
  hrv: number | null;
};

async function loadFreshLatestSleepContext(): Promise<LatestSleepContext | null> {
  try {
    const supabase = await createClient();
    if (!supabase) return null;
    const { data: authData, error: authError } = await supabase.auth.getUser();
    const userId = authData.user?.id;
    if (authError || !userId) return null;

    const today = todayBangkok();
    const { data, error } = await supabase
      .from("history_items")
      .select("id, created_at, data")
      .eq("user_id", userId)
      .eq("type", "sleep")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data?.length) return null;

    const rows = data as { id: string; created_at: string; data: unknown }[];
    const todayRow = rows.find((row) => localDateFromIso(row.created_at) === today);
    const selected = todayRow ?? rows[0];
    const sleep = unwrapAnalysis<SleepAnalysis>(selected.data);
    const latest: LatestSleepContext = {
      date: localDateFromIso(selected.created_at),
      createdAt: selected.created_at,
      duration: normalizeSleepDuration(sleep?.extracted?.sleepDuration),
      score: numberOrNull(sleep?.extracted?.sleepScore),
      readiness: numberOrNull(sleep?.coach?.readinessScore),
      restingHR: numberOrNull(sleep?.extracted?.restingHR),
      hrv: numberOrNull(sleep?.extracted?.hrv),
    };

    logMealApi("fresh-sleep-context", {
      rowCount: rows.length,
      preferredToday: Boolean(todayRow),
      latestSleepDate: latest.date,
      latestSleepCreatedAt: latest.createdAt,
      latestSleepDuration: latest.duration,
      latestReadiness: latest.readiness,
    });

    return latest;
  } catch (error) {
    logMealApi("fresh-sleep-context-error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function buildMealContext(context: unknown, latestSleep: LatestSleepContext | null) {
  const ctx = context && typeof context === "object" ? context as Record<string, unknown> : {};
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
    "Latest sleep context from Report/Supabase:",
    latestSleep
      ? `latestSleepDate: ${latestSleep.date ?? "unknown"}, latestSleepCreatedAt: ${latestSleep.createdAt}, latestSleepDuration: ${latestSleep.duration ?? "unknown"}, sleepScore: ${latestSleep.score ?? "unknown"}, readiness: ${latestSleep.readiness ?? "unknown"}, restingHR: ${latestSleep.restingHR ?? "unknown"}, hrv: ${latestSleep.hrv ?? "unknown"}`
      : "latestSleep: unavailable. Do not mention exact sleep hours.",
    "Sleep rule: mention exact sleep duration only if latestSleepDuration is not unknown. Never invent sleep hours.",
  ].join("\n");
}

function buildManualMealUserPrompt({
  mealType,
  mealText,
  note,
}: {
  mealType: string;
  mealText: string;
  note: string;
}) {
  return [
    `Analyze this manually typed ${mealType} meal for a runner.`,
    `Meal text: ${mealText}`,
    note ? `User note: ${note}` : "User note: none",
    "",
    "This is text input, not a photo. Do not say the estimate is based on visible food or image.",
    "Estimate calories and macros roughly from the text only. Prefer ranges when portion is unclear.",
    "If portion size is unclear, use medium/low confidence, needsReview true, and list unclearFields.",
    "Return JSON only using the existing meal schema. Thai coachNote should say this is a rough estimate from the typed text.",
  ].join("\n");
}

function buildImageMealUserPrompt({
  mealType,
  mealText,
}: {
  mealType: string;
  mealText: string;
}) {
  return [
    `Analyze this ${mealType} photo for a runner. Return JSON only. If uncertain, return nullable nutrition values and low confidence instead of failing.`,
    mealText ? `Additional user description/context: "${mealText}"` : "",
  ].filter(Boolean).join("\n");
}

function normalizeMealResult(
  data: MealAnalysis,
  latestSleep: LatestSleepContext | null,
  meta: { inputMode: "image" | "text"; mealText?: string; note?: string } = { inputMode: "image" },
): MealAnalysis {
  const nutritionValues = Object.values(data.nutrition ?? {});
  const hasNutrition = nutritionValues.some((value) => typeof value === "number" && Number.isFinite(value));
  const hasFood = Array.isArray(data.detectedFoods) && data.detectedFoods.length > 0;
  const isNonFoodOrUnclear = !hasFood && !hasNutrition;
  const unclearMessage = meta.inputMode === "text"
    ? "AI ยังประเมินเมนูจากข้อความนี้ได้ไม่ชัดเจน ลองเพิ่มปริมาณหรือรายละเอียดอาหารอีกนิด"
    : NON_FOOD_MESSAGE;
  const rawCoachNote = sanitizeSleepReference(
    data.trainingFit?.coachNote || (isNonFoodOrUnclear ? unclearMessage : fallback.trainingFit?.coachNote ?? ""),
    latestSleep,
  );
  const coachNote = meta.inputMode === "text"
    ? rawCoachNote
        .replace(/จากภาพ/g, "จากข้อความที่กรอก")
        .replace(/จากสิ่งที่มองเห็น/g, "จากรายละเอียดที่กรอก")
        .replace(/รูปอาหาร/g, "ข้อความอาหาร")
    : rawCoachNote;

  return {
    ...data,
    inputMode: meta.inputMode,
    originalMealText: meta.inputMode === "text" ? meta.mealText ?? "" : data.originalMealText,
    note: meta.note || data.note,
    detectedFoods: Array.isArray(data.detectedFoods) ? data.detectedFoods : [],
    confidence: data.confidence ?? "low",
    unclearFields: Array.isArray(data.unclearFields) ? data.unclearFields : [],
    needsReview: data.needsReview ?? true,
    errorLikeMessage: data.errorLikeMessage ?? (isNonFoodOrUnclear ? unclearMessage : null),
    trainingFit: {
      bestFor: data.trainingFit?.bestFor ?? fallback.trainingFit?.bestFor ?? [],
      carbAdequacy: data.trainingFit?.carbAdequacy ?? fallback.trainingFit?.carbAdequacy ?? "unknown",
      proteinAdequacy: data.trainingFit?.proteinAdequacy ?? fallback.trainingFit?.proteinAdequacy ?? "unknown",
      fatLoad: data.trainingFit?.fatLoad ?? fallback.trainingFit?.fatLoad ?? "unknown",
      hydrationNote: data.trainingFit?.hydrationNote ?? fallback.trainingFit?.hydrationNote ?? "",
      coachNote,
    },
  };
}

function sanitizeSleepReference(note: string, latestSleep: LatestSleepContext | null) {
  const sleepDurationMatches = note.match(/(?:นอน|sleep)[^.!?\n。]*(?:\d+(?:\.\d+)?\s*(?:ชม|ชั่วโมง|h|hr|hrs|hours)|\d{1,2}\s*[:.]\s*\d{2})[^.!?\n。]*/gi);
  if (!sleepDurationMatches?.length) return note;

  const latestDuration = latestSleep?.duration;
  if (latestDuration && sleepDurationMatches.every((match) => sleepDurationSemanticallyMatches(match, latestDuration))) {
    return note;
  }

  const cleaned = sleepDurationMatches.reduce((current, match) => current.replace(match, "การพักผ่อนล่าสุดยังเป็นปัจจัยที่ควรระวัง"), note);
  return cleaned.replace(/\s{2,}/g, " ").trim();
}

function sleepDurationSemanticallyMatches(text: string, latestDuration: string) {
  const textHours = extractSleepHours(text);
  const latestHours = extractSleepHours(latestDuration);
  if (textHours != null && latestHours != null) return Math.abs(textHours - latestHours) < 0.15;
  return text.includes(latestDuration);
}

function extractSleepHours(value: string) {
  const compact = value.toLowerCase().replace(/\s+/g, " ");
  const hourMinuteMatch = compact.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|ชั่วโมง|ชม)\s*(\d+)?/);
  if (hourMinuteMatch) {
    const hours = Number(hourMinuteMatch[1]);
    const minutes = hourMinuteMatch[2] ? Number(hourMinuteMatch[2]) : 0;
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return Math.round((hours + minutes / 60) * 10) / 10;
  }
  const colonMatch = compact.match(/(\d{1,2})\s*[:.]\s*(\d{2})/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) return Math.round((hours + minutes / 60) * 10) / 10;
  }
  const decimalMatch = compact.match(/(\d+(?:\.\d+)?)\s*(?:ชม|ชั่วโมง|h|hr|hrs|hours)/);
  if (decimalMatch) {
    const hours = Number(decimalMatch[1]);
    if (Number.isFinite(hours)) return hours;
  }
  return null;
}

function unwrapAnalysis<T>(value: unknown): T | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const inner = record.data && typeof record.data === "object" ? record.data : record;
  return inner as T;
}

function normalizeSleepDuration(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function todayBangkok() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function localDateFromIso(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 10);
  return new Date(parsed.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function estimateDataUrlBytes(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

function logMealApi(event: string, meta: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[meal-analysis-api]", { event, ...meta });
}
