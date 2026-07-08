/**
 * Pure display-formatting helpers for the Report page.
 * All functions are side-effect-free and importable in unit tests.
 */

// ─── Period summary cards ─────────────────────────────────────────────────────

/**
 * Format the total run distance for the selected period summary card.
 * Returns "0 กม." (not "—") so the card never looks broken when a valid period is selected.
 */
export function formatSelectedPeriodRunDistance(distanceKm: number): string {
  if (distanceKm > 0) return `${distanceKm} กม.`;
  return "0 กม.";
}

/**
 * Format the workout-day count for the selected period summary card.
 * Returns "0 วัน" (not "—") when no workout days exist.
 */
export function formatActivityCount(count: number): string {
  if (count > 0) return `${count} วัน`;
  return "0 วัน";
}

// ─── Workout timeline entry ───────────────────────────────────────────────────

export type WorkoutTimelineTitleInput = {
  isSwim: boolean;
  swimLabel?: string;
  distanceM?: number | null;
  distanceKm?: number | null;
  workoutKind?: string | null;
  duration?: string | null;
};

/**
 * Build the one-line title for a workout timeline entry.
 *
 * Swim: always uses metres, never km.
 * Run/other: uses km.
 */
export function formatWorkoutTimelineTitle(input: WorkoutTimelineTitleInput): string {
  const { isSwim, swimLabel, distanceM, distanceKm, workoutKind, duration } = input;

  if (isSwim) {
    const label = swimLabel ?? "ว่ายน้ำ";
    const parts: string[] = [label];
    if (distanceM != null) parts.push(`${distanceM} ม.`);
    if (duration) parts.push(duration);
    return parts.join(" · ");
  }

  const kindLabel =
    workoutKind === "outdoor_run" ? "วิ่งเอาท์ดอร์"
    : workoutKind === "treadmill" ? "วิ่งเทรดมิล"
    : workoutKind === "walk" ? "เดิน"
    : workoutKind === "cycling" ? "ปั่นจักรยาน"
    : workoutKind === "strength" ? "เวท"
    : "ออกกำลังกาย";

  const parts: string[] = [kindLabel];
  if (distanceKm != null) parts.push(`${distanceKm} กม.`);
  if (duration) parts.push(duration);
  return parts.join(" · ");
}

// ─── Daily summary helpers ────────────────────────────────────────────────────

/**
 * Return a short activity-absence label appropriate for a day row.
 * Distinguishes "no workout logged" from "no data at all".
 */
export function getDayWorkoutAbsenceLabel(hasAnyData: boolean): string {
  return hasAnyData ? "ยังไม่มีการซ้อม" : "ยังไม่มีข้อมูล";
}

// ─── Timeline item subtitle ───────────────────────────────────────────────────

export type TimelineItemSubtitleInput = {
  type: string;
  avgHR?: number | null;
  calories?: number | null;
  sleepScore?: number | null;
  proteinG?: number | null;
  caloriesKcal?: number | null;
};

/**
 * Build the secondary subtitle line for a compact timeline item row.
 *
 * workout → "HR N · N kcal"
 * sleep   → "คะแนน N"
 * meal    → "โปรตีน Ng · N kcal"
 * others  → "" (no subtitle)
 */
export function getTimelineItemSubtitle(input: TimelineItemSubtitleInput): string {
  const { type } = input;
  if (type === "workout") {
    const parts: string[] = [];
    if (input.avgHR != null) parts.push(`HR ${Math.round(input.avgHR)}`);
    if (input.calories != null) parts.push(`${Math.round(input.calories)} kcal`);
    return parts.join(" · ");
  }
  if (type === "sleep") {
    return input.sleepScore != null ? `คะแนน ${input.sleepScore}` : "";
  }
  if (type === "meal") {
    const parts: string[] = [];
    if (input.proteinG != null) parts.push(`โปรตีน ${Math.round(input.proteinG)}g`);
    if (input.caloriesKcal != null) parts.push(`${Math.round(input.caloriesKcal)} kcal`);
    return parts.join(" · ");
  }
  return "";
}
