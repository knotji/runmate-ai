// Pure helper — no "use client". Safe for server and client contexts.
import type { LocalHistoryItem } from "@/lib/localHistory";
import { getHistoryItemDateKey } from "@/lib/date";
import { dedupeSleepItems } from "@/lib/sleepDedupe";

export type WeeklyReview = {
  runningKmTotal: number;
  runCount: number;
  strengthCount: number;
  walkCount: number;
  avgSleepHours: number | null;
  sleepNights: number;
  avgReadiness: number | null;
  readinessCount: number;
  mealCount: number;
  painDays: number;
  activePainDays: number;
  resolvedPainCount: number;
  highlights: string[];
  cautions: string[];
  nextFocus: string[];
  // Recovery trend additions
  avgRecoveryScore: number | null;
  loadLevel: "ต่ำ" | "ปานกลาง" | "สูง" | "สูงมาก";
  sleepDebtLevel: "ไม่มี" | "ปานกลาง" | "สูง";
  fuelSupportLevel: "ต่ำ" | "ปานกลาง" | "สูง";
  painStatusText: string;
  recoveryTrendSummaryText: string;
  avgLoadScore: number | null;
  avgSleepScore: number | null;
  avgFuelScore: number | null;
};

function toFinite(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Mirrors getSleepDurationRaw + parseSleepHours from logs/page.tsx.
 *  Returns hours (decimal), or null if no valid duration found. */
function readSleepHoursFromItem(item: LocalHistoryItem): number | null {
  const data = item.data as Record<string, unknown> | null;
  const ext = (data?.extracted ?? data ?? {}) as Record<string, unknown>;
  const sleep = data?.sleep as Record<string, unknown> | undefined;
  const candidates = [
    ext.actualSleepDurationMinutes,
    ext.sleepDuration,
    ext.duration,
    data?.sleepDurationHours,
    data?.sleepDurationMinutes,
    data?.totalSleepMinutes,
    sleep?.duration,
    sleep?.sleepDuration,
    sleep?.totalSleepMinutes,
    ext.durationMinutes,
  ];
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      // If the value is > 24 it is in minutes; otherwise treat as hours
      return c > 24 ? c / 60 : c;
    }
    if (typeof c === "string" && c.trim()) {
      const colonMatch = c.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
      if (colonMatch) return Number(colonMatch[1]) + Number(colonMatch[2]) / 60;
      const n = toFinite(c);
      if (n != null && n > 0) return n > 24 ? n / 60 : n;
    }
  }
  return null;
}

