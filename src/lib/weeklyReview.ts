// Pure helper — no "use client". Safe for server and client contexts.
import type { LocalHistoryItem } from "@/lib/localHistory";
import { getHistoryItemDateKey } from "@/lib/date";

export type WeeklyReview = {
  runningKmTotal: number;
  runCount: number;
  strengthCount: number;
  walkCount: number;
  avgSleepHours: number | null;
  avgReadiness: number | null;
  mealCount: number;
  painDays: number;
  activePainDays: number;
  resolvedPainCount: number;
  highlights: string[];
  cautions: string[];
  nextFocus: string[];
};

function toFinite(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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
  const sleepItems = window.filter((i) => i.type === "sleep");
  const sleepHours: number[] = [];
  for (const item of sleepItems) {
    const d = item.data as Record<string, unknown> | null;
    const ext = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    const dur = toFinite(ext.durationMinutes) ?? toFinite(ext.sleepDuration);
    if (dur != null && dur > 60) sleepHours.push(dur / 60);
  }
  const avgSleepHours = sleepHours.length > 0
    ? Math.round((sleepHours.reduce((a, b) => a + b, 0) / sleepHours.length) * 10) / 10
    : null;

  // ─── Readiness ────────────────────────────────────────────────────────────
  const readinessVals: number[] = [];
  for (const item of sleepItems) {
    const d = item.data as Record<string, unknown> | null;
    const extracted = (d?.extracted ?? d ?? {}) as Record<string, unknown>;
    const r = toFinite(extracted.readiness) ?? toFinite(extracted.readinessScore);
    if (r != null) readinessVals.push(r);
  }
  const avgReadiness = readinessVals.length > 0
    ? Math.round(readinessVals.reduce((a, b) => a + b, 0) / readinessVals.length)
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

  return {
    runningKmTotal: Math.round(runningKmTotal * 10) / 10,
    runCount,
    strengthCount,
    walkCount,
    avgSleepHours,
    avgReadiness,
    mealCount,
    painDays,
    activePainDays,
    resolvedPainCount,
    highlights,
    cautions,
    nextFocus: nextFocus.slice(0, 3),
  };
}
