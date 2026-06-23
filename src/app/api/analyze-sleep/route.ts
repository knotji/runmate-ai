import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { sleepPrompt } from "@/lib/prompts/sleep";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { parseSleepDurationToMinutes, sleepDurationTextFromMinutes } from "@/lib/sleepDuration";
import { polishSleepInsightText } from "@/lib/sleepInsight";
import type { SleepAnalysis } from "@/types/logs";

const fallback: SleepAnalysis = {
  extracted: {
    date: null,
    sleepDuration: null,
    actualSleepDurationMinutes: null,
    actualSleepDurationText: null,
    timeInBedMinutes: null,
    timeInBedText: null,
    sleepStartTime: null,
    sleepEndTime: null,
    avgSleepingHeartRate: null,
    avgSleepingHrv: null,
    avgRespiratoryRate: null,
    sleepStageAwakeMinutes: null,
    sleepStageRemMinutes: null,
    sleepStageLightMinutes: null,
    sleepStageDeepMinutes: null,
    sleepStageMinutes: null,
    sleepDurationSource: "unknown",
    mergedFromMultipleImages: false,
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
  confidence: "low",
  unclearFields: ["sleepDuration", "sleepScore", "energyScore", "restingHR", "hrv"],
};

export async function POST(request: Request) {
  const body = await request.json();
  const imageDataUrls = readImageDataUrls(body);
  const profileCtx = buildRunnerProfileContext(body.profile ?? null);
  const contextCtx = buildAnalysisContext(body.context);
  const system = [sleepPrompt, profileCtx, contextCtx].filter(Boolean).join("\n\n");

  const result = await jsonFromAI<SleepAnalysis>({
    system,
    user: imageDataUrls.length > 1
      ? `Analyze these ${imageDataUrls.length} sleep screenshots together. Merge visible fields from all images into one sleep record.`
      : "Analyze this sleep screenshot and return JSON in the requested schema.",
    imageDataUrl: imageDataUrls[0],
    imageDataUrls,
    fallback,
  });
  if (process.env.NODE_ENV === "development") {
    console.info("[sleep-analysis-debug]", {
      imageCount: imageDataUrls.length,
      source: result.source,
      hasDuration: Boolean(result.data?.extracted?.sleepDuration || result.data?.extracted?.actualSleepDurationMinutes),
      sleepScore: result.data?.extracted?.sleepScore ?? null,
      energyScore: result.data?.extracted?.energyScore ?? null,
    });
  }

  const normalized = normalizeSleepExtraction(normalizeReadQuality(mergeWithFallback(result.data, fallback)), imageDataUrls.length);
  const polished = polishSleepAnalysis(normalized, {
    context: body.context,
    profile: body.profile,
  });

  return NextResponse.json({
    ...result,
    data: recomputeSleepUnclearFields(polished),
  });
}

function readImageDataUrls(body: Record<string, unknown>): string[] {
  const urls = Array.isArray(body.imageDataUrls)
    ? body.imageDataUrls.filter((value): value is string => typeof value === "string" && value.startsWith("data:image/"))
    : [];
  if (urls.length) return urls;
  return typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/")
    ? [body.imageDataUrl]
    : [];
}

function normalizeReadQuality(data: SleepAnalysis): SleepAnalysis {
  return {
    ...data,
    confidence: data.confidence ?? "low",
    unclearFields: Array.isArray(data.unclearFields) ? data.unclearFields : [],
  };
}

function normalizeSleepExtraction(data: SleepAnalysis, imageCount = 1): SleepAnalysis {
  const extracted = data.extracted ?? fallback.extracted;
  const stageObject = readStageObject(extracted.sleepStageMinutes);
  const actualMinutes = parsePositiveMinutes(
    extracted.actualSleepDurationMinutes,
    extracted.actualSleepDurationText,
  );
  const timeInBedMinutes = parsePositiveMinutes(
    extracted.timeInBedMinutes,
    extracted.timeInBedText,
  );
  const legacyMinutes = parseSleepDurationToMinutes(extracted.sleepDuration);

  const primaryMinutes = actualMinutes ?? legacyMinutes ?? timeInBedMinutes;
  const sleepDurationSource = actualMinutes
    ? "actual"
    : primaryMinutes && timeInBedMinutes && primaryMinutes === timeInBedMinutes
      ? "time_in_bed_fallback"
      : extracted.sleepDurationSource ?? "unknown";

  const actualSleepDurationMinutes = actualMinutes ?? (sleepDurationSource === "time_in_bed_fallback" ? null : primaryMinutes);
  const actualSleepDurationText = actualSleepDurationMinutes
    ? extracted.actualSleepDurationText ?? sleepDurationTextFromMinutes(actualSleepDurationMinutes)
    : null;
  const timeInBedText = timeInBedMinutes
    ? extracted.timeInBedText ?? sleepDurationTextFromMinutes(timeInBedMinutes)
    : null;

  return {
    ...data,
    extracted: {
      ...extracted,
      sleepDuration: primaryMinutes ? sleepDurationTextFromMinutes(primaryMinutes) : extracted.sleepDuration,
      actualSleepDurationMinutes,
      actualSleepDurationText,
      timeInBedMinutes,
      timeInBedText,
      sleepDurationSource,
      restingHR: roundNullable(extracted.restingHR ?? extracted.avgSleepingHeartRate),
      hrv: roundNullable(extracted.hrv ?? extracted.avgSleepingHrv),
      avgSleepingHeartRate: roundNullable(extracted.avgSleepingHeartRate ?? extracted.restingHR),
      avgSleepingHrv: roundNullable(extracted.avgSleepingHrv ?? extracted.hrv),
      avgRespiratoryRate: roundDecimalNullable(extracted.avgRespiratoryRate),
      sleepStageAwakeMinutes: parseSleepDurationToMinutes(extracted.sleepStageAwakeMinutes) ?? stageObject.awake,
      sleepStageRemMinutes: parseSleepDurationToMinutes(extracted.sleepStageRemMinutes) ?? stageObject.rem,
      sleepStageLightMinutes: parseSleepDurationToMinutes(extracted.sleepStageLightMinutes) ?? stageObject.light,
      sleepStageDeepMinutes: parseSleepDurationToMinutes(extracted.sleepStageDeepMinutes) ?? stageObject.deep,
      sleepStageMinutes: {
        awake: parseSleepDurationToMinutes(extracted.sleepStageAwakeMinutes) ?? stageObject.awake,
        rem: parseSleepDurationToMinutes(extracted.sleepStageRemMinutes) ?? stageObject.rem,
        light: parseSleepDurationToMinutes(extracted.sleepStageLightMinutes) ?? stageObject.light,
        deep: parseSleepDurationToMinutes(extracted.sleepStageDeepMinutes) ?? stageObject.deep,
      },
      mergedFromMultipleImages: imageCount > 1,
    },
  };
}

function recomputeSleepUnclearFields(data: SleepAnalysis): SleepAnalysis {
  const ext = data.extracted;
  const missing = new Set((data.unclearFields ?? []).filter(Boolean));
  if (hasPrimaryDuration(ext)) {
    missing.delete("sleepDuration");
    missing.delete("actualSleepDurationMinutes");
    missing.delete("actualSleepDurationText");
  } else {
    missing.add("sleepDuration");
  }
  if (ext.sleepScore != null) missing.delete("sleepScore");
  if (ext.energyScore != null) missing.delete("energyScore");
  if (ext.restingHR != null || ext.avgSleepingHeartRate != null) {
    missing.delete("restingHR");
    missing.delete("avgSleepingHeartRate");
  }
  if (ext.hrv != null || ext.avgSleepingHrv != null) {
    missing.delete("hrv");
    missing.delete("avgSleepingHrv");
  }
  if (hasSleepStages(ext)) {
    missing.delete("sleepStageMinutes");
    missing.delete("sleepStageAwakeMinutes");
    missing.delete("sleepStageRemMinutes");
    missing.delete("sleepStageLightMinutes");
    missing.delete("sleepStageDeepMinutes");
  }
  return { ...data, unclearFields: Array.from(missing) };
}

function hasPrimaryDuration(extracted: SleepAnalysis["extracted"]) {
  return Boolean(
    extracted.actualSleepDurationMinutes ||
    extracted.actualSleepDurationText ||
    extracted.sleepDuration ||
    extracted.timeInBedMinutes,
  );
}

function hasSleepStages(extracted: SleepAnalysis["extracted"]) {
  return Boolean(
    extracted.sleepStageAwakeMinutes ||
    extracted.sleepStageRemMinutes ||
    extracted.sleepStageLightMinutes ||
    extracted.sleepStageDeepMinutes ||
    extracted.sleepStageMinutes?.awake ||
    extracted.sleepStageMinutes?.rem ||
    extracted.sleepStageMinutes?.light ||
    extracted.sleepStageMinutes?.deep,
  );
}

function readStageObject(value: unknown): { awake: number | null; rem: number | null; light: number | null; deep: number | null } {
  const record = readRecord(value);
  return {
    awake: parseSleepDurationToMinutes(record?.awake),
    rem: parseSleepDurationToMinutes(record?.rem),
    light: parseSleepDurationToMinutes(record?.light),
    deep: parseSleepDurationToMinutes(record?.deep),
  };
}

function parsePositiveMinutes(...values: unknown[]) {
  for (const value of values) {
    const parsed = parseSleepDurationToMinutes(value);
    if (parsed != null && parsed > 0) return parsed;
  }
  return null;
}

function buildAnalysisContext(context: unknown) {
  if (!context || typeof context !== "object") return "";
  const ctx = context as Record<string, unknown>;
  const latestPain = readPainSummary(ctx.latestPain);
  const recentMaxPain = readPainSummary(ctx.recentMaxPain);
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
  if (latestPain) {
    if (latestPain.hasResolvedPain) {
      lines.push(`latestPain/resolved: ${latestPain.painLocation} marked resolved on ${latestPain.resolvedAt ?? latestPain.date ?? "unknown"}. Do not describe it as active injury.`);
    } else {
      lines.push(`latestPain/current: ${latestPain.painLocation} ${latestPain.painLevel}/10 on ${latestPain.date ?? "unknown"}`);
    }
    if (recentMaxPain && recentMaxPain.painLevel > latestPain.painLevel) {
      lines.push(`recentMaxPain/safety only: ${recentMaxPain.painLocation} ${recentMaxPain.painLevel}/10 on ${recentMaxPain.date ?? "unknown"}`);
    }
    lines.push("Sleep advice rule: use latestPain as current pain. recentMaxPain is history only. Easy Run must be conditional when any latest pain exists.");
  }
  return lines.join("\n");
}

function polishSleepAnalysis(data: SleepAnalysis, input: { context: unknown; profile: unknown }): SleepAnalysis {
  const readinessScore = roundNullable(data.coach.readinessScore) ?? fallback.coach.readinessScore;
  const latestPain = readPainSummary(readRecord(input.context)?.latestPain);
  const recentMaxPain = readPainSummary(readRecord(input.context)?.recentMaxPain);
  const hrCap = readHrCap(input.profile);

  const polished: SleepAnalysis = {
    ...data,
    extracted: {
      ...data.extracted,
      sleepScore: roundNullable(data.extracted.sleepScore),
      energyScore: roundNullable(data.extracted.energyScore),
    },
    coach: {
      ...data.coach,
      readinessScore,
      aiSummary: polishSleepInsightText(data.coach.aiSummary),
      todayRecommendation: polishSleepInsightText(data.coach.todayRecommendation),
      nutritionFocus: polishSleepInsightText(data.coach.nutritionFocus),
      recoveryFocus: polishSleepInsightText(data.coach.recoveryFocus),
      sleepFocus: polishSleepInsightText(data.coach.sleepFocus),
      warningNotes: polishSleepInsightText(data.coach.warningNotes),
    },
  };

  polished.coach.todayRecommendation = buildInjuryAwareSleepRecommendation({
    current: polished.coach.todayRecommendation,
    latestPain,
    recentMaxPain,
    hrCap,
  });

  return polished;
}

function buildInjuryAwareSleepRecommendation(input: {
  current: string;
  latestPain: PainContext | null;
  recentMaxPain: PainContext | null;
  hrCap: number | null;
}): string {
  const current = cleanTargetText(input.current);
  const latest = input.latestPain;
  if (!latest) return current;

  const hrText = input.hrCap
    ? `โดยคุม HR ไม่เกิน ${input.hrCap} bpm`
    : "โดยวิ่งแบบคุยได้สบาย ไม่เร่ง pace";
  const recentHistory = input.recentMaxPain && input.recentMaxPain.painLevel >= 3 && input.recentMaxPain.painLevel > latest.painLevel
    ? `แม้ล่าสุดเจ็บ${latest.painLocation}แค่ ${latest.painLevel}/10 แต่ช่วงไม่กี่วันที่ผ่านมาเคยขึ้นถึง ${input.recentMaxPain.painLevel}/10 จึงควรคุมโหลดไว้ก่อน `
    : "";

  if (latest.hasResolvedPain) {
    return input.recentMaxPain && input.recentMaxPain.painLevel >= 3 && input.recentMaxPain.painLevel > latest.painLevel
      ? `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว แต่ช่วงไม่กี่วันที่ผ่านมาเคยมีอาการถึง ${input.recentMaxPain.painLevel}/10 วันนี้ค่อย ๆ เพิ่มโหลดกลับได้แบบ conservative เริ่มจากเดิน/วอร์มอัปให้ไม่เจ็บก่อน และหลีกเลี่ยงซ้อมหนักทันทีครับ`
      : `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว ถ้าเดินและวอร์มอัปไม่เจ็บ ค่อย ๆ กลับเข้า easy movement ได้ แต่หยุดถ้าอาการกลับมาครับ`;
  }

  if (latest.painLevel <= 1) {
    return `${recentHistory}ถ้าเดินแล้วไม่เจ็บและวอร์มอัปแล้วอาการไม่เพิ่ม ค่อยวิ่ง Easy Run เบา ๆ ได้ ${hrText} ถ้าเริ่มเจ็บ ให้เปลี่ยนเป็น Active Recovery หรือพักครับ`;
  }
  if (latest.painLevel === 2) {
    return `${recentHistory}วันนี้เน้น Recovery / เดินเบา ๆ / mobility ก่อน ถ้าจะวิ่งให้เป็น Easy Run สั้นมากเฉพาะตอนเดินและวอร์มอัปแล้วไม่เจ็บ ${hrText}`;
  }
  if (latest.painLevel >= 3) {
    return `วันนี้ Readiness อาจพอใช้ได้ แต่ล่าสุดยังเจ็บ${latest.painLocation} ${latest.painLevel}/10 แนะนำ Recovery / เดินเบา ๆ / mobility ก่อน ยังไม่ควร Easy Run เป็นแผนหลัก ถ้าอาการดีขึ้นต่อเนื่องและเดินไม่เจ็บ ค่อยกลับไปวิ่งเบา ๆ วันถัดไปครับ`;
  }
  return current;
}

function cleanTargetText(text: string): string {
  return polishSleepInsightText(text)
    .replace(/\bHR\s*N\/A\b/gi, "ไม่เน้น HR วันนี้")
    .replace(/\bPace\s*N\/A\b/gi, "ไม่ต้องจับ pace")
    .trim();
}

type PainContext = {
  date: string | null;
  painLocation: string;
  painLevel: number;
  hasResolvedPain: boolean;
  resolvedAt: string | null;
};

function readPainSummary(value: unknown): PainContext | null {
  const record = readRecord(value);
  if (!record) return null;
  const painLevel = Number(record.painLevel);
  if (!Number.isFinite(painLevel)) return null;
  return {
    date: typeof record.date === "string" ? record.date : null,
    painLocation: typeof record.painLocation === "string" && record.painLocation.trim() ? record.painLocation.trim() : "อาการเจ็บ",
    painLevel: Math.round(painLevel),
    hasResolvedPain: Boolean(record.hasResolvedPain || record.resolved || record.status === "resolved"),
    resolvedAt: typeof record.resolvedAt === "string" ? record.resolvedAt : null,
  };
}

function readHrCap(profile: unknown): number | null {
  const record = readRecord(profile);
  if (!record) return null;
  const raw = record.easyHrCap ?? record.easy_hr_cap;
  if (typeof raw === "number" && Number.isFinite(raw)) return Math.round(raw);
  if (typeof raw !== "string") return null;
  const match = raw.match(/\d{2,3}/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function roundNullable(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function roundDecimalNullable(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}
