// Pure function — no React, no Supabase. Safe to import anywhere.
import { GOAL_LABEL_TH, BODY_GOALS, RACE_GOALS } from "@/lib/goals/goalTypes";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";
import type { WeeklyReview } from "@/lib/weeklyReview";

export type GoalProgressInsight = {
  label: string;
  summaryTh: string;
  tone: "positive" | "neutral" | "caution";
};

export function buildGoalProgressInsight(
  goalProfile: UserGoalProfile,
  review: WeeklyReview,
): GoalProgressInsight | null {
  const { primaryGoal } = goalProfile;
  const { runCount, runningKmTotal, strengthCount, sleepNights, avgSleepHours, activePainDays, loadLevel, sleepDebtLevel } = review;

  const hasEnoughData = runCount > 0 || sleepNights > 0 || strengthCount > 0;
  if (!hasEnoughData) return null;

  const goalLabel = GOAL_LABEL_TH[primaryGoal] ?? primaryGoal;

  // Pain always takes priority
  if (activePainDays >= 3) {
    return {
      label: goalLabel,
      summaryTh: `มีอาการเจ็บ ${activePainDays} วัน — สัปดาห์นี้ต้องให้ฟื้นตัวก่อนเป้าหมาย${goalLabel}`,
      tone: "caution",
    };
  }

  // Race performance goal
  if (RACE_GOALS.includes(primaryGoal)) {
    const kmStr = runningKmTotal > 0 ? `${Math.round(runningKmTotal * 10) / 10} กม. (${runCount} ครั้ง)` : null;
    if (loadLevel === "สูงมาก") {
      return {
        label: goalLabel,
        summaryTh: `${kmStr ? `วิ่ง ${kmStr} — ` : ""}โหลดสัปดาห์นี้สูงมาก ควรมีวัน easy หรือ cutback สัปดาห์หน้า`,
        tone: "caution",
      };
    }
    if (runCount === 0) {
      return {
        label: goalLabel,
        summaryTh: "สัปดาห์นี้ยังไม่มีข้อมูลการวิ่ง — อัปเดต Report เพื่อติดตามความคืบหน้า",
        tone: "neutral",
      };
    }
    return {
      label: goalLabel,
      summaryTh: `วิ่ง ${kmStr} — สม่ำเสมอดี ทำต่อตาม race plan`,
      tone: runCount >= 3 ? "positive" : "neutral",
    };
  }

  // Running consistency goal
  if (primaryGoal === "running_consistency") {
    if (runCount >= 3) {
      return {
        label: goalLabel,
        summaryTh: `วิ่ง ${runCount} ครั้ง ${Math.round(runningKmTotal * 10) / 10} กม. — สม่ำเสมอดี เป้าหมายนี้กำลังไปได้ดี`,
        tone: "positive",
      };
    }
    if (runCount > 0) {
      return {
        label: goalLabel,
        summaryTh: `วิ่ง ${runCount} ครั้ง ${Math.round(runningKmTotal * 10) / 10} กม. — เพิ่มความสม่ำเสมอได้อีก เล็งไว้ 3-4 ครั้ง/สัปดาห์`,
        tone: "neutral",
      };
    }
    return {
      label: goalLabel,
      summaryTh: "สัปดาห์นี้ยังไม่มีข้อมูลการวิ่ง — เริ่มเลยเพื่อสะสมความสม่ำเสมอ",
      tone: "neutral",
    };
  }

  // Body goals (fat_loss, six_pack, muscle_gain)
  if (BODY_GOALS.includes(primaryGoal)) {
    const parts: string[] = [];
    if (runCount > 0) parts.push(`วิ่ง ${runCount} ครั้ง`);
    if (strengthCount > 0) parts.push(`เวท ${strengthCount} ครั้ง`);

    if (sleepDebtLevel === "สูง" || (avgSleepHours !== null && avgSleepHours < 6)) {
      return {
        label: goalLabel,
        summaryTh: `${parts.length ? parts.join(" · ") + " — " : ""}การนอนน้อยไปขัดผลของ ${goalLabel} — นอนให้ครบ 7-8 ชม. ช่วยได้มาก`,
        tone: "caution",
      };
    }
    if (parts.length === 0) {
      return {
        label: goalLabel,
        summaryTh: `ยังไม่มีข้อมูลซ้อมสัปดาห์นี้ — เพิ่ม run+strength เพื่อขับเคลื่อนเป้าหมาย${goalLabel}`,
        tone: "neutral",
      };
    }
    return {
      label: goalLabel,
      summaryTh: `${parts.join(" · ")} — ดี สัปดาห์หน้าเพิ่ม strength ถ้า recovery ดี`,
      tone: "positive",
    };
  }

  // Injury recovery / prevention
  if (primaryGoal === "injury_recovery" || primaryGoal === "injury_prevention") {
    if (activePainDays > 0) {
      return {
        label: goalLabel,
        summaryTh: `มีอาการเจ็บ ${activePainDays} วัน — เน้นพัก/กายภาพก่อน ไม่ต้องรีบเพิ่มโหลด`,
        tone: "caution",
      };
    }
    return {
      label: goalLabel,
      summaryTh: activePainDays === 0 && runCount > 0
        ? `ซ้อม ${runCount} ครั้งโดยไม่มีอาการเจ็บ — สัญญาณดีสำหรับ ${goalLabel}`
        : `สัปดาห์นี้ไม่มีอาการเจ็บ — ฟื้นตัวได้ดี`,
      tone: "positive",
    };
  }

  // Sleep / stress goals
  if (primaryGoal === "sleep_better" || primaryGoal === "stress_balance") {
    const sleepOk = sleepNights >= 5 && avgSleepHours !== null && avgSleepHours >= 7;
    if (sleepOk) {
      return {
        label: goalLabel,
        summaryTh: `นอน ${sleepNights} คืน เฉลี่ย ${avgSleepHours?.toFixed(1)} ชม. — ใกล้เคียงเป้าหมาย${goalLabel}`,
        tone: "positive",
      };
    }
    if (sleepDebtLevel === "สูง") {
      return {
        label: goalLabel,
        summaryTh: `การนอนสั้นกว่าเป้า${avgSleepHours !== null ? ` (เฉลี่ย ${avgSleepHours.toFixed(1)} ชม.)` : ""} — ปรับให้ตรงกับเป้าหมาย${goalLabel}`,
        tone: "caution",
      };
    }
    return {
      label: goalLabel,
      summaryTh: `นอน ${sleepNights} คืน — เพิ่มความสม่ำเสมอของการนอนเพื่อเป้าหมาย${goalLabel}`,
      tone: "neutral",
    };
  }

  // General health fallback
  const parts: string[] = [];
  if (runCount > 0) parts.push(`วิ่ง ${runCount} ครั้ง`);
  if (strengthCount > 0) parts.push(`เวท ${strengthCount} ครั้ง`);
  if (sleepNights > 0 && avgSleepHours !== null) parts.push(`นอนเฉลี่ย ${avgSleepHours.toFixed(1)} ชม.`);

  return {
    label: goalLabel,
    summaryTh: parts.length > 0
      ? `${parts.join(" · ")} — ดำเนินไปได้ดีสำหรับเป้าหมาย${goalLabel}`
      : `เริ่มบันทึกข้อมูลเพื่อติดตามความคืบหน้าของเป้าหมาย${goalLabel}`,
    tone: parts.length > 0 ? "positive" : "neutral",
  };
}