export function buildWeeklyReview(items: LocalHistoryItem[], todayDateKey: string): WeeklyReview {
  // Build the 7-day window [cutoff, todayDateKey]
  const cutoffMs = Date.parse(`${todayDateKey}T00:00:00+07:00`) - 6 * 86_400_000;
  const cutoffDate = new Date(cutoffMs).toISOString().slice(0, 10);

  const window = items.filter((i) => {
    const dk = getHistoryItemDateKey(i);
    return dk >= cutoffDate && dk <= todayDateKey;
  });

  // ─── Running ──────────────────────────────────────────────────────────────
  const runItems = window.filter((i) => {
    if (i.type !== "workout") return false;
    const d = i.data as Record<string, unknown> | null;
    if (!d) return false;
    const ext = (d.extracted ?? d) as Record<string, unknown>;
    const kind = ext.workoutKind as string | undefined;
    return kind === "outdoor_run" || kind === "treadmill" || kind === "run";
  });
  let runningKmTotal = 0;
  for (const item of runItems) {
    const d = item.data as Record<string, unknown> | null;
    const ext = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    const km = toFinite(ext.distanceKm);
    if (km != null) runningKmTotal += km;
  }
  const runCount = new Set(runItems.map((i) => getHistoryItemDateKey(i))).size;

  // ─── Strength ─────────────────────────────────────────────────────────────
  const strengthItems = window.filter((i) => {
    if (i.type === "strength") return true;
    if (i.type === "workout") {
      const d = i.data as Record<string, unknown> | null;
      const ext = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
      return ext.workoutKind === "strength";
    }
    return false;
  });
  const strengthCount = new Set(strengthItems.map((i) => getHistoryItemDateKey(i))).size;

  // ─── Walks ────────────────────────────────────────────────────────────────
  const walkItems = window.filter((i) => {
    if (i.type !== "workout") return false;
    const d = i.data as Record<string, unknown> | null;
    const ext = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    return ext.workoutKind === "walk";
  });
  const walkCount = walkItems.length;

  // ─── Sleep ────────────────────────────────────────────────────────────────
  // Dedupe first (one record per night), then use comprehensive field reading
  // to match the same source logic as the 7 Day Overview dashboard.
  const sleepItems = dedupeSleepItems(window.filter((i) => i.type === "sleep"));
  const sleepHours: number[] = [];
  for (const item of sleepItems) {
    const hours = readSleepHoursFromItem(item);
    if (hours != null && hours > 1) sleepHours.push(hours);
  }
  const avgSleepHours = sleepHours.length > 0
    ? Math.round((sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length) * 10) / 10
    : null;
  const sleepNights = sleepHours.length;

  // ─── Readiness ────────────────────────────────────────────────────────────
  // Read from coach.readinessScore (same source as 7 Day Overview buildDashboard),
  // falling back to extracted fields for legacy records.
  const readinessVals: number[] = [];
  for (const item of sleepItems) {
    const d = item.data as Record<string, unknown> | null;
    const coach = d?.coach as Record<string, unknown> | undefined;
    const extracted = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    const r = toFinite(coach?.readinessScore) ?? toFinite(extracted.readiness) ?? toFinite(extracted.readinessScore);
    if (r != null && r > 0) readinessVals.push(r);
  }
  const readinessCount = readinessVals.length;
  const avgReadiness = readinessCount > 0
    ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessCount)
    : null;

  // ─── Meals ────────────────────────────────────────────────────────────────
  const mealCount = window.filter((i) => i.type === "meal").length;

  // ─── Pain ─────────────────────────────────────────────────────────────────
  const painItems = window.filter((i) => i.type === "pain");
  const activePainSet = new Set<string>();
  let resolvedPainCount = 0;
  for (const item of painItems) {
    const d = item.data as Record<string, unknown> | null;
    const status = d?.status as string | undefined;
    const isResolved = status === "resolved" || (d?.resolvedAt as string | undefined);
    if (isResolved) {
      resolvedPainCount++;
    } else {
      activePainSet.add(getHistoryItemDateKey(item));
    }
  }
  const painDays = new Set(painItems.map((i) => getHistoryItemDateKey(i))).size;
  const activePainDays = activePainSet.size;

  // ─── Readiness label ──────────────────────────────────────────────────────
  function readinessLabel(score: number | null): string {
    if (score == null) return "–";
    if (score >= 80) return "Excellent";
    if (score >= 66) return "Good";
    if (score >= 50) return "Fair";
    return "Low";
  }

  // ─── Highlights ───────────────────────────────────────────────────────────
  const highlights: string[] = [];
  if (runCount >= 3) highlights.push(`ซ้อมสม่ำเสมอ ${runCount} ครั้งใน 7 วัน`);
  if (runningKmTotal >= 20) highlights.push(`วิ่งรวม ${Math.round(runningKmTotal * 10) / 10} km สัปดาห์นี้`);
  if (strengthCount >= 2) highlights.push(`เวท ${strengthCount} ครั้ง — ดูแลกล้ามเนื้อดี`);
  if (avgSleepHours != null && avgSleepHours >= 7) highlights.push(`นอนเฉลี่ย ${avgSleepHours} ชม. — พักผ่อนเพียงพอ`);
  if (avgReadiness != null && avgReadiness >= 70) highlights.push(`Readiness เฉลี่ย ${readinessLabel(avgReadiness)}`);
  if (resolvedPainCount > 0 && activePainDays === 0) highlights.push("อาการเจ็บหายแล้ว — กลับมาซ้อมได้");
  if (mealCount >= 10) highlights.push(`บันทึกอาหาร ${mealCount} มื้อ`);
  if (highlights.length === 0 && (runCount > 0 || strengthCount > 0)) {
    highlights.push("มีการเคลื่อนไหวสัปดาห์นี้");
  }

  // ─── Cautions ─────────────────────────────────────────────────────────────
  const cautions: string[] = [];
  if (avgSleepHours != null && avgSleepHours < 6) cautions.push(`นอนน้อยเฉลี่ย ${avgSleepHours} ชม. — ควรเพิ่มเวลานอน`);
  if (activePainDays > 0) cautions.push(`มีอาการเจ็บ ${activePainDays} วัน — ควรระวังในการซ้อม`);
  if (avgReadiness != null && avgReadiness < 50) cautions.push("Readiness เฉลี่ยต่ำ — ร่างกายยังฟื้นตัวไม่เต็ม");
  if (runCount >= 5 && avgSleepHours != null && avgSleepHours < 6.5) {
    cautions.push("ซ้อมหนักแต่นอนน้อย — ความเสี่ยง overtraining สูงขึ้น");
  }
  if (runningKmTotal > 60) cautions.push(`โหลดสูงมาก ${Math.round(runningKmTotal)} km — พักให้พอ`);

  // ─── Next focus ───────────────────────────────────────────────────────────
  const nextFocus: string[] = [];
  if (avgSleepHours != null && avgSleepHours < 6.5) nextFocus.push("นอนให้ได้ 7+ ชม. วันพรุ่งนี้");
  if (activePainDays > 0) nextFocus.push("ติดตามอาการเจ็บก่อนเพิ่มโหลด");
  if (runCount > 0 && strengthCount === 0) nextFocus.push("เพิ่ม strength 1 ครั้ง/สัปดาห์เพื่อรักษากล้ามเนื้อ");
  if (mealCount < 7) nextFocus.push("บันทึกอาหารให้สม่ำเสมอเพื่อข้อมูลที่แม่นขึ้น");
  if (runCount === 0 && strengthCount === 0) nextFocus.push("เริ่มจากเดินเบา 20 นาที หรือ easy run สั้น ๆ");
  if (nextFocus.length === 0) nextFocus.push("รักษาความสม่ำเสมอต่ออีกสัปดาห์");

  // Calculate Recovery Trend parameters
  // Longest run in 7-day window
  let longestRun = 0;
  for (const item of runItems) {
    const d = item.data as Record<string, unknown> | null;
    const ext = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    const km = toFinite(ext.distanceKm);
    if (km != null && km > longestRun) longestRun = km;
  }

  let avgLoadScore = 0;
  if (runningKmTotal > 50) avgLoadScore += 40;
  else if (runningKmTotal > 35) avgLoadScore += 30;
  else if (runningKmTotal > 15) avgLoadScore += 20;
  else if (runningKmTotal > 0) avgLoadScore += 10;

  if (runCount >= 5) avgLoadScore += 20;
  else if (runCount >= 3) avgLoadScore += 10;
  else if (runCount > 0) avgLoadScore += 5;

  if (longestRun >= 15) avgLoadScore += 20;
  else if (longestRun >= 8) avgLoadScore += 10;

  if (strengthCount > 0) avgLoadScore += 10;
  avgLoadScore = Math.max(0, Math.min(100, avgLoadScore));

  const sleepScores: number[] = [];
  for (const item of sleepItems) {
    const d = item.data as Record<string, unknown> | null;
    const ext = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    const s = toFinite(ext.sleepScore) ?? toFinite(d?.sleepScore);
    if (s != null && s > 0) sleepScores.push(s);
  }
  const avgSleepScoreVal = sleepScores.length > 0
    ? Math.round(sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length)
    : null;
  const avgSleepScore = avgSleepScoreVal ?? (avgSleepHours != null ? Math.max(30, Math.min(100, Math.round(avgSleepHours * 10))) : null);

  const loadLevel: "ต่ำ" | "ปานกลาง" | "สูง" | "สูงมาก" =
    runningKmTotal > 50 || runCount >= 6 ? "สูงมาก" :
    runningKmTotal > 30 || runCount >= 4 ? "สูง" :
    runningKmTotal > 10 || runCount >= 2 ? "ปานกลาง" : "ต่ำ";

  const sleepDebtLevel: "ไม่มี" | "ปานกลาง" | "สูง" =
    avgSleepHours != null && avgSleepHours < 6 ? "สูง" :
    avgSleepHours != null && avgSleepHours < 7 ? "ปานกลาง" : "ไม่มี";

  const fuelSupportLevel: "ต่ำ" | "ปานกลาง" | "สูง" =
    mealCount >= 14 ? "สูง" :
    mealCount >= 7 ? "ปานกลาง" : "ต่ำ";

  let avgFuelScore = 50;
  if (fuelSupportLevel === "สูง") avgFuelScore = 82;
  else if (fuelSupportLevel === "ปานกลาง") avgFuelScore = 62;
  else avgFuelScore = 42;

  const painStatusText =
    activePainDays > 0 ? `ยังมีอาการเจ็บอยู่ (${activePainDays} วัน)` :
    resolvedPainCount > 0 ? "อาการเจ็บหายแล้ว" : "ไม่มีอาการเจ็บ";

  let recoveryTrendSummaryText = "สัปดาห์นี้ภาพรวมอยู่ในเกณฑ์รักษาสมดุลดี แนะนำซ้อมสม่ำเสมอและทานอาหารโปรตีน+คาร์บให้ถึงเป้าหมายถัดไป";
  if ((loadLevel === "สูง" || loadLevel === "สูงมาก") && sleepDebtLevel !== "ไม่มี") {
    recoveryTrendSummaryText = "สัปดาห์นี้โหลดซ้อมสูง แต่การนอนยังตามไม่ทัน ทำให้ฟื้นตัวได้ไม่เต็มที่ สัปดาห์หน้าควรเน้นคุม Easy Run ให้เบาจริง ๆ และปรับลดระยะ Long Run ลงเพื่อป้องกันการบาดเจ็บ";
  } else if ((loadLevel === "สูง" || loadLevel === "สูงมาก") && sleepDebtLevel === "ไม่มี") {
    recoveryTrendSummaryText = "สัปดาห์นี้ซ้อมได้ดีและพักผ่อนเพียงพอดี ร่างกายรักษาสมดุลได้เยี่ยม สัปดาห์หน้าสามารถคงความเข้มข้นตามแผนหลักต่อได้";
  } else if (activePainDays > 0) {
    recoveryTrendSummaryText = "ยังมีอาการเจ็บค้างสะสมอยู่ในสัปดาห์นี้ ร่างกายต้องการการฟื้นฟู สัปดาห์หน้าควรหลีกเลี่ยงการซ้อมเร่งความเร็วหรือกด Pace";
  }

  return {
    runningKmTotal: Math.round(runningKmTotal * 10) / 10,
    runCount,
    strengthCount,
    walkCount,
    avgSleepHours,
    sleepNights,
    avgReadiness,
    readinessCount,
    mealCount,
    painDays,
    activePainDays,
    resolvedPainCount,
    highlights,
    cautions,
    nextFocus: nextFocus.slice(0, 3),
    // Recovery trend metrics
    avgRecoveryScore: avgReadiness,
    loadLevel,
    sleepDebtLevel,
    fuelSupportLevel,
    painStatusText,
    recoveryTrendSummaryText,
    avgLoadScore,
    avgSleepScore,
    avgFuelScore,
  };
}
