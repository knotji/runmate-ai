// Pure function — no React, no Supabase. Safe to import anywhere.
import type { WeeklyReview } from "@/lib/weeklyReview";

export interface WeeklyNextActionInput {
  review: WeeklyReview;
  /** Number of sick log days this week */
  sickDaysThisWeek?: number;
}

/**
 * Returns a single Thai action line (no label prefix) for "โฟกัสถัดไป:"
 * Priority: sick hard-stop → active pain → high load → sleep debt →
 *           moderate load → low fuel → positive state.
 * Returns null when there is not enough data.
 */
export function buildWeeklyNextAction(input: WeeklyNextActionInput): string | null {
  const { review, sickDaysThisWeek = 0 } = input;

  const hasData =
    review.runCount > 0 ||
    review.sleepNights > 0 ||
    review.activePainDays > 0 ||
    sickDaysThisWeek > 0;
  if (!hasData) return null;

  // 1. Sick this week
  if (sickDaysThisWeek > 0) {
    return "พักก่อนจนกว่าอาการป่วยจะดีขึ้น";
  }

  // 2. Active pain
  if (review.activePainDays >= 2) {
    return "พักและประเมินอาการเจ็บก่อนกลับซ้อม";
  }
  if (review.activePainDays === 1) {
    return "ระวังอาการเจ็บ — ลด impact และประเมินต่อเนื่อง";
  }

  // 3. Very high load
  if (review.loadLevel === "สูงมาก") {
    return "ลดโหลด 1–2 วัน แล้วค่อยกลับเข้าแผน";
  }

  // 4. Sleep debt
  if (
    review.sleepDebtLevel === "สูง" ||
    (review.avgSleepHours !== null && review.avgSleepHours < 6)
  ) {
    return "easy ให้เบาจริง + นอนให้ถึง 7 ชม.";
  }

  // 5. High load (not very high)
  if (review.loadLevel === "สูง") {
    return "คุมโหลดต่อเนื่อง + easy ให้เบาจริง";
  }

  // 6. Low fuel
  if (review.fuelSupportLevel === "ต่ำ") {
    return "เติมโปรตีนให้สม่ำเสมอ + คุม recovery";
  }

  // 7. Positive: low load + decent recovery → can build
  if (
    review.loadLevel === "ต่ำ" &&
    (review.avgRecoveryScore ?? 0) >= 65 &&
    review.activePainDays === 0
  ) {
    return "ขยับโหลดได้ + รักษาคุณภาพการนอน";
  }

  // 8. Moderate/decent: just maintain
  if (
    (review.avgRecoveryScore ?? 0) >= 70 &&
    review.sleepDebtLevel === "ไม่มี"
  ) {
    return "รักษา routine ต่อเนื่อง + ฟังร่างกายก่อนกดหนัก";
  }

  return null;
}
