/**
 * Pain recovery status — graduated return-to-training logic.
 *
 * Single source of truth for Today, Coach, and Race pages.
 * Pure functions only; no side effects, no imports from other app modules.
 */

import type { CoachContext } from "./buildCoachContext";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PainRecoveryStatus =
  | "active_pain"    // unresolved active pain exists
  | "recent_pain"    // pain resolved but within last 48 h, or worsened after run
  | "improving"      // 2+ pain-free days, no activity logged yet
  | "cleared_light"  // 2+ pain-free days + easy activity completed pain-free
  | "cleared_normal"; // 5+ pain-free days + 2+ easy runs, or no recent pain history

export type PainRecoveryInput = {
  /** True when the latest pain log is still marked active (unresolved). */
  hasPainToday: boolean;
  /** painLevel (0–10) of the most recent active pain entry; 0 if resolved. */
  painSeverityToday: number;
  /** YYYY-MM-DD of the most recent pain log entry (active or resolved). Null = no pain in 7d window. */
  lastActivePainDate: string | null;
  /** Calendar days elapsed since lastActivePainDate. 999 when no pain history. */
  painFreeDays: number;
  /** Count of workout days with runs logged AFTER lastActivePainDate. */
  easyRunsPainFreeCount: number;
  /** Any workout (run/walk/other) logged after lastActivePainDate. */
  completedEasyActivityPainFree: boolean;
  /** Latest pain started "after_run" or "next_morning", and is recent (<3 d). */
  painWorseAfterRun: boolean;
};

// ── Thai copy ─────────────────────────────────────────────────────────────────

export const PAIN_RECOVERY_COPY: Record<PainRecoveryStatus, string> = {
  active_pain:    "ยังมีอาการเจ็บวันนี้ — ควรเลี่ยงการวิ่งและเช็กอาการก่อน",
  recent_pain:    "เพิ่งมีอาการเจ็บมา — วันนี้กลับมาเบา ๆ ก่อน ยังไม่ควรกด pace",
  improving:      "อาการดีขึ้นแล้ว แต่ยังควรค่อย ๆ กลับมา",
  cleared_light:  "เริ่มกลับมา easy ได้ แต่ยังไม่ใช่วันกด pace",
  cleared_normal: "อาการดูนิ่งขึ้นแล้ว กลับเข้าแผนได้แบบค่อยเป็นค่อยไป",
};

// ── Validator ─────────────────────────────────────────────────────────────────

export function isPainRecoveryStatus(value: unknown): value is PainRecoveryStatus {
  return (
    value === "active_pain" ||
    value === "recent_pain" ||
    value === "improving" ||
    value === "cleared_light" ||
    value === "cleared_normal"
  );
}

// ── Core logic ────────────────────────────────────────────────────────────────

export function getPainRecoveryStatus(input: PainRecoveryInput): PainRecoveryStatus {
  const {
    hasPainToday,
    painSeverityToday,
    lastActivePainDate,
    painFreeDays,
    easyRunsPainFreeCount,
    completedEasyActivityPainFree,
    painWorseAfterRun,
  } = input;

  // No pain history in the 7-day window → nothing to recover from
  if (!lastActivePainDate) return "cleared_normal";

  // Unresolved active pain → stay off training
  if (hasPainToday || painSeverityToday > 0) return "active_pain";

  // Pain worsened after run and still fresh (<3 d) → conservative recent_pain
  if (painWorseAfterRun && painFreeDays < 3) return "recent_pain";

  // Within 48 hours of last pain entry
  if (painFreeDays < 2) return "recent_pain";

  // 5+ pain-free days AND 2+ easy runs without pain recurrence → fully cleared
  if (painFreeDays >= 5 && easyRunsPainFreeCount >= 2) return "cleared_normal";

  // 2+ pain-free days AND some easy activity done pain-free → cleared for light training
  if (painFreeDays >= 2 && completedEasyActivityPainFree) return "cleared_light";

  // 2+ pain-free days but no activity yet → still improving
  if (painFreeDays >= 2) return "improving";

  return "recent_pain";
}

// ── Derivation from CoachContext ───────────────────────────────────────────────

export function derivePainRecoveryInput(
  ctx: Pick<CoachContext, "activePain" | "latestPain" | "recentPainLogs" | "workouts7d" | "todayDate">,
): PainRecoveryInput {
  const today = ctx.todayDate; // YYYY-MM-DD Bangkok

  // Active unresolved pain = latestPain.hasActivePain is true
  const hasPainToday = ctx.activePain;
  const painSeverityToday = hasPainToday ? (ctx.latestPain?.painLevel ?? 0) : 0;

  // Most recent pain entry (sorted most-recent-first by buildCoachContext)
  const lastActivePainDate = ctx.recentPainLogs[0]?.date ?? null;

  // Days between last pain log and today (0 = logged today, 1 = yesterday …)
  const painFreeDays = lastActivePainDate
    ? Math.max(
        0,
        Math.floor(
          (new Date(`${today}T12:00:00+07:00`).getTime() -
            new Date(`${lastActivePainDate}T12:00:00+07:00`).getTime()) /
            86_400_000,
        ),
      )
    : 999;

  // Workout days with any run logged AFTER last pain date
  const easyRunsPainFreeCount = lastActivePainDate
    ? ctx.workouts7d.filter((w) => w.date > lastActivePainDate && w.runs.length > 0).length
    : 0;

  // Any workout (run/walk/other) logged AFTER last pain date
  const completedEasyActivityPainFree = lastActivePainDate
    ? ctx.workouts7d.some(
        (w) =>
          w.date > lastActivePainDate &&
          (w.runs.length > 0 || w.walks.length > 0 || w.other.length > 0),
      )
    : false;

  // Pain that came on after activity (indicates activity made it worse)
  const latestStartedWhen = (ctx.latestPain as { startedWhen?: string } | null)?.startedWhen;
  const painWorseAfterRun =
    (latestStartedWhen === "after_run" || latestStartedWhen === "next_morning") &&
    painFreeDays < 3;

  return {
    hasPainToday,
    painSeverityToday,
    lastActivePainDate,
    painFreeDays,
    easyRunsPainFreeCount,
    completedEasyActivityPainFree,
    painWorseAfterRun,
  };
}
