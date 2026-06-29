import { NextResponse } from "next/server";
import { jsonFromAI, type JSONAIResult } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { type CoachContext, type TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";
import { getTodayReadiness, getTodayPlannedWorkout, getReadinessCategoryLabel } from "@/lib/todayPlanning";
import type { DailyCoachInsight } from "@/types/ai";
import type { WeekWorkout } from "@/types/race";
import { todayBangkokDateKey } from "@/lib/date";
import { getCoachCautionFactors } from "@/lib/coachCautionFactors";
import { buildRunMateRecoverySystem, type RunMateRecoverySystem } from "@/lib/recoverySystem";

const FALLBACK: DailyCoachInsight = {
  todayReadiness: 70,
  readinessLabel: "Good",
  readinessNote: "ข้อมูลการนอนไม่พร้อม ประเมินตามความรู้สึกครับ",
  workoutRec: "Easy Run หรือ Recovery",
  workoutTarget: "HR ต่ำกว่า 145, pace สบาย ไม่เร่ง",
  weekSummary: "ยังไม่มีข้อมูลสัปดาห์นี้",
  keyObservation: "-",
  coachMessage: "อัปโหลดข้อมูลการนอนหรือออกกำลังกายเพื่อรับ coaching ที่ personalized ครับ",
};

const TODAY_OUTPUT_CONTRACT = `TODAY INSIGHT OUTPUT CONTRACT:
Return one valid JSON object only. No markdown. No text outside JSON.
Required keys:
{
  "todayReadiness": number,
  "readinessLabel": "Low" | "Fair" | "Good" | "Excellent",
  "readinessNote": string,
  "workoutRec": string,
  "workoutTarget": string,
  "weekSummary": string,
  "keyObservation": string,
  "coachMessage": string
}
Use concise Thai text for mobile. If uncertain, still return best-effort JSON with conservative guidance.`;

export async function POST(request: Request) {
  try {
    const rawContext = await request.json();
    const ctx = normalizeCoachContext(rawContext);
    if (process.env.NODE_ENV === "development") {
      console.info("[today-insight-debug]", {
        hasProfile: Boolean(ctx.profile),
        recentHistoryCount: (ctx.sleep7d?.length ?? 0) + (ctx.workouts7d?.length ?? 0),
        hasActiveRace: Boolean(ctx.raceGoal),
        raceDate: ctx.raceDate ?? null,
        isRaceToday: Boolean(ctx.isRaceToday),
        isRaceTomorrow: Boolean(ctx.isRaceTomorrow),
        hasWorkoutToday: Boolean(ctx.hasWorkoutToday),
        todayPrimaryWorkout: ctx.todayPrimaryWorkout ? {
          kind: ctx.todayPrimaryWorkout.kind,
          distanceKm: ctx.todayPrimaryWorkout.distanceKm,
          durationText: ctx.todayPrimaryWorkout.durationText,
          avgHR: ctx.todayPrimaryWorkout.avgHR,
        } : null,
        latestPain: ctx.latestPain ? { date: ctx.latestPain.date, painLevel: ctx.latestPain.painLevel } : null,
        recentMaxPain: ctx.recentMaxPain ? { date: ctx.recentMaxPain.date, painLevel: ctx.recentMaxPain.painLevel } : null,
      });
    }
    const profileCtx = buildRunnerProfileContext(ctx.profile);
    const system = [SYSTEM_PROMPT, profileCtx, TODAY_OUTPUT_CONTRACT].filter(Boolean).join("\n\n");

    const SERVER_AI_TIMEOUT_MS = 14000;

    const recSys = ctx.recoverySystem;
    const personalizedFallback: DailyCoachInsight = {
      todayReadiness: recSys.overallScore,
      readinessLabel: recSys.overallLabel,
      readinessNote: recSys.headline,
      workoutRec: recSys.coachingState === "recover"
        ? (ctx.latestPain && ctx.latestPain.painLevel >= 5 ? "Rest / พักผ่อนร่างกาย" : "เวทฟื้นฟูร่างกาย / กายภาพ")
        : (recSys.coachingState === "easy" ? "Easy Run หรือจ็อกเบา" : "วิ่งซ้อมตามแผนปกติ"),
      workoutTarget: recSys.recommendedIntensity === "rest" ? "ไม่ต้องซ้อมเบิร์นคาร์บ" : "คุม HR โซน Easy / สังเกตความรู้สึก",
      weekSummary: `วิ่งสะสมสัปดาห์นี้ ${ctx.totalRunKm} km / 7 วัน`,
      keyObservation: recSys.axes.recovery.summary,
      coachMessage: recSys.guardrails.join(" · "),
    };

    const aiPromise = jsonFromAI<DailyCoachInsight>({
      system,
      user: buildUserPrompt(ctx),
      fallback: personalizedFallback,
    });

    const timeoutPromise = new Promise<JSONAIResult<DailyCoachInsight>>((resolve) =>
      setTimeout(() => {
        resolve({
          data: personalizedFallback,
          source: "fallback",
          usedFallback: true,
          errorCode: "AI_TIMEOUT",
          errorMessage: "AI request timed out on server",
        });
      }, SERVER_AI_TIMEOUT_MS)
    );

    const result = await Promise.race([aiPromise, timeoutPromise]);
    const guarded = applyCautionFactorsGuard(applyPostWorkoutRecoveryGuard(applyTodayPainGuard(normalizeInsight(result.data, ctx), ctx), ctx), ctx);
    if (process.env.NODE_ENV === "development") {
      console.info("[today-insight-ai-result]", {
        source: result.source,
        usedFallback: Boolean(result.usedFallback),
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
      });
    }

    return NextResponse.json({
      source: result.source,
      ok: !result.usedFallback,
      usedFallback: Boolean(result.usedFallback),
      errorCode: result.errorCode,
      message: result.usedFallback ? fallbackMessageForError(result.errorCode) : undefined,
      debugMessage: process.env.NODE_ENV === "development" ? result.errorMessage : undefined,
      data: guarded,
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[today-analysis-error]", error);
    }
    return NextResponse.json({
      ok: false,
      usedFallback: true,
      errorCode: "CONTEXT_SCHEMA_ERROR",
      message: "วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง",
      debugMessage: process.env.NODE_ENV === "development" ? errorMessage(error) : undefined,
      data: FALLBACK,
    });
  }
}

function fallbackMessageForError(errorCode: string | undefined): string {
  if (errorCode === "AI_INVALID_JSON") return "AI ตอบกลับไม่เป็นรูปแบบที่อ่านได้ ระบบจึงใช้คำแนะนำสำรองจาก Report ล่าสุด";
  if (errorCode === "AI_EMPTY_RESPONSE") return "AI ยังไม่ส่งคำตอบกลับมา ระบบจึงใช้คำแนะนำสำรองจาก Report ล่าสุด";
  if (errorCode === "AI_TIMEOUT") return "AI ใช้เวลานานเกินไป ระบบจึงใช้คำแนะนำสำรองจาก Report ล่าสุด";
  if (errorCode === "AI_PROVIDER_ERROR") return "AI ยังวิเคราะห์ไม่สำเร็จ ระบบจึงใช้คำแนะนำสำรองจาก Report ล่าสุด";
  return "AI ยังวิเคราะห์ไม่สำเร็จ แต่ระบบใช้ข้อมูลล่าสุดใน Report เพื่อแนะนำวันนี้แทน";
}

function normalizeCoachContext(value: unknown): CoachContext {
  const raw = isRecord(value) ? value : {};
  const sleep7d = arrayValue(raw.sleep7d);
  const workouts7d = arrayValue(raw.workouts7d);
  const todayWorkouts = arrayValue(raw.todayWorkouts);
  const nutrition7d = arrayValue(raw.nutrition7d);
  const mealsToday = arrayValue(raw.mealsToday);
  const recentRaceResults = arrayValue(raw.recentRaceResults);
  const recentPainLogs = arrayValue(raw.recentPainLogs);
  const contextNotes = arrayValue(raw.contextNotes).filter((note): note is string => typeof note === "string");
  const todayPrimaryWorkout = isRecord(raw.todayPrimaryWorkout) ? raw.todayPrimaryWorkout as TodayCompletedWorkoutSummary : null;
  const latestPain = isRecord(raw.latestPain) ? raw.latestPain as CoachContext["latestPain"] : null;
  const recentMaxPain = isRecord(raw.recentMaxPain) ? raw.recentMaxPain as CoachContext["recentMaxPain"] : null;
  const nutritionToday = isRecord(raw.nutritionToday) ? {
    ...raw.nutritionToday,
    notes: arrayValue((raw.nutritionToday as Record<string, unknown>).notes).filter((note): note is string => typeof note === "string"),
  } as CoachContext["nutritionToday"] : null;

  const context: CoachContext = {
    profile: isRecord(raw.profile) ? raw.profile : null,
    raceGoal: isRecord(raw.raceGoal) ? raw.raceGoal : null,
    racePlan: isRecord(raw.racePlan) ? raw.racePlan : null,
    activeRaceStatus: raw.activeRaceStatus === "scheduled" || raw.activeRaceStatus === "today" || raw.activeRaceStatus === "past" ? raw.activeRaceStatus : "none",
    activeRaceGoal: isRecord(raw.activeRaceGoal) ? raw.activeRaceGoal : null,
    raceDate: stringOrNull(raw.raceDate),
    raceDistance: stringOrNull(raw.raceDistance),
    raceName: stringOrNull(raw.raceName),
    daysUntilRace: numberOrNull(raw.daysUntilRace),
    isRaceToday: Boolean(raw.isRaceToday),
    isRaceTomorrow: Boolean(raw.isRaceTomorrow),
    isRaceWeek: Boolean(raw.isRaceWeek),
    raceGoalType: stringOrNull(raw.raceGoalType),
    targetTime: stringOrNull(raw.targetTime),
    sleep7d: sleep7d as CoachContext["sleep7d"],
    avgReadiness: numberOrNull(raw.avgReadiness),
    sleepAvg7dHours: numberOrNull(raw.sleepAvg7dHours),
    sleepAvg7dText: stringOrNull(raw.sleepAvg7dText),
    sleepNightCount7d: numberOrNull(raw.sleepNightCount7d) ?? sleep7d.length,
    latestSleepDurationText: stringOrNull(raw.latestSleepDurationText),
    latestSleepScore: numberOrNull(raw.latestSleepScore),
    latestEnergyScore: numberOrNull(raw.latestEnergyScore),
    latestSleepDateKey: stringOrNull(raw.latestSleepDateKey),
    workouts7d: workouts7d as CoachContext["workouts7d"],
    hasWorkoutToday: Boolean(raw.hasWorkoutToday) || todayWorkouts.length > 0 || Boolean(todayPrimaryWorkout),
    todayWorkouts: todayWorkouts as CoachContext["todayWorkouts"],
    todayPrimaryWorkout,
    nutritionToday,
    nutrition7d: nutrition7d as CoachContext["nutrition7d"],
    mealsToday: mealsToday as CoachContext["mealsToday"],
    latestCompletedRace: isRecord(raw.latestCompletedRace) ? raw.latestCompletedRace as CoachContext["latestCompletedRace"] : null,
    recentRaceResults: recentRaceResults as CoachContext["recentRaceResults"],
    latestHealthCheck: isRecord(raw.latestHealthCheck) ? raw.latestHealthCheck as CoachContext["latestHealthCheck"] : null,
    totalRunKm: numberOrNull(raw.totalRunKm) ?? 0,
    totalSessions: numberOrNull(raw.totalSessions) ?? 0,
    runDays7d: numberOrNull(raw.runDays7d) ?? 0,
    longestRun7dKm: numberOrNull(raw.longestRun7dKm),
    lastWorkoutDate: stringOrNull(raw.lastWorkoutDate),
    lastRun: isRecord(raw.lastRun) ? raw.lastRun as CoachContext["lastRun"] : null,
    latestBody: isRecord(raw.latestBody) ? raw.latestBody as CoachContext["latestBody"] : null,
    todayDate: stringOrNull(raw.todayDate) ?? todayBangkokDateKey(),
    contextNotes,
    recentPainLogs: recentPainLogs as CoachContext["recentPainLogs"],
    latestPain,
    recentMaxPain,
    activePain: Boolean(raw.activePain),
    recentPainHistory: Boolean(raw.recentPainHistory),
    painResolved: Boolean(raw.painResolved),
    nutritionBalanceToday: isRecord(raw.nutritionBalanceToday) ? raw.nutritionBalanceToday as CoachContext["nutritionBalanceToday"] : null,
    readinessV2: isRecord(raw.readinessV2) ? raw.readinessV2 as CoachContext["readinessV2"] : null,
    recoverySystem: null as unknown as RunMateRecoverySystem,
  };

  context.recoverySystem = isRecord(raw.recoverySystem)
    ? raw.recoverySystem as RunMateRecoverySystem
    : buildRunMateRecoverySystem(context);

  return context;
}

function normalizeInsight(value: unknown, ctx: CoachContext): DailyCoachInsight {
  const raw = isRecord(value) ? value : {};
  const fallback = deterministicFallback(ctx);
  return {
    todayReadiness: getTodayReadiness(ctx).score,
    readinessLabel: normalizeReadinessLabel(raw.readinessLabel) ?? fallback.readinessLabel,
    readinessNote: stringOrNull(raw.readinessNote) ?? fallback.readinessNote,
    workoutRec: stringOrNull(raw.workoutRec) ?? fallback.workoutRec,
    workoutTarget: stringOrNull(raw.workoutTarget) ?? fallback.workoutTarget,
    weekSummary: stringOrNull(raw.weekSummary) ?? fallback.weekSummary,
    keyObservation: stringOrNull(raw.keyObservation) ?? fallback.keyObservation,
    coachMessage: stringOrNull(raw.coachMessage) ?? fallback.coachMessage,
  };
}

function deterministicFallback(ctx: CoachContext): DailyCoachInsight {
  const latestPain = ctx.latestPain;
  const todayReadiness = getTodayReadiness(ctx);
  const readiness = todayReadiness.score;
  const readinessLabel = getReadinessCategoryLabel(readiness);
  const sleepNote = todayReadiness.label;

  if (ctx.hasWorkoutToday && ctx.todayPrimaryWorkout) {
    return {
      todayReadiness: readiness,
      readinessLabel,
      readinessNote: sleepNote,
      workoutRec: postWorkoutTitle(ctx.todayPrimaryWorkout),
      workoutTarget: "ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว",
      weekSummary: buildWeekSummary(ctx),
      keyObservation: formatWorkoutShortThai(ctx.todayPrimaryWorkout),
      coachMessage: "วันนี้มีข้อมูลซ้อมแล้ว ให้เปลี่ยนเป็นโหมด recovery: เติมน้ำ กินโปรตีนกับคาร์บพอประมาณ ยืดเบา ๆ และนอนให้พอครับ",
    };
  }

  if (latestPain && !latestPain.hasResolvedPain && latestPain.painLevel >= 3) {
    return {
      todayReadiness: readiness,
      readinessLabel,
      readinessNote: sleepNote,
      workoutRec: latestPain.painLevel >= 5 ? "งดวิ่ง / พักและประเมินอาการ" : "Rest / Recovery",
      workoutTarget: "Recovery Day · ไม่ต้องจับ pace",
      weekSummary: buildWeekSummary(ctx),
      keyObservation: `ล่าสุดเจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`,
      coachMessage: "วันนี้ใช้คำแนะนำสำรองแบบ conservative ก่อน เพราะมีประวัติอาการเจ็บล่าสุด ให้พักจากแรงกระแทก เดินเบา ๆ ได้เฉพาะถ้าไม่เจ็บเพิ่มครับ",
    };
  }

  if (readiness < 55) {
    return {
      todayReadiness: readiness,
      readinessLabel,
      readinessNote: sleepNote,
      workoutRec: "Recovery / Walk + Mobility",
      workoutTarget: "เน้นฟื้นตัว · เดินเบา ๆ ถ้าไม่เจ็บ",
      weekSummary: buildWeekSummary(ctx),
      keyObservation: "readiness ยังต่ำ จึงลดโหลดก่อน",
      coachMessage: "วันนี้ให้ลดความหนักก่อนครับ อัปเดตข้อมูลเพิ่มได้แล้วกดวิเคราะห์ใหม่ ถ้าจะขยับตัวให้เลือกเดินเบา ๆ หรือ mobility 10-20 นาที",
    };
  }

  return {
    todayReadiness: readiness,
    readinessLabel,
    readinessNote: sleepNote,
    workoutRec: "Easy / Recovery",
    workoutTarget: "ไม่ต้องจับ pace · คุมให้ง่าย",
    weekSummary: buildWeekSummary(ctx),
    keyObservation: "ใช้คำแนะนำสำรองจาก Report ล่าสุด",
    coachMessage: "ยังวิเคราะห์ด้วย AI ไม่สำเร็จเต็มรูปแบบ แต่จากข้อมูลล่าสุดให้เลือกซ้อมเบาไว้ก่อน และลองกดวิเคราะห์ใหม่อีกครั้งครับ",
  };
}

function buildWeekSummary(ctx: CoachContext): string {
  const parts = [
    ctx.totalRunKm > 0 ? `วิ่ง ${Math.round(ctx.totalRunKm * 10) / 10} km` : null,
    ctx.totalSessions > 0 ? `${ctx.totalSessions} sessions` : null,
    ctx.sleepAvg7dText ? `นอนเฉลี่ย ${ctx.sleepAvg7dText}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก";
}

function normalizeReadinessLabel(value: unknown): DailyCoachInsight["readinessLabel"] | null {
  return value === "Low" || value === "Fair" || value === "Good" || value === "Excellent" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildUserPrompt(ctx: CoachContext): string {
  const lines: string[] = [];
  lines.push(`Active race status: ${ctx.activeRaceStatus}`);
  lines.push(`Race context: date=${ctx.raceDate ?? "none"}, isRaceToday=${ctx.isRaceToday}, isRaceTomorrow=${ctx.isRaceTomorrow}, isRaceWeek=${ctx.isRaceWeek}, distance=${ctx.raceDistance ?? "none"}, target=${ctx.targetTime ?? "none"}`);
  if (ctx.contextNotes?.length) {
    lines.push(`Context notes:`);
    for (const note of ctx.contextNotes) lines.push(`- ${note}`);
  }

  lines.push(`วันนี้: ${ctx.todayDate}`);

  if (ctx.hasWorkoutToday && ctx.todayPrimaryWorkout) {
    lines.push(`\nToday workout status: completed`);
    lines.push(`- Primary workout today: ${formatWorkoutForPrompt(ctx.todayPrimaryWorkout)}`);
    if (ctx.todayWorkouts.length > 1) {
      lines.push(`- Other workouts today: ${ctx.todayWorkouts.slice(1).map(formatWorkoutForPrompt).join(" | ")}`);
    }
    lines.push("- Rule: Today Focus must switch to post-workout recovery. Do not recommend another run or hard session unless explicitly asked and clearly safe.");
    lines.push("- Include hydration, protein/carbs, light mobility, sleep target/bedtime, and injury guard.");
  } else {
    lines.push(`\nToday workout status: not completed yet`);
    lines.push("- Rule: Today Focus may answer what to train today, while respecting sleep/readiness/race/pain safety.");
  }

  const plannedWorkout = getTodayPlannedWorkout(ctx);
  if (plannedWorkout) {
    lines.push(`\nRace plan workout today: ${formatPlannedWorkout(plannedWorkout)}`);
    lines.push("- Product rule: Race is the main training plan. Today is an adaptive recommendation based on current sleep, recovery, and pain.");
    lines.push("- If Today softens the Race workout, explain the original plan first, then why today's safer option is lighter.");
  }

  if (ctx.latestPain) {
    lines.push(`\nPain status for Today Focus:`);
    if (ctx.latestPain.hasResolvedPain) {
      lines.push(`- latestPain/resolved: ${ctx.latestPain.painLocation} marked resolved on ${ctx.latestPain.resolvedAt ?? ctx.latestPain.date}. Do not describe it as active injury.`);
    } else {
      lines.push(`- latestPain/current: ${ctx.latestPain.painLocation} ${ctx.latestPain.painLevel}/10 on ${ctx.latestPain.date}, risk=${ctx.latestPain.riskLevel}, impact=${ctx.latestPain.trainingImpact}`);
    }
    if (ctx.recentMaxPain && ctx.recentMaxPain.painLevel > ctx.latestPain.painLevel) {
      lines.push(`- recentMaxPain/safety only: ${ctx.recentMaxPain.painLocation} ${ctx.recentMaxPain.painLevel}/10 on ${ctx.recentMaxPain.date}`);
    }
    lines.push("- Rule: Today Focus current pain wording must use latestPain. recentMaxPain is history/safety context only.");
  }

  if (ctx.profile) {
    const p = ctx.profile as Record<string, string>;
    lines.push(`\nโปรไฟล์นักวิ่ง:`);
    if (p.name) lines.push(`- ชื่อ: ${p.name}`);
    if (p.age) lines.push(`- อายุ: ${p.age} ปี`);
    if (p.level) lines.push(`- ระดับ: ${p.level}`);
    if (p.mainGoal) lines.push(`- เป้าหมาย: ${p.mainGoal}`);
    if (p.maxHR) lines.push(`- HR max: ${p.maxHR}`);
    if (p.injuryNotes) lines.push(`- ประวัติบาดเจ็บ: ${p.injuryNotes}`);
  }

  if (ctx.profile) {
    lines.push(`Profile JSON: ${JSON.stringify(ctx.profile)}`);
  }

  if (ctx.raceGoal) {
    const g = ctx.raceGoal as Record<string, string>;
    lines.push(`\nเป้าหมายแข่ง: ${g.distance ?? ""} ${g.targetTime ?? ""} วันที่ ${g.raceDate ?? "ยังไม่กำหนด"}`);
  }

  lines.push(`\nการนอน 7 วันล่าสุด:`);
  if (ctx.sleep7d.length === 0) {
    lines.push("- ไม่มีข้อมูล");
  } else {
    for (const s of ctx.sleep7d) {
      const parts = [s.date, s.durationH && `นอน ${s.durationH}`, s.score && `score ${s.score}`, s.readiness && `readiness ${s.readiness}`].filter(Boolean);
      lines.push(`- ${parts.join(", ")}`);
    }
    if (ctx.sleepAvg7dText) lines.push(`Sleep avg 7d source of truth: ${ctx.sleepAvg7dText} from ${ctx.sleepNightCount7d} deduped night(s).`);
    if (ctx.avgReadiness != null) lines.push(`เฉลี่ย readiness: ${ctx.avgReadiness}`);
  }

  lines.push(`\nการออกกำลังกาย 7 วันล่าสุด (รวม ${ctx.totalRunKm} km วิ่ง, ${ctx.totalSessions} sessions):`);
  lines.push(`Run days: ${ctx.runDays7d}, longest run: ${ctx.longestRun7dKm ?? "unknown"} km, last workout: ${ctx.lastWorkoutDate ?? "unknown"}`);
  if (ctx.lastRun) {
    const lastRunKm = formatKm(ctx.lastRun.km) ?? "unknown";
    const duration = formatDurationMin(ctx.lastRun.durationMin) ?? "unknown duration";
    lines.push(`Last run: ${ctx.lastRun.date}, ${lastRunKm} km, ${duration}, HR ${formatPlainNumber(ctx.lastRun.avgHR) ?? "unknown"}, pace ${ctx.lastRun.pace ?? "unknown"}`);
  }

  if (ctx.workouts7d.length === 0) {
    lines.push("- ไม่มีข้อมูล");
  } else {
    for (const day of ctx.workouts7d) {
      const parts: string[] = [`${day.date}:`];
      for (const r of day.runs) {
        const distance = formatKm(r.km);
        const duration = formatDurationMin(r.durationMin);
        const hr = formatPlainNumber(r.avgHR);
        parts.push(`วิ่ง${distance ? ` ${distance}km` : ""}${duration ? ` ${duration}` : ""}${hr ? ` HR${hr}` : ""}${r.pace ? ` pace${r.pace}` : ""}`);
      }
      for (const w of day.walks) {
        const distance = formatKm(w.km);
        const duration = formatDurationMin(w.durationMin);
        parts.push(`เดิน${distance ? ` ${distance}km` : ""}${duration ? ` ${duration}` : ""}`);
      }
      for (const o of day.other) {
        parts.push(`${o.label}${formatDurationMin(o.durationMin) ? ` ${formatDurationMin(o.durationMin)}` : ""}`);
      }
      lines.push(`  ${parts.join(" | ")}`);
    }
  }

  if (ctx.nutritionToday) {
    const n = ctx.nutritionToday;
    lines.push(`\nNutrition today (rough estimates from meal photos):`);
    lines.push(`- Meals logged: ${n.mealCount}`);
    lines.push(`- Estimated calories: ${n.caloriesKcal ?? "unknown"} kcal`);
    lines.push(`- Protein: ${n.proteinG ?? "unknown"} g`);
    lines.push(`- Carbs: ${n.carbsG ?? "unknown"} g`);
    lines.push(`- Fat: ${n.fatG ?? "unknown"} g`);
    for (const note of n.notes) lines.push(`- Note: ${note}`);
  }

  if (ctx.latestBody) {
    const b = ctx.latestBody;
    lines.push(`\nส่วนประกอบร่างกาย (ล่าสุด):`);
    if (b.weightKg) lines.push(`- น้ำหนัก ${b.weightKg} kg`);
    if (b.bodyFatPct) lines.push(`- ไขมัน ${b.bodyFatPct}%`);
    if (b.muscleKg) lines.push(`- กล้ามเนื้อ ${b.muscleKg} kg`);
  }

  if (ctx.readinessV2) {
    const r = ctx.readinessV2;
    lines.push(`\nReadiness V2 (multi-factor, 0-100):`);
    lines.push(`- Score: ${r.score} (${r.label}) confidence=${r.confidence}`);
    lines.push(`- Components: sleep=${r.components.sleep.rawScore} (×${r.components.sleep.weight}), load=${r.components.trainingLoad.rawScore} (×${r.components.trainingLoad.weight}), nutrition=${r.components.nutrition.rawScore} (×${r.components.nutrition.weight}), pain=${r.components.painSafety.rawScore} (×${r.components.painSafety.weight})`);
    if (r.cap != null) lines.push(`- Pain cap applied: max ${r.cap}`);
    if (r.missingDataLabels.length) lines.push(`- Missing data: ${r.missingDataLabels.join(", ")}`);
    lines.push(`- Note: ${r.readinessNote}`);
    lines.push("- Rule: Use this V2 score as the primary readiness signal. It combines sleep, training load, nutrition, and pain safety.");
  }

  return lines.join("\n");
}

function applyPostWorkoutRecoveryGuard(insight: DailyCoachInsight, ctx: CoachContext): DailyCoachInsight {
  const workout = ctx.todayPrimaryWorkout;
  if (!ctx.hasWorkoutToday || !workout) return insight;

  const isMixed = ctx.todayWorkouts.some(w => w.kind === "run") && ctx.todayWorkouts.some(w => w.kind === "strength");
  const workoutLine = isMixed ? "หลังออกกำลังกายวันนี้" : formatWorkoutShortThai(workout);
  const painLine = buildPostWorkoutPainLine(ctx);
  const hydrationLine = buildHydrationLine(workout);
  const nutritionLine = buildPostWorkoutNutritionLine(ctx);
  const sleepLine = buildPostWorkoutSleepLine(ctx);
  const mobilityLine = workout.kind === "race"
    ? "วันนี้ไม่ต้องซ้อมเพิ่ม ให้เดินคลายขาเบา ๆ และยืด/foam roll 10–15 นาทีพอ"
    : "ไม่ต้องซ้อมหนักเพิ่มวันนี้ ยืด/foam roll เบา ๆ 10–15 นาที";

  const keyObservation = painLine
    ? `${workoutLine} · ${painLine}`
    : workoutLine;

  const coachMessage = [
    isMixed ? "วันนี้ออกกำลังกายหลายอย่างแล้ว ให้เปลี่ยนโหมดเป็นฟื้นตัวก่อน" : `${workoutLine} วันนี้ให้เปลี่ยนโหมดเป็นฟื้นตัวก่อน`,
    hydrationLine,
    nutritionLine,
    mobilityLine,
    sleepLine,
    painLine ? `เช็กอาการ: ${painLine}` : "ถ้ามีอาการเจ็บเพิ่ม ให้ลดการเดินเยอะและพักมากขึ้น",
  ].filter(Boolean).slice(0, 6).join(" ");

  return {
    ...insight,
    workoutRec: postWorkoutTitle(workout, ctx),
    workoutTarget: "ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว",
    keyObservation,
    coachMessage,
  };
}

function applyCautionFactorsGuard(insight: DailyCoachInsight, ctx: CoachContext): DailyCoachInsight {
  const factors = getCoachCautionFactors(ctx);
  const isRun = /(run|วิ่ง|ซ้อม|easy|tempo|long)/i.test(insight.workoutRec ?? "");
  const hasCaution = factors.length > 0;
  
  if (insight.todayReadiness >= 66 && hasCaution && isRun) {
    const suffix = " วันนี้ความพร้อมพอขยับได้ แต่ยังมีปัจจัยควรระวัง วันนี้จึงไม่ใช่เวลากด pace หรือเร่งความเร็ว เน้นวิ่งแบบ easy หรือ recovery เท่านั้นครับ";
    if (insight.coachMessage && !insight.coachMessage.includes("ไม่ใช่เวลากด pace")) {
      return {
        ...insight,
        coachMessage: insight.coachMessage.trim() + suffix,
      };
    }
  }
  return insight;
}

function applyTodayPainGuard(insight: DailyCoachInsight, ctx: CoachContext): DailyCoachInsight {
  const cleaned: DailyCoachInsight = {
    ...FALLBACK,
    ...insight,
    workoutTarget: cleanWorkoutTarget(insight.workoutTarget),
  };

  const latest = ctx.latestPain ?? ctx.recentPainLogs?.[0] ?? null;
  if (!latest) return cleaned;

  const recentMax = ctx.recentMaxPain ?? latest;
  const hasRecentSafetyHistory = recentMax.painLevel >= 3 && recentMax.painLevel > latest.painLevel;
  const plannedWorkout = getTodayPlannedWorkout(ctx);
  const planLine = plannedWorkout ? `ตามแผนวันนี้คือ ${formatPlannedWorkout(plannedWorkout)}` : "";
  if (latest.hasResolvedPain) {
    const resolvedLine = hasRecentSafetyHistory
      ? `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว แต่ช่วง 3 วันที่ผ่านมาเคยมีอาการถึง ${recentMax.painLevel}/10`
      : `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว`;
    const adaptiveMessage = hasRecentSafetyHistory
      ? `${planLine ? `${planLine} แต่` : ""}${resolvedLine} วันนี้ให้เริ่มแบบ Easy/Active Recovery ก่อน 10–15 นาที ถ้าไม่มีอาการค่อยทำต่อให้ครบตามแผน แต่ถ้าเริ่มเจ็บให้หยุดทันทีครับ`
      : `${planLine ? `${planLine} และ` : ""}${resolvedLine} ค่อย ๆ กลับเข้าโหลดตามแผนได้ โดยเริ่มเบาและหยุดถ้าอาการกลับมาครับ`;
    return {
      ...cleaned,
      keyObservation: resolvedLine,
      coachMessage: adaptiveMessage,
    };
  }
  const painLine = hasRecentSafetyHistory
    ? `ล่าสุด${latest.painLocation} ${latest.painLevel}/10 แต่ในช่วง 3 วันที่ผ่านมาเคยขึ้นถึง ${recentMax.painLevel}/10`
    : `ล่าสุด${latest.painLocation} ${latest.painLevel}/10`;
  const sleepLine = buildSleepContextLine(ctx);
  const contextLine = sleepLine ? `${sleepLine} แต่${painLine}` : painLine;

  if (latest.painLevel <= 1 && hasRecentSafetyHistory) {
    return {
      ...cleaned,
      workoutRec: "Recovery / Walk + Mobility",
      workoutTarget: "ไม่เน้น HR วันนี้ · เดินเบา ๆ, mobility และประคบเย็นถ้ายังระบม",
      keyObservation: painLine,
      coachMessage: `${planLine ? `${planLine} แต่` : ""}${contextLine} จึงยังให้ลดโหลดก่อน อาการดีขึ้นแล้ว แต่ควรคุมโหลดเพื่อไม่ให้กลับมาเจ็บซ้ำ Easy run ทำได้เฉพาะถ้าเดินและวอร์มอัปแล้วไม่เจ็บครับ`,
    };
  }

  if (latest.painLevel === 2) {
    return {
      ...cleaned,
      workoutRec: "Recovery / Walk + Mobility",
      workoutTarget: "เน้นฟื้นตัว · เดินเบา ๆ ถ้าไม่เจ็บ",
      keyObservation: painLine,
      coachMessage: `${planLine ? `${planLine} แต่` : ""}${contextLine} วันนี้ให้ conservative ไว้ก่อน ลดแรงกระแทกและดูอาการระหว่างวัน วิ่งได้เฉพาะแบบสั้นเบามากถ้าเดินกับวอร์มอัปแล้วไม่เจ็บครับ`,
    };
  }

  if (latest.painLevel >= 3 && latest.painLevel <= 4) {
    return {
      ...cleaned,
      workoutRec: "Rest / Recovery",
      workoutTarget: "Recovery Day · ไม่ต้องจับ pace",
      keyObservation: painLine,
      coachMessage: `${planLine ? `${planLine} แต่` : ""}${contextLine} วันนี้ให้พัก/เดินเบา ๆ หรือ mobility แทนก่อน ไม่ควรวางวิ่งเป็นค่าเริ่มต้นครับ`,
    };
  }

  if (latest.painLevel >= 5) {
    return {
      ...cleaned,
      workoutRec: "งดวิ่ง / พักและประเมินอาการ",
      workoutTarget: "ไม่เน้น HR วันนี้ · พักจากการวิ่ง",
      keyObservation: painLine,
      coachMessage: `${planLine ? `${planLine} แต่` : ""}${contextLine} วันนี้งดวิ่งก่อนครับ ถ้าอาการยังไม่ดีขึ้น แย่ลง บวม แดง ชา หรือลงน้ำหนักลำบาก ควรพบแพทย์หรือนักกายภาพ`,
    };
  }

  return cleaned;
}

function formatWorkoutForPrompt(workout: TodayCompletedWorkoutSummary): string {
  const details = [
    formatDistanceKm(workout.distanceKm),
    workout.durationText ?? formatDurationMin(workout.durationMin),
    formatAvgHr(workout.avgHR),
    workout.pace ? `pace ${workout.pace}` : null,
    formatCalories(workout.calories),
  ].filter(Boolean);
  return `${workout.label}${details.length ? ` (${details.join(", ")})` : ""}`;
}

// getTodayPlannedWorkout is imported from buildCoachContext.ts

function formatPlannedWorkout(workout: WeekWorkout): string {
  const distance = toFiniteNumber(workout.distanceKm);
  return `${workout.workoutType || "การซ้อม"}${distance != null && distance > 0 ? ` ${formatKm(distance)} km` : ""}`;
}

// bangkokWeekdayIndex and normalizeWeekdayLabel are now imported

function formatWorkoutShortThai(workout: TodayCompletedWorkoutSummary): string {
  const parts: string[] = [];
  if (workout.kind === "race") parts.push("วันนี้มี Race Result แล้ว");
  else if (workout.kind === "run") parts.push("วันนี้วิ่งไปแล้ว");
  else if (workout.kind === "strength") parts.push("วันนี้เวทไปแล้ว");
  else if (workout.kind === "walk") parts.push("วันนี้เดิน/ขยับตัวไปแล้ว");
  else parts.push(`วันนี้${workout.label}ไปแล้ว`);

  const distanceKm = toFiniteNumber(workout.distanceKm);
  if (distanceKm != null && distanceKm > 0) parts.push(`${formatKm(distanceKm)} km`);
  if (workout.durationText) parts.push(`เวลา ${workout.durationText}`);
  else if (formatDurationMin(workout.durationMin)) parts.push(`เวลา ${formatDurationMin(workout.durationMin)}`);
  if (formatPlainNumber(workout.avgHR)) parts.push(`เฉลี่ย HR ${formatPlainNumber(workout.avgHR)}`);
  return parts.join(" ");
}

function postWorkoutTitle(workout: TodayCompletedWorkoutSummary, ctx?: CoachContext): string {
  if (ctx && ctx.todayWorkouts.length > 1) {
    const kinds = ctx.todayWorkouts.map(w => w.kind);
    if (kinds.includes("run") && kinds.includes("strength")) {
      return "หลังออกกำลังกายวันนี้";
    }
  }
  if (workout.kind === "race") return "Recovery หลัง Race วันนี้";
  if (workout.kind === "run") {
    const distance = formatKm(workout.distanceKm);
    return distance
      ? `ฟื้นตัวหลังวิ่ง ${distance} km`
      : "Recovery หลังวิ่งวันนี้";
  }
  if (workout.kind === "strength") return "ฟื้นตัวหลังเวทวันนี้";
  return "พักฟื้นหลังซ้อมวันนี้";
}

function buildHydrationLine(workout: TodayCompletedWorkoutSummary): string {
  const distance = toFiniteNumber(workout.distanceKm) ?? 0;
  const calories = toFiniteNumber(workout.calories) ?? 0;
  if (distance >= 8 || calories >= 500 || workout.kind === "race") {
    return "ดื่มน้ำเพิ่มประมาณ 600–900 ml และเติมเกลือแร่ถ้าเหงื่อออกเยอะ";
  }
  if (distance >= 5 || calories >= 250) {
    return "ดื่มน้ำเพิ่มประมาณ 500–700 ml ในช่วงหลังซ้อม";
  }
  return "ดื่มน้ำเพิ่มประมาณ 400–600 ml ให้ปัสสาวะกลับมาใสขึ้น";
}

function buildPostWorkoutNutritionLine(ctx: CoachContext): string {
  const nutrition = ctx.nutritionToday;
  const target = proteinTarget(ctx);
  if (nutrition?.proteinG != null && target != null) {
    const remaining = Math.max(0, target - nutrition.proteinG);
    if (remaining >= 15) {
      return `โปรตีนวันนี้ยังขาดประมาณ ${Math.round(remaining)} g มื้อต่อไปเติมโปรตีน 25–35 g + คาร์บพอประมาณ`;
    }
    return "โปรตีนวันนี้ใกล้ถึงเป้าแล้ว เน้นคาร์บพอประมาณและน้ำเพื่อ recovery";
  }
  if (nutrition?.proteinG != null) {
    return `วันนี้มีโปรตีนประมาณ ${nutrition.proteinG} g แล้ว หลังซ้อมยังควรมีโปรตีน 25–35 g + คาร์บพอประมาณ`;
  }
  return "ถ้ายังไม่ได้กินหลังซ้อม ให้เน้นโปรตีน 25–35 g + คาร์บพอประมาณจากอาหารย่อยง่าย";
}

function buildPostWorkoutSleepLine(ctx: CoachContext): string {
  const latestSleep = ctx.sleep7d.find((sleep) => sleep.date === ctx.todayDate) ?? ctx.sleep7d[0];
  const readiness = latestSleep?.readiness ?? ctx.avgReadiness;
  if (readiness != null && readiness < 55) {
    return "คืนนี้เข้านอนให้เร็วที่สุดเท่าที่ทำได้ เลี่ยงจอ 20–30 นาที และตั้งเป้านอน 7–8 ชม.";
  }
  return "คืนนี้ตั้งเป้านอน 7–8 ชม. เข้านอนประมาณ 22:30–23:30 ถ้าทำได้";
}

function buildPostWorkoutPainLine(ctx: CoachContext): string {
  const latest = ctx.latestPain ?? ctx.recentPainLogs?.[0] ?? null;
  if (!latest) return "";
  const recentMax = ctx.recentMaxPain ?? latest;
  const hasRecentSafetyHistory = recentMax.painLevel >= 3 && recentMax.painLevel > latest.painLevel;
  if (latest.hasResolvedPain) {
    return hasRecentSafetyHistory
      ? `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว แต่ช่วงล่าสุดเคยมีอาการถึง ${recentMax.painLevel}/10 จึงยังค่อย ๆ เพิ่มโหลด`
      : `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว ค่อย ๆ เพิ่มโหลดกลับ`;
  }
  const base = hasRecentSafetyHistory
    ? `ล่าสุดเจ็บ${latest.painLocation} ${latest.painLevel}/10 แต่เคยขึ้นถึง ${recentMax.painLevel}/10 ในช่วงล่าสุด`
    : `ล่าสุดเจ็บ${latest.painLocation} ${latest.painLevel}/10`;

  const hasRedFlag =
    latest.swellingOrRedness === "yes" ||
    latest.canBearWeight === "no" ||
    latest.redFlags.length > 0 ||
    latest.painType.some((type) => /sharp|numb|ชา|แปลบ/i.test(type));
  if (hasRedFlag) return `${base} ถ้าบวมแดง ชา ปวดแปลบ หรือลงน้ำหนักลำบาก ให้หยุดซ้อมและปรึกษาแพทย์/นักกายภาพ`;
  if (latest.painLevel >= 3) return `${base} งดซ้อมเพิ่ม เน้นพัก/ประคบเย็น/ยกขา`;
  if (latest.painLevel === 2) return `${base} ลดโหลดและสังเกตอาการ ถ้าเจ็บเพิ่มให้พัก`;
  if (hasRecentSafetyHistory) return `${base} จึงยังควรลดโหลดและเลี่ยง hard session`;
  return `${base} ถ้าไม่เจ็บเพิ่ม เดินเบา ๆ หรือ mobility ได้`;
}

function proteinTarget(ctx: CoachContext): number | null {
  const profile = ctx.profile;
  const explicit = Number(profile?.proteinTargetG);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const weight = Number(profile?.weightKg);
  if (Number.isFinite(weight) && weight > 0) return Math.round(weight * 1.6);
  return null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKm(value: unknown): string | null {
  const km = toFiniteNumber(value);
  if (km == null) return null;
  return Number.isInteger(km) ? String(km) : km.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

function formatDistanceKm(value: unknown): string | null {
  const distance = formatKm(value);
  return distance ? `${distance} km` : null;
}

function formatDurationMin(value: unknown): string | null {
  const duration = toFiniteNumber(value);
  if (duration == null) return null;
  return `${Math.round(duration)} min`;
}

function formatAvgHr(value: unknown): string | null {
  const hr = toFiniteNumber(value);
  return hr == null ? null : `avg HR ${Math.round(hr)}`;
}

function formatPlainNumber(value: unknown): string | null {
  const number = toFiniteNumber(value);
  return number == null ? null : String(Math.round(number));
}

function formatCalories(value: unknown): string | null {
  const calories = toFiniteNumber(value);
  return calories == null ? null : `${Math.round(calories)} kcal`;
}

function cleanWorkoutTarget(value: string | null | undefined): string {
  const original = (value ?? "").trim();
  if (!original || original === "-") return "Recovery Day · ไม่ต้องจับ pace";
  const cleaned = original
    .replace(/\bHR\s*N\/A\b[,\s·-]*/gi, "")
    .replace(/\bPace\s*N\/A\b[,\s·-]*/gi, "")
    .replace(/\s*,\s*,/g, ", ")
    .replace(/^[,\s·-]+|[,\s·-]+$/g, "")
    .trim();
  return cleaned || "Recovery Day · ไม่ต้องจับ pace";
}

function buildSleepContextLine(ctx: CoachContext): string {
  const latestSleep = ctx.sleep7d.find((sleep) => sleep.date === ctx.todayDate) ?? ctx.sleep7d[0];
  const readiness = latestSleep?.readiness ?? ctx.avgReadiness;
  if (readiness == null) return "";
  if (readiness < 50) return "การนอน/readiness ล่าสุดยังต่ำ";
  if (readiness < 65) return "การนอนล่าสุดและ readiness อยู่ระดับ Fair";
  if (readiness < 80) return "การนอนล่าสุดและ readiness อยู่ระดับ Good";
  return "การนอนล่าสุดและ readiness อยู่ระดับ Excellent";
}

const SYSTEM_PROMPT = `คุณคือ RunMate AI โค้ชวิ่งส่วนตัวที่วิเคราะห์ข้อมูลสุขภาพจริงจาก Samsung Health
พูดภาษาไทย กระชับ ตรงประเด็น เป็นกันเอง ไม่เป็นทางการมากเกินไป

ระบบประเมินความพร้อมและฟื้นฟูร่างกายของเราใช้โมเดล 4 แกน (Recovery, Load, Sleep, Fuel):
1. ฟื้นตัว (Recovery): สุขภาพหัวใจ (HRV/Resting HR เช้า) และประวัติความเจ็บปวด
2. โหลดซ้อม (Load): โหลดวิ่งสะสมสัปดาห์นี้ ระยะวิ่งสะสม ความบ่อยการซ้อม
3. การนอน (Sleep): ชั่วโมงนอนเมื่อคืนและประวัติหนี้การนอนสะสมในรอบสัปดาห์
4. พลังงาน (Fuel): สารอาหารคาร์โบไฮเดรตและโปรตีนในมื้ออาหารวันนี้

สถานะการประเมินเพื่อปรับความหนักในการซ้อม (Coaching State):
- push: ร่างกายสด การฟื้นตัวยอดเยี่ยม โหลดต่ำ นอนดี พลังงานพอ -> แนะนำลุยแผนหลัก/ซ้อมหนักได้เต็มที่
- maintain: ร่างกายปกติ โหลดปานกลาง ฟื้นตัวดี -> รักษารอบการซ้อมตามแผน
- easy: โหลดวิ่งสะสมสัปดาห์นี้สูงมาก หรือนอนเฉลี่ยต่ำ หรือความพร้อมปานกลาง (Fair 50-65) -> คุมความเข้มข้น ไม่กด Pace วิ่งประคองตัวแบบ Easy
- recover: ฟื้นตัวต่ำมาก หรือมีอาการบาดเจ็บค้างสะสม -> แนะนำงดซ้อมหรือเดิน/เวทฟื้นฟูแทน

คำเตือนที่สำคัญมาก:
- ห้ามเอ่ยชื่อยี่ห้อ "WHOOP" หรือคำเฉพาะลิขสิทธิ์ของค่ายอื่นเด็ดขาด!
- ถ้าความพร้อมโดยรวมต่ำหรือปานกลาง ให้แนะนำ Easy/Recovery คุมความหนัก และเน้นย้ำประโยค "วันนี้ไม่ใช่เวลากด pace หรือเร่งความเร็ว"
- ถ้ามีอาการเจ็บปวดปัจจุบัน (latestPain) เจ็บระดับ 3 ขึ้นไป ให้เน้นแนะนำให้งดวิ่งและเน้นฟื้นฟู/กายภาพหรือทำท่าเวทกายภาพเบา (Recovery Strength) แทน

วิเคราะห์ข้อมูล 7 วันที่ให้มา แล้วตอบเป็น JSON รูปแบบนี้:
{
  "todayReadiness": <0-100 ประเมินจาก sleep readiness ล่าสุดและ training load>,
  "readinessLabel": <"Low"|"Fair"|"Good"|"Excellent">,
  "readinessNote": <สรุปสั้นๆ ว่าทำไม readiness เป็นแบบนี้ เช่น "นอน 6h30m, physical recovery 82%">,
  "workoutRec": <แนะนำ workout วันนี้ เช่น "Easy Run 6-8 km" หรือ "Rest / Recovery">,
  "workoutTarget": <เป้าหมาย HR หรือ pace เช่น "HR 130-145, pace 6:30-7:00/km">,
  "weekSummary": <สรุปสัปดาห์ เช่น "วิ่ง 42km / 6 sessions, เฉลี่ย readiness 80">,
  "keyObservation": <สิ่งที่น่าสนใจที่เห็นจากข้อมูล เช่น "HR เฉลี่ยลดลง 5 bpm → aerobic base กำลังพัฒนา" หรือ "นอนน้อยลง 3 คืนติด ระวัง overreaching">,
  "coachMessage": <ข้อความจากโค้ช 2-3 ประโยค บอกว่าวันนี้ควรทำอะไร เน้นอะไร และทำไม>
}

กฎ:
- ถ้า readiness < 65 หรือนอนน้อย → แนะนำ easy/recovery ไม่ใช่ hard session
- ถ้ามีอาการเจ็บปวดหรือ caution factors (เช่น โหลดสะสมสูง, นอนเฉลี่ยต่ำ, HR พักสูงขึ้น) แม้ความพร้อมโดยรวมจะเป็น Good (66-79) แต่ให้แนะนำวิ่งแบบ Easy/Recovery คุมความหนัก และเน้นย้ำว่า "วันนี้ไม่ใช่เวลากด pace หรือเร่งความเร็ว"
- ถ้าวิ่งติดกัน 3+ วัน → เตือนให้ rest หรือ cross-train
- ถ้าไม่มีข้อมูล workout → ให้ insight จาก sleep อย่างเดียว
- coachMessage ต้องมี why เสมอ ไม่ใช่แค่สั่ง
- latestPain คืออาการเจ็บปัจจุบัน ต้องใช้ค่านี้เมื่อต้องพูดว่า "ล่าสุด/ตอนนี้เจ็บกี่คะแนน"
- recentMaxPain เป็นบริบทความเสี่ยงย้อนหลังเท่านั้น ห้ามเขียนเหมือนเป็นอาการปัจจุบัน
- ถ้า latestPain 0-1 แต่ recentMaxPain >= 3 ให้แนะนำ Recovery / Walk + Mobility และอธิบายว่าอาการดีขึ้นแต่ยังลดโหลดก่อน
- ถ้า latestPain 2 ให้ conservative: walk/mobility/recovery และวิ่งได้เฉพาะถ้าเดินกับวอร์มอัปไม่เจ็บ
- ถ้า latestPain 3-4 ให้ Rest / Recovery เป็นค่าเริ่มต้น ไม่แนะนำวิ่งเป็น default
- ถ้า latestPain >= 5 ให้งดวิ่งและแนะนำพบแพทย์/นักกายภาพถ้าไม่ดีขึ้นหรือแย่ลง
- ถ้าไม่มี HR หรือ pace target วันนี้ ให้ใช้ภาษาธรรมชาติ เช่น "Recovery Day · ไม่ต้องจับ pace" ห้ามตอบ "HR N/A" หรือ "Pace N/A"`;
