// Pure function — no React, no Supabase. Safe to import anywhere.
import type { WeeklyReview } from "@/lib/weeklyReview";

/**
 * Returns a short Thai summary (1–2 lines) of the past 7 days — key insight
 * at a glance. Returns null when there is not enough data to summarize.
 */
export function buildWeeklyInsightSummary(review: WeeklyReview): string | null {
  const {
    runningKmTotal,
    runCount,
    activePainDays,
    loadLevel,
    sleepDebtLevel,
    avgSleepHours,
    sleepNights,
    avgRecoveryScore,
  } = review;

  const hasData = runCount > 0 || sleepNights > 0 || activePainDays > 0;
  if (!hasData) return null;

  const parts: string[] = [];

  // Pain — highest priority signal
  if (activePainDays >= 3) {
    parts.push(`มีอาการเจ็บ ${activePainDays} วันในสัปดาห์นี้ — ให้ความสำคัญกับการฟื้นตัว`);
  } else if (activePainDays > 0) {
    parts.push(`มีอาการเจ็บ ${activePainDays} วัน — ระวังการเพิ่มโหลดเร็วเกินไป`);
  }

  // Training load + km
  if (runCount > 0) {
    const kmStr = `${Math.round(runningKmTotal * 10) / 10} กม.`;
    if (loadLevel === "สูงมาก") {
      parts.push(`วิ่ง ${kmStr} ใน ${runCount} ครั้ง — โหลดสัปดาห์นี้สูงมาก ควรเบาสัปดาห์หน้า`);
    } else if (loadLevel === "สูง") {
      parts.push(`วิ่ง ${kmStr} ใน ${runCount} ครั้ง — โหลดสูง`);
    } else if (loadLevel === "ต่ำ" && activePainDays === 0) {
      parts.push(`วิ่ง ${kmStr} ใน ${runCount} ครั้ง — โหลดเบา ขยับได้สัปดาห์หน้า`);
    } else {
      parts.push(`วิ่ง ${kmStr} ใน ${runCount} ครั้ง`);
    }
  }

  // Sleep
  if (sleepNights >= 4) {
    if (sleepDebtLevel === "สูง" || (avgSleepHours !== null && avgSleepHours < 6)) {
      const hrStr = avgSleepHours !== null ? ` (เฉลี่ย ${avgSleepHours.toFixed(1)} ชม.)` : "";
      parts.push(`การนอนน้อยกว่าเกณฑ์${hrStr} — เพิ่มการนอนช่วยฟื้นตัวมากขึ้น`);
    } else if (sleepDebtLevel === "ไม่มี" && avgSleepHours !== null && avgSleepHours >= 7) {
      // good sleep — only add if no other good news yet
      if (parts.length === 0) {
        parts.push(`การนอนดีสม่ำเสมอ (เฉลี่ย ${avgSleepHours.toFixed(1)} ชม.) — ช่วยให้ฟื้นตัวได้ดี`);
      }
    }
  }

  // Recovery score fallback when little else to say
  if (parts.length === 0 && avgRecoveryScore !== null) {
    if (avgRecoveryScore >= 70) {
      parts.push("ภาพรวมสัปดาห์นี้ร่างกายฟื้นตัวได้ดี");
    } else if (avgRecoveryScore < 50) {
      parts.push("ค่าฟื้นตัวสัปดาห์นี้ต่ำกว่าเกณฑ์ — เน้นพักและนอนให้พอ");
    }
  }

  if (parts.length === 0) return null;
  return parts.join(" · ");
}
