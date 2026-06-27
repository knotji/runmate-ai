// Pure, server-safe progressive readiness calculator.
// No "use client". No React imports. Safe to call from API routes and client components alike.

import type { CoachContext, PainSummary, WeekSleepRow } from "@/lib/buildCoachContext";

// ─── Input ────────────────────────────────────────────────────────────────────

export type ReadinessV2Input = {
  // Sleep / Recovery (drives 45% of score)
  sleepScore: number | null;
  sleepDurationMin: number | null;
  hrv: number | null;
  restingHR: number | null;
  avgHRV7d: number | null;        // rolling 7-day average across sleep7d rows
  avgRestingHR7d: number | null;  // rolling 7-day average
  hasSleepToday: boolean;

  // Training Load (drives 25% of score)
  totalRunKm7d: number;
  runDays7d: number;
  longestRun7dKm: number | null;
  hasWorkoutToday: boolean;
  todayWorkoutKind: "run" | "walk" | "strength" | "cycling" | "race" | "other" | null;
  todayWorkoutKm: number | null;
  hasWorkoutData7d: boolean;

  // Nutrition Support (drives 15% of score)
  mealsToday: number;
  proteinStatus: "low" | "ok" | "high" | "unknown" | null;
  carbStatus: "low" | "ok" | "high" | "unknown" | null;
  hasMealData: boolean;

  // Pain Safety (drives 15% of score; can cap total score)
  activePain: boolean;
  latestPainLevel: number | null;  // 1–10 scale from PainSummary
  painHasRedFlag: boolean;
};

// ─── Result ───────────────────────────────────────────────────────────────────

export type ReadinessV2ComponentScore = {
  rawScore: number;   // 0–100 before weighting
  weight: number;     // fraction of total (e.g. 0.45)
  weighted: number;   // rawScore * weight
};

export type ReadinessV2Result = {
  score: number;      // 0–100 final score (integer)
  label: "Low" | "Fair" | "Good" | "Excellent";
  level: "red" | "yellow" | "green";
  components: {
    sleep: ReadinessV2ComponentScore;
    trainingLoad: ReadinessV2ComponentScore;
    nutrition: ReadinessV2ComponentScore;
    painSafety: ReadinessV2ComponentScore;
  };
  cap: number | null;             // pain-driven cap that was applied (null if none)
  usedDataLabels: string[];       // data sources that contributed to this score
  missingDataLabels: string[];    // data sources that were absent
  confidence: "low" | "medium" | "high";
  readinessNote: string;          // short Thai text for display
};

// ─── Weights ──────────────────────────────────────────────────────────────────

const W_SLEEP = 0.45;
const W_LOAD  = 0.25;
const W_NUTRI = 0.15;
const W_PAIN  = 0.15;

// ─── Scoring Helpers ──────────────────────────────────────────────────────────

