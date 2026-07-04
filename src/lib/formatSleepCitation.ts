import type { WeekSleepRow } from "@/lib/buildCoachContext";

/**
 * Formats a sleep row into a short Thai citation string for use in
 * meal recommendation reasons, e.g. "นอน 6 ชม. 14 นาที · สกอร์ 68 · Recovery 74"
 */
export function formatSleepCitation(sleep: WeekSleepRow): string {
  const parts: string[] = [];
  if (sleep.durationH) {
    parts.push(`นอน ${sleep.durationH}`);
  } else if (sleep.durationMinutes != null && sleep.durationMinutes > 0) {
    const h = Math.floor(sleep.durationMinutes / 60);
    const m = sleep.durationMinutes % 60;
    parts.push(m > 0 ? `นอน ${h} ชม. ${m} นาที` : `นอน ${h} ชม.`);
  }
  if (sleep.score != null) parts.push(`สกอร์ ${sleep.score}`);
  if (sleep.readiness != null) parts.push(`Recovery ${sleep.readiness}`);
  return parts.join(" · ");
}
