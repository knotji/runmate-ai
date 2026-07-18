// Pure function — no React, no Supabase, no AI call (deterministic, instant on
// page load — no waiting on a round trip for the first thing a user reads).
//
// Answers exactly what was asked for: "เปิดแอพมาแล้วไม่ต้องอ่านเยอะ" — three
// plain-language sentences instead of a wall of scores:
//   1. เมื่อวานเป็นยังไง (yesterday's sleep/food/training recap)
//   2. คืนนี้ควรนอนกี่โมง (tonight's sleep target, as a clock time — not just
//      a duration — computed from the user's own actual wake-time pattern)
//   3. วันนี้ควรกินแบบไหน (today's food guidance)
//
// Reuses existing scoring/target logic rather than reinventing it —
// recoveryLoop.ts's sleepNeed for how many hours, nutritionTargets.ts's
// buildNutritionTargetSummary for what to eat. This module's only new
// contribution is turning "how many hours" into "what clock time", and
// stitching the three into short sentences.

import type { CoachContext } from "@/lib/buildCoachContext";
import type { UserProfile } from "@/types/profile";
import { buildNutritionTargetSummary, suggestedProteinTargetG } from "@/lib/nutritionTargets";

export type DailyBriefing = {
  hasEnoughData: boolean;
  yesterdaySummary: string;
  sleepTonightSentence: string;
  foodTodaySentence: string;
};

function parseBangkokMinutesOfDay(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

function formatMinutesOfDay(minutesOfDay: number): string {
  const wrapped = ((Math.round(minutesOfDay) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Simple average is enough for wake times — they almost never cross
// midnight, unlike bedtimes, which is exactly why this recommends bedtime
// FROM wake time rather than averaging bedtimes directly.
function averageWakeTimeMinutes(sleep7d: CoachContext["sleep7d"]): number | null {
  const vals = sleep7d
    .map((s) => parseBangkokMinutesOfDay(s.sleepEndTime))
    .filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function buildYesterdaySummary(ctx: CoachContext): { text: string; hasData: boolean } {
  const lastNight = ctx.sleep7d[0] ?? null;
  const nutrition = ctx.nutritionYesterday;
  const workout = ctx.workoutsYesterday;
  const parts: string[] = [];

  if (lastNight?.durationH) {
    parts.push(`นอน ${lastNight.durationH}`);
  }

  if (nutrition?.proteinG != null) {
    const profile = ctx.profile as UserProfile | null;
    const proteinTarget = profile?.proteinTargetG ?? suggestedProteinTargetG(profile?.weightKg) ?? 90;
    const pct = proteinTarget > 0 ? (nutrition.proteinG / proteinTarget) * 100 : null;
    parts.push(
      pct != null && pct < 70
        ? `โปรตีนได้ ${nutrition.proteinG}g (ยังไม่ถึงเป้า)`
        : `โปรตีนได้ ${nutrition.proteinG}g ครบตามเป้า`,
    );
  } else if (nutrition && nutrition.mealCount > 0) {
    parts.push(`บันทึกอาหาร ${nutrition.mealCount} มื้อ`);
  }

  const runKm = workout ? workout.runs.reduce((sum, run) => sum + run.km, 0) : 0;
  if (runKm > 0) {
    parts.push(`วิ่งไป ${Math.round(runKm * 10) / 10} กม.`);
  } else if (workout && (workout.walks.length > 0 || workout.other.length > 0)) {
    parts.push("ออกกำลังกายเบา ๆ");
  } else {
    parts.push("ไม่มีกิจกรรมซ้อม");
  }

  const hasData = Boolean(lastNight || (nutrition && nutrition.mealCount > 0) || workout);
  return {
    text: hasData ? `เมื่อวาน ${parts.join(" · ")}` : "เมื่อวานยังไม่มีข้อมูลบันทึกไว้",
    hasData,
  };
}

function buildSleepTonightSentence(ctx: CoachContext): string {
  const sleepNeed = ctx.recoveryLoop.sleepNeed;
  const usualWakeMin = averageWakeTimeMinutes(ctx.sleep7d);

  if (usualWakeMin == null) {
    // Not enough sleepEndTime history yet to know a wake-time pattern —
    // still give the duration target (already computed by recoveryLoop.ts)
    // rather than nothing.
    return `${sleepNeed.label} — บันทึกเวลานอน/ตื่นต่อเนื่องสักพักแล้วจะแนะนำเวลาเข้านอนที่แน่นอนให้ได้`;
  }

  const bedtimeMin = usualWakeMin - sleepNeed.targetHoursMax * 60;
  const bedtimeText = formatMinutesOfDay(bedtimeMin);
  const wakeTimeText = formatMinutesOfDay(usualWakeMin);
  return `ปกติคุณตื่น ${wakeTimeText} น. — คืนนี้ควรเข้านอนประมาณ ${bedtimeText} น. เพื่อให้ได้นอน ${sleepNeed.targetHoursMin}–${sleepNeed.targetHoursMax} ชม.`;
}

export function buildDailyBriefing(ctx: CoachContext): DailyBriefing {
  const yesterday = buildYesterdaySummary(ctx);
  const sleepTonightSentence = buildSleepTonightSentence(ctx);
  const foodTarget = buildNutritionTargetSummary({ profile: ctx.profile as UserProfile | null, context: ctx });

  return {
    hasEnoughData: yesterday.hasData,
    yesterdaySummary: yesterday.text,
    sleepTonightSentence,
    foodTodaySentence: foodTarget.recoveryFuelNote,
  };
}