function scoreSleep(input: ReadinessV2Input, used: string[], missing: string[]): number {
  const { sleepScore, sleepDurationMin, hrv, restingHR, avgHRV7d, avgRestingHR7d, hasSleepToday } = input;

  if (sleepScore == null && sleepDurationMin == null && hrv == null && restingHR == null) {
    missing.push("ข้อมูลการนอน", "ระยะเวลานอน", "HRV", "ชีพจรขณะพัก");
    return 65; // neutral fallback
  }

  let score = sleepScore ?? 65;
  if (sleepScore != null) {
    used.push(`คะแนนการนอน ${sleepScore}`);
  } else {
    missing.push("คะแนนการนอน");
  }

  // Duration penalty
  if (sleepDurationMin != null) {
    used.push(`ระยะเวลานอน ${Math.round(sleepDurationMin / 60 * 10) / 10} ชม.`);
    if (sleepDurationMin < 300) score -= 20;       // < 5h
    else if (sleepDurationMin < 360) score -= 12;  // < 6h
    else if (sleepDurationMin < 420) score -= 5;   // < 7h
  } else {
    missing.push("ระยะเวลานอน");
  }

  // HRV delta vs 7-day average
  if (hrv != null && avgHRV7d != null) {
    const delta = hrv - avgHRV7d;
    used.push(`HRV ${hrv} ms`);
    if (delta < -10) score -= 15;
    else if (delta < -4) score -= 8;
    else if (delta > 10) score += 5;
  } else if (hrv != null) {
    used.push(`HRV ${hrv} ms`);
  } else {
    missing.push("HRV");
  }

  // Resting HR delta vs 7-day average
  if (restingHR != null && avgRestingHR7d != null) {
    const delta = restingHR - avgRestingHR7d;
    used.push(`ชีพจรพัก ${restingHR} bpm`);
    if (delta > 10) score -= 20;
    else if (delta > 5) score -= 12;
    else if (delta > 2) score -= 5;
  } else if (restingHR != null) {
    used.push(`ชีพจรพัก ${restingHR} bpm`);
  } else {
    missing.push("ชีพจรขณะพัก");
  }

  if (!hasSleepToday && sleepScore != null) {
    // using yesterday's sleep — slight staleness penalty
    score -= 3;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreTrainingLoad(input: ReadinessV2Input, used: string[], missing: string[]): number {
  const { totalRunKm7d, runDays7d, longestRun7dKm, hasWorkoutToday, todayWorkoutKind, todayWorkoutKm, hasWorkoutData7d } = input;

  if (!hasWorkoutData7d && !hasWorkoutToday) {
    missing.push("ข้อมูลการซ้อม 7 วัน");
    return 70; // neutral — no data means we can't tell if overloaded
  }

  let score = 70;
  used.push(`วิ่งสะสม ${Math.round(totalRunKm7d * 10) / 10} km / 7 วัน`);

  // Weekly volume
  if (totalRunKm7d > 70) score -= 20;
  else if (totalRunKm7d > 50) score -= 12;
  else if (totalRunKm7d > 35) score -= 5;
  else if (totalRunKm7d < 10 && runDays7d === 0) score += 5;

  // Longest run fatigue
  if (longestRun7dKm != null) {
    if (longestRun7dKm > 25) score -= 10;
    else if (longestRun7dKm > 20) score -= 6;
    else if (longestRun7dKm > 16) score -= 3;
  }

  // Run frequency fatigue
  if (runDays7d >= 6) score -= 10;
  else if (runDays7d >= 5) score -= 5;

  // Today's workout (already completed = body needs recovery)
  if (hasWorkoutToday && todayWorkoutKind != null) {
    used.push(`ซ้อมวันนี้ (${todayWorkoutKind})`);
    if (todayWorkoutKind === "race") {
      score -= 20;
    } else if (todayWorkoutKind === "run") {
      const km = todayWorkoutKm ?? 0;
      score -= km > 10 ? 12 : 6;
    } else if (todayWorkoutKind === "strength") {
      score -= 5;
    } else {
      score -= 3;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function scoreNutrition(input: ReadinessV2Input, used: string[], missing: string[]): number {
  const { mealsToday, proteinStatus, carbStatus, hasMealData } = input;

  if (!hasMealData) {
    missing.push("ข้อมูลมื้ออาหารวันนี้");
    return 65; // neutral fallback
  }

  used.push(`อาหาร ${mealsToday} มื้อ`);

  let score: number;
  if (mealsToday === 0) score = 45;
  else if (mealsToday === 1) score = 55;
  else if (mealsToday === 2) score = 65;
  else score = 75;

  if (proteinStatus === "ok" || proteinStatus === "high") {
    score += 8;
    used.push("โปรตีนเพียงพอ");
  } else if (proteinStatus === "low") {
    score -= 5;
    used.push("โปรตีนน้อย");
  } else {
    missing.push("ข้อมูลโปรตีน");
  }

  if (carbStatus === "ok" || carbStatus === "high") {
    score += 5;
    used.push("คาร์บเพียงพอ");
  } else if (carbStatus === "low") {
    score -= 3;
    used.push("คาร์บน้อย");
  } else {
    missing.push("ข้อมูลคาร์บ");
  }

  return Math.max(0, Math.min(100, score));
}

function scorePainSafety(input: ReadinessV2Input, used: string[]): number {
  const { activePain, latestPainLevel, painHasRedFlag } = input;

  if (!activePain) {
    used.push("ไม่มีอาการเจ็บ");
    return 100;
  }

  used.push(`อาการเจ็บ ${latestPainLevel ?? "?"}/10`);

  if (painHasRedFlag || (latestPainLevel != null && latestPainLevel >= 7)) return 10;
  if (latestPainLevel != null && latestPainLevel >= 4) return 30;
  if (latestPainLevel != null && latestPainLevel >= 2) return 55;
  return 80; // pain level 1
}

/** Canonical RunMate readiness label mapping. Use this everywhere a RunMate readiness
 *  score is displayed — never trust raw AI-returned label strings. */
export function getRunMateReadinessLabel(score: number): "Low" | "Fair" | "Good" | "Excellent" {
  if (score >= 80) return "Excellent";
  if (score >= 66) return "Good";
  if (score >= 50) return "Fair";
  return "Low";
}

function labelFromScore(score: number): ReadinessV2Result["label"] {
  return getRunMateReadinessLabel(score);
}

function levelFromLabel(label: ReadinessV2Result["label"]): ReadinessV2Result["level"] {
  if (label === "Low") return "red";
  if (label === "Fair") return "yellow";
  return "green";
}

function readinessNoteFromScore(score: number, cap: number | null): string {
  if (cap != null) return "ระบบลดคะแนนเพราะมีอาการเจ็บปวดอยู่";
  if (score >= 80) return "ร่างกายพร้อมวันนี้";
  if (score >= 66) return "พร้อมซ้อมตามแผน";
  if (score >= 50) return "ควรลดโหลดเล็กน้อยวันนี้";
  return "ร่างกายล้า แนะนำพักฟื้น";
}

// ─── Main Calculator ───────────────────────────────────────────────────────────

export function calculateRunMateReadiness(input: ReadinessV2Input): ReadinessV2Result {
  const used: string[] = [];
  const missing: string[] = [];

  const sleepRaw    = scoreSleep(input, used, missing);
  const loadRaw     = scoreTrainingLoad(input, used, missing);
  const nutriRaw    = scoreNutrition(input, used, missing);
  const painRaw     = scorePainSafety(input, used);

  const weighted =
    sleepRaw * W_SLEEP +
    loadRaw  * W_LOAD  +
    nutriRaw * W_NUTRI +
    painRaw  * W_PAIN;

  // Pain-safety caps
  let cap: number | null = null;
  if (input.activePain && input.latestPainLevel != null) {
    if (input.latestPainLevel >= 4 || input.painHasRedFlag) cap = 45;
    else if (input.latestPainLevel >= 2) cap = 60;
  }

  const rawFinal = cap != null ? Math.min(weighted, cap) : weighted;
  const score    = Math.max(0, Math.min(100, Math.round(rawFinal)));
  const label    = labelFromScore(score);
  const level    = levelFromLabel(label);

  // Confidence
  const hasSleep   = input.sleepScore != null || input.sleepDurationMin != null;
  const hasLoad    = input.hasWorkoutData7d || input.hasWorkoutToday;
  const hasMeals   = input.hasMealData;
  const confidence: ReadinessV2Result["confidence"] =
    hasSleep && (hasLoad || hasMeals) ? "high" :
    hasSleep || hasLoad               ? "medium" :
    "low";

  return {
    score,
    label,
    level,
    components: {
      sleep:        { rawScore: sleepRaw,    weight: W_SLEEP, weighted: Math.round(sleepRaw * W_SLEEP * 10) / 10 },
      trainingLoad: { rawScore: loadRaw,     weight: W_LOAD,  weighted: Math.round(loadRaw  * W_LOAD  * 10) / 10 },
      nutrition:    { rawScore: nutriRaw,    weight: W_NUTRI, weighted: Math.round(nutriRaw * W_NUTRI * 10) / 10 },
      painSafety:   { rawScore: painRaw,     weight: W_PAIN,  weighted: Math.round(painRaw  * W_PAIN  * 10) / 10 },
    },
    cap,
    usedDataLabels:    [...new Set(used)],
    missingDataLabels: [...new Set(missing)],
    confidence,
    readinessNote: readinessNoteFromScore(score, cap),
  };
}

// ─── CoachContext → Input mapper ──────────────────────────────────────────────

function isPainRedFlag(pain: PainSummary): boolean {
  return (
    pain.swellingOrRedness === "yes" ||
    pain.canBearWeight === "no" ||
    pain.redFlags.length > 0 ||
    pain.painType.some((t) => /sharp|numb|แปลบ|ชา/i.test(t))
  );
}

function avgOf(rows: WeekSleepRow[], key: "hrv" | "restingHR"): number | null {
  const vals = rows.map((r) => r[key]).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function coachContextToReadinessV2Input(ctx: CoachContext): ReadinessV2Input {
  const sleep7d = ctx.sleep7d;
  const latestSleep: WeekSleepRow | undefined = sleep7d[0];
  const hasSleepToday = Boolean(latestSleep && latestSleep.date === ctx.todayDate);

  const avgHRV7d       = avgOf(sleep7d, "hrv");
  const avgRestingHR7d = avgOf(sleep7d, "restingHR");

  const todayWorkout = ctx.todayPrimaryWorkout;
  const nutritionBalance = ctx.nutritionBalanceToday;

  return {
    sleepScore:       latestSleep?.score ?? null,
    sleepDurationMin: latestSleep?.durationMinutes ?? null,
    hrv:              latestSleep?.hrv ?? null,
    restingHR:        latestSleep?.restingHR ?? null,
    avgHRV7d,
    avgRestingHR7d,
    hasSleepToday,

    totalRunKm7d:    ctx.totalRunKm,
    runDays7d:       ctx.runDays7d,
    longestRun7dKm:  ctx.longestRun7dKm,
    hasWorkoutToday: ctx.hasWorkoutToday,
    todayWorkoutKind: todayWorkout?.kind ?? null,
    todayWorkoutKm:   todayWorkout?.distanceKm ?? null,
    hasWorkoutData7d: ctx.workouts7d.length > 0,

    mealsToday:    ctx.mealsToday.length,
    proteinStatus: (nutritionBalance?.proteinStatus as ReadinessV2Input["proteinStatus"]) ?? null,
    carbStatus:    (nutritionBalance?.carbStatus as ReadinessV2Input["carbStatus"]) ?? null,
    hasMealData:   ctx.mealsToday.length > 0,

    activePain:      ctx.activePain,
    latestPainLevel: ctx.latestPain?.painLevel ?? null,
    painHasRedFlag:  ctx.latestPain ? isPainRedFlag(ctx.latestPain) : false,
  };
}
