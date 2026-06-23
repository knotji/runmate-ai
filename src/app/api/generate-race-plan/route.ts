import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { racePlanPrompt } from "@/lib/prompts/racePlan";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { demoRacePlan } from "@/lib/training";
import type { CoachContext, PainSummary } from "@/lib/buildCoachContext";
import type { RaceGoal, RacePlan, WeekWorkout } from "@/types/race";

const DAY_MS = 86_400_000;

export async function POST(request: Request) {
  const body = (await request.json()) as { goal: RaceGoal; context?: CoachContext };
  const goal = body.goal;
  const ctx = body.context;

  const todayStr = todayBangkok();
  const daysUntilRace = goal.raceDate ? dateDiffDays(todayStr, goal.raceDate) : null;
  const weeksUntilRace = daysUntilRace != null ? Math.max(0, Math.ceil(daysUntilRace / 7)) : null;
  const derived = derivePlanInputs(goal, ctx, todayStr, daysUntilRace);

  const historySection = ctx ? buildHistorySummary(ctx) : "ไม่มีข้อมูล history";
  const profileCtx = ctx?.profile ? buildRunnerProfileContext(ctx.profile) : "";
  const system = profileCtx ? `${racePlanPrompt}\n\n${profileCtx}` : racePlanPrompt;

  const result = await jsonFromAI<RacePlan>({
    system,
    user: `Today: ${todayStr}
Days until race: ${daysUntilRace ?? "unknown"}
Weeks until race: ${weeksUntilRace ?? "unknown"}
Current phase: ${derived.currentPhase}
Derived pace guidance:
${JSON.stringify(derived.paceGuidance, null, 2)}

Latest pain status:
${formatPainContext(ctx)}

Recent training/readiness context:
${historySection}

Race Goal:
${JSON.stringify(goal, null, 2)}

Create a personalized, actionable race plan based on BOTH the goal AND the real history data above. Return JSON only.`,
    fallback: demoRacePlan(goal),
  });

  return NextResponse.json({
    ...result,
    data: normalizeActionableRacePlan(result.data, goal, ctx, todayStr, daysUntilRace, derived),
  });
}

function normalizeActionableRacePlan(
  plan: RacePlan,
  goal: RaceGoal,
  ctx: CoachContext | undefined,
  todayStr: string,
  daysUntilRace: number | null,
  derived: DerivedPlanInputs,
): RacePlan {
  const totalWeeks = daysUntilRace != null ? Math.max(1, Math.ceil(Math.max(daysUntilRace, 0) / 7)) : plan.totalWeeks || 1;
  const weeklyPlan = applyInjurySafety(
    sanitizeWeeklyPlan(plan.weeklyPlan, derived, goal, ctx, todayStr),
    ctx,
    derived,
  );
  const todayWorkout = applyWorkoutSafety(plan.todayWorkout ?? weeklyPlan[0] ?? defaultTodayWorkout(derived, ctx), ctx, derived);
  const weeks = plan.weeks?.length
    ? plan.weeks.map((week, index) => ({
        ...week,
        phase: week.phase || derived.currentPhase,
        weeklyFocus: week.weeklyFocus || derived.weeklyFocus,
        workouts: index === 0 ? weeklyPlan : week.workouts,
      }))
    : [
        {
          weekNumber: 1,
          phase: derived.currentPhase,
          weeklyFocus: derived.weeklyFocus,
          targetWeeklyDistanceKm: derived.targetWeekKm,
          longRunDistanceKm: derived.longRunKm,
          workouts: weeklyPlan,
        },
      ];

  return {
    ...plan,
    raceCountdownText: plan.raceCountdownText || countdownText(daysUntilRace),
    totalWeeks,
    currentPhase: derived.currentPhase,
    planSummary: plan.planSummary || derived.planSummary,
    weeksRemaining: totalWeeks,
    planStartDate: todayStr,
    todayWorkout,
    weeklyPlan,
    paceGuidance: derived.paceGuidance,
    phases: plan.phases?.length ? plan.phases : buildPhaseOverview(totalWeeks, derived.currentPhase),
    weeks,
    safetyNotes: buildSafetyNotes(ctx, derived),
  };
}

function sanitizeWeeklyPlan(
  input: WeekWorkout[] | undefined,
  derived: DerivedPlanInputs,
  goal: RaceGoal,
  ctx: CoachContext | undefined,
  todayStr: string,
): WeekWorkout[] {
  const generated = input?.length ? input : buildDefaultWeeklyPlan(derived, goal, ctx, todayStr);
  const normalized = generated.slice(0, 7).map((workout, index) => normalizeWorkout(workout, index, derived));
  while (normalized.length < 7) {
    normalized.push(normalizeWorkout(defaultRestWorkout(dayNameFrom(todayStr, normalized.length)), normalized.length, derived));
  }
  return normalized;
}

function normalizeWorkout(workout: WeekWorkout, index: number, derived: DerivedPlanInputs): WeekWorkout {
  const type = cleanText(workout.workoutType) || (index === 0 ? derived.defaultTodayType : "Recovery");
  // isRestOnly = pure rest day with no running expected
  const isRestOnly = /^(rest(\s+day)?|พัก)(\s*[\/,+]|$)/i.test(type);
  // isRecovery = light active session (Recovery, Mobility, Shakeout, Walk, ฟื้น...)
  const isRecovery = !isRestOnly && /^(recovery|active\s+recovery|recovery\s+walk|mobility|shakeout|post.?race|walk|ฟื้น)/i.test(type);
  const isRest = isRestOnly || isRecovery;
  const isHard = /tempo|interval|hill|speed|threshold|เร็ว|อินเทอร์/i.test(type);
  const isStrength = /^(strength|cross.?training|gym|core)/i.test(type);
  const pace = cleanText(workout.targetPace);
  const hr = cleanText(workout.targetHR);

  let targetPace: string | null;
  if (isRestOnly || isStrength) {
    targetPace = null;
  } else if (isRecovery) {
    const raw = pace && !/n\/a/i.test(pace) ? pace : null;
    targetPace = raw && /\d+:\d{2}/.test(raw) ? roundPacePlanStr(raw) : (derived.paceGuidance.recovery ?? null);
  } else if (pace && !/n\/a/i.test(pace)) {
    targetPace = /\d+:\d{2}/.test(pace) ? roundPacePlanStr(pace) : pace;
  } else {
    targetPace = (isHard ? derived.paceGuidance.tempo : derived.paceGuidance.easy) ?? null;
  }

  let targetHR: string;
  if (isRestOnly || isStrength) {
    targetHR = "ไม่เน้น HR";
  } else if (isRecovery) {
    targetHR = hr && !/n\/a/i.test(hr) ? hr : "โซน 1–2 · หายใจสบาย คุยได้";
  } else {
    targetHR = hr && !/n\/a/i.test(hr) ? hr : derived.easyHrTarget;
  }

  return {
    day: cleanText(workout.day) || (index === 0 ? "วันนี้" : `วันที่ ${index + 1}`),
    workoutType: type,
    distanceKm: (isRest || isStrength) ? null : typeof workout.distanceKm === "number" ? workout.distanceKm : derived.easyDistanceKm,
    durationMin: typeof workout.durationMin === "number" ? workout.durationMin : isStrength ? 25 : isRest ? 20 : null,
    targetPace,
    targetHR,
    purpose: cleanText(workout.purpose) || (isRest ? "ลดความล้าและคุมความเสี่ยงเจ็บซ้ำ" : "สะสมความฟิตให้พร้อมสำหรับวันแข่ง"),
    adjustment: cleanText(workout.adjustment) || derived.defaultAdjustment,
    description: cleanText(workout.description) || (isRest ? "เดินเบา ๆ หรือ mobility สั้น ๆ ถ้าไม่เจ็บ" : "วิ่งคุมแรงแบบยังพูดเป็นประโยคได้"),
  };
}

// Round a pace string like "6:57–8:01/km" or "6:57-8:01" to nearest-5-second boundaries
function roundPacePlanStr(raw: string): string {
  const rangeM = raw.match(/(\d+:\d{2})\s*[–\-]\s*(\d+:\d{2})/);
  if (rangeM) {
    const lo = parsePaceToSeconds(rangeM[1]);
    const hi = parsePaceToSeconds(rangeM[2]);
    if (lo && hi) return `${formatPace(lo)}–${formatPace(hi)}/km`;
  }
  const singleM = raw.match(/(\d+:\d{2})/);
  if (singleM) {
    const s = parsePaceToSeconds(singleM[1]);
    if (s) return `${formatPace(s)}/km`;
  }
  return raw;
}

function applyInjurySafety(plan: WeekWorkout[], ctx: CoachContext | undefined, derived: DerivedPlanInputs): WeekWorkout[] {
  return plan.map((workout, index) => applyWorkoutSafety(workout, ctx, derived, index));
}

function applyWorkoutSafety(workout: WeekWorkout, ctx: CoachContext | undefined, derived: DerivedPlanInputs, index = 0): WeekWorkout {
  const latest = ctx?.latestPain;
  const recentMax = ctx?.recentMaxPain;
  const currentPain = latest?.painLevel ?? 0;
  const recentMaxPain = recentMax?.painLevel ?? currentPain;
  const redFlag = hasRedFlag(latest) || hasRedFlag(recentMax);
  const hardType = /tempo|interval|hill|speed|threshold|long run|race pace|เร็ว|อินเทอร์|ยาว/i.test(workout.workoutType);

  if (currentPain >= 3 || redFlag) {
    return {
      ...workout,
      workoutType: index === 0 ? "Recovery / Walk + Mobility" : "Recovery",
      distanceKm: null,
      durationMin: 20,
      targetPace: null,
      targetHR: "ไม่เน้น HR วันนี้",
      purpose: "ให้เนื้อเยื่อฟื้นตัวก่อนกลับไปเพิ่มโหลด",
      adjustment: `ล่าสุด${painLabel(latest)} ${currentPain}/10 จึงงด tempo, interval, hill และ long run`,
      description: "เดินเบา ๆ 15-25 นาทีหรือ mobility ถ้าไม่เจ็บ เพิ่มประคบเย็นเฉพาะจุดหลังใช้งาน",
    };
  }

  if (hardType && currentPain >= 1 && recentMaxPain >= 3) {
    return {
      ...workout,
      workoutType: "Easy Run / Recovery",
      distanceKm: Math.min(workout.distanceKm ?? derived.easyDistanceKm, derived.easyDistanceKm),
      durationMin: workout.durationMin ?? 25,
      targetPace: derived.paceGuidance.recovery ?? null,
      targetHR: derived.easyHrTarget,
      purpose: "คุมโหลดหลังมีประวัติปวดในช่วงล่าสุด",
      adjustment: `ล่าสุด${painLabel(latest)} ${currentPain}/10 แต่ช่วง 3 วันที่ผ่านมาเคยขึ้นถึง ${recentMaxPain}/10 ถ้าวอร์มแล้วยังเจ็บให้หยุด`,
      description: "วิ่ง/เดินแบบสบายมาก ไม่เร่ง pace และหยุดทันทีถ้าอาการเพิ่ม",
    };
  }

  return workout;
}

type DerivedPlanInputs = {
  currentPhase: string;
  weeklyFocus: string;
  planSummary: string;
  targetWeekKm: number | null;
  longRunKm: number | null;
  easyDistanceKm: number;
  defaultTodayType: string;
  defaultAdjustment: string;
  easyHrTarget: string;
  paceGuidance: NonNullable<RacePlan["paceGuidance"]>;
};

function derivePlanInputs(goal: RaceGoal, ctx: CoachContext | undefined, _todayStr: string, daysUntilRace: number | null): DerivedPlanInputs {
  const currentPhase = phaseFromDays(daysUntilRace);
  const recentWeeklyKm = ctx?.totalRunKm ?? 0;
  const longestRecent = ctx?.longestRun7dKm ?? goal.currentLongestRunKm ?? null;
  const targetWeekKm = recentWeeklyKm > 0 ? Math.max(8, Math.round(recentWeeklyKm * 1.05)) : goal.currentLongestRunKm ? Math.round(goal.currentLongestRunKm * 2.2) : null;
  const longRunKm = daysUntilRace != null && daysUntilRace <= 7
    ? Math.min(5, longestRecent ?? 5)
    : longestRecent != null
      ? Math.round(Math.min(longestRecent + 1, Math.max(longestRecent, (targetWeekKm ?? longestRecent) * 0.35)) * 10) / 10
      : null;
  const easyDistanceKm = Math.max(3, Math.min(6, Math.round(((targetWeekKm ?? 18) / 4) * 10) / 10));
  const paceGuidance = buildPaceGuidance(goal, ctx);
  const latestPain = ctx?.latestPain;
  const recentMaxPain = ctx?.recentMaxPain;
  const defaultTodayType = defaultWorkoutType(currentPhase, latestPain, recentMaxPain, ctx);
  const sleepNote = ctx?.avgReadiness != null ? `readiness เฉลี่ย ${ctx.avgReadiness}` : "ยังไม่มี readiness เฉลี่ย";
  const painNote = latestPain
    ? latestPain.hasResolvedPain
      ? `ล่าสุดบันทึกว่าอาการเจ็บ${painLabel(latestPain)}หายแล้ว`
      : `ล่าสุด${painLabel(latestPain)} ${latestPain.painLevel}/10`
    : "ไม่มี pain log ล่าสุด";

  return {
    currentPhase,
    weeklyFocus: weeklyFocusForPhase(currentPhase),
    planSummary: `แผนนี้เริ่มจากข้อมูลจริงล่าสุด (${sleepNote}, ${painNote}) และปรับให้เข้ากับเป้าหมาย ${goal.raceDistance} ${goal.targetTime ? `เวลา ${goal.targetTime}` : goal.goalType}. โฟกัสคือซ้อมพอดีตัว รักษาความสด และไม่เพิ่มความเสี่ยงเจ็บก่อนวันแข่ง`,
    targetWeekKm,
    longRunKm,
    easyDistanceKm,
    defaultTodayType,
    defaultAdjustment: "ถ้านอนน้อย ปวดเพิ่ม หรือ HR ลอยผิดปกติ ให้ลดเป็นเดิน/mobility",
    easyHrTarget: deriveEasyHrTarget(ctx),
    paceGuidance,
  };
}

function buildDefaultWeeklyPlan(derived: DerivedPlanInputs, goal: RaceGoal, ctx: CoachContext | undefined, todayStr: string): WeekWorkout[] {
  const raceSoon = ctx?.isRaceToday || ctx?.isRaceTomorrow || ctx?.isRaceWeek;
  const hardAllowed = !raceSoon && !hasRecentInjuryConstraint(ctx);
  const longRunDay = goal.preferredLongRunDay || "อาทิตย์";
  const days = Array.from({ length: 7 }, (_, index) => dayNameFrom(todayStr, index));

  return days.map((day, index): WeekWorkout => {
    if (index === 0) return defaultTodayWorkout(derived, ctx);
    if (raceSoon && index <= 2) {
      return {
        day,
        workoutType: ctx?.isRaceToday && index === 1 ? "Post-race Recovery" : "Shakeout / Recovery",
        distanceKm: ctx?.isRaceToday ? null : 3,
        durationMin: ctx?.isRaceToday ? 20 : null,
        targetPace: derived.paceGuidance.recovery ?? null,
        targetHR: "ไม่เน้น HR",
        purpose: "รักษาความสดใน race week",
        adjustment: "ถ้าขาหนักหรือเจ็บ ให้เปลี่ยนเป็นพัก",
        description: "เบามาก เน้นคลายขา ไม่สร้างความล้าใหม่",
      };
    }
    if (day === longRunDay && !raceSoon) {
      return {
        day,
        workoutType: hardAllowed ? "Long Run" : "Easy Run / Recovery",
        distanceKm: hardAllowed ? derived.longRunKm : derived.easyDistanceKm,
        durationMin: null,
        targetPace: (hardAllowed ? derived.paceGuidance.longRun : derived.paceGuidance.recovery) ?? null,
        targetHR: derived.easyHrTarget,
        purpose: "เพิ่ม endurance สำหรับระยะเป้าหมาย",
        adjustment: "ลด 20-30% ถ้านอนแย่หรือปวดเพิ่ม",
        description: "คุมแรงสบาย ไม่เร่งท้ายถ้าร่างกายยังล้า",
      };
    }
    if (hardAllowed && index === 3) {
      return {
        day,
        workoutType: derived.currentPhase === "Sharpen" ? "Intervals" : "Tempo",
        distanceKm: 5,
        durationMin: null,
        targetPace: (derived.currentPhase === "Sharpen" ? derived.paceGuidance.interval : derived.paceGuidance.tempo) ?? null,
        targetHR: "คุมไม่ให้หลุดฟอร์ม",
        purpose: "ฝึกความเร็วเฉพาะเป้าหมายโดยไม่อัดเกิน",
        adjustment: "ถ้าเริ่มเจ็บหรือ HR สูงผิดปกติ ให้เปลี่ยนเป็น easy 25 นาที",
        description: derived.currentPhase === "Sharpen"
          ? "วอร์ม 10 นาที แล้วทำ 400-600 ม. สั้น ๆ 4-6 เที่ยว พักเดิน/จ็อกครบ"
          : "วอร์ม 10 นาที แล้ว tempo คุมได้ 12-18 นาที ปิดด้วยคูลดาวน์",
      };
    }
    if (index === 2 || index === 5) return defaultRestWorkout(day);
    return {
      day,
      workoutType: "Easy Run",
      distanceKm: derived.easyDistanceKm,
      durationMin: null,
      targetPace: derived.paceGuidance.easy ?? null,
      targetHR: derived.easyHrTarget,
      purpose: "สะสม aerobic base โดยไม่กดระบบประสาท",
      adjustment: "ถ้ารู้สึกล้าหรือปวด ให้ลดเป็นเดิน 20-30 นาที",
      description: "วิ่งแบบคุยได้สบาย จบแล้วยังรู้สึกเหลือแรง",
    };
  });
}

function defaultTodayWorkout(derived: DerivedPlanInputs, ctx: CoachContext | undefined): WeekWorkout {
  if (ctx?.isRaceToday) {
    return {
      day: "วันนี้",
      workoutType: "Race Day",
      distanceKm: null,
      durationMin: null,
      targetPace: derived.paceGuidance.interval ?? null,
      targetHR: "เริ่มคุมแรง ไม่ไล่ HR ตั้งแต่กิโลแรก",
      purpose: "วิ่งตามเป้าหมายโดยไม่ออกตัวแรงเกิน",
      adjustment: "ถ้าวอร์มแล้วเจ็บ ให้ลดเป้าหมายเป็นจบปลอดภัย",
      description: "วอร์ม 10-15 นาที ทำ strides สั้น ๆ 3-4 ครั้ง แล้วออกตัวคุม pace ช่วงแรก",
    };
  }
  return {
    day: "วันนี้",
    workoutType: derived.defaultTodayType,
    distanceKm: /rest|recovery|walk|พัก|ฟื้น/i.test(derived.defaultTodayType) ? null : derived.easyDistanceKm,
    durationMin: /rest|recovery|walk|พัก|ฟื้น/i.test(derived.defaultTodayType) ? 20 : null,
    targetPace: (/rest|recovery|walk|พัก|ฟื้น/i.test(derived.defaultTodayType) ? derived.paceGuidance.recovery : derived.paceGuidance.easy) ?? null,
    targetHR: /rest|recovery|walk|พัก|ฟื้น/i.test(derived.defaultTodayType) ? "ไม่เน้น HR" : derived.easyHrTarget,
    purpose: "ให้วันนี้ช่วยพาไปถึง race goal โดยไม่สะสมความล้าเกิน",
    adjustment: derived.defaultAdjustment,
    description: /rest|recovery|walk|พัก|ฟื้น/i.test(derived.defaultTodayType)
      ? "เดินเบา ๆ หรือ mobility 15-25 นาที ถ้าไม่เจ็บ"
      : "วิ่ง easy แบบคุยได้สบาย และหยุดถ้าอาการเจ็บเพิ่ม",
  };
}

function defaultRestWorkout(day: string): WeekWorkout {
  return {
    day,
    workoutType: "Rest / Mobility",
    distanceKm: null,
    durationMin: 15,
    targetPace: null,
    targetHR: "ไม่เน้น HR",
    purpose: "ฟื้นตัวเพื่อให้ซ้อมวันถัดไปมีคุณภาพ",
    adjustment: "ถ้ายังล้าให้พักเต็มวัน",
    description: "mobility เบา ๆ หรือพักเต็มวัน",
  };
}

function buildPaceGuidance(goal: RaceGoal, ctx: CoachContext | undefined): NonNullable<RacePlan["paceGuidance"]> {
  const targetPaceSec = targetRacePaceSeconds(goal) ?? parsePaceToSeconds(ctx?.latestCompletedRace?.actualPace) ?? parsePaceToSeconds(ctx?.lastRun?.pace);
  const profileEasyPace = readString(ctx?.profile, ["easyPace", "easy_pace"]);
  if (!targetPaceSec) {
    return {
      recovery: "ช้ามากแบบหายใจสบาย",
      easy: profileEasyPace || "คุยได้สบาย",
      longRun: profileEasyPace || "easy + ช้ากว่าเล็กน้อย",
      tempo: "เร็วแบบคุมได้ ไม่ฝืน",
      interval: "สั้น เร็ว แต่ฟอร์มไม่หลุด",
    };
  }
  return {
    recovery: paceRange(targetPaceSec + 140, targetPaceSec + 220),
    easy: profileEasyPace || paceRange(targetPaceSec + 100, targetPaceSec + 160),
    longRun: paceRange(targetPaceSec + 120, targetPaceSec + 180),
    tempo: paceRange(targetPaceSec + 35, targetPaceSec + 65),
    interval: paceRange(targetPaceSec - 10, targetPaceSec + 15),
  };
}

function buildHistorySummary(ctx: CoachContext): string {
  const lines: string[] = [];

  if (ctx.sleep7d.length > 0) {
    lines.push(`การนอน (${ctx.sleep7d.length} คืน):`);
    for (const s of ctx.sleep7d.slice(0, 7)) {
      const parts = [s.date, s.durationH && `นอน ${s.durationH}`, s.readiness && `readiness ${s.readiness}`].filter(Boolean);
      lines.push(`  - ${parts.join(", ")}`);
    }
    if (ctx.sleepAvg7dText) lines.push(`  Sleep avg 7d source of truth: ${ctx.sleepAvg7dText} from ${ctx.sleepNightCount7d} deduped night(s).`);
    if (ctx.avgReadiness != null) lines.push(`  เฉลี่ย readiness: ${ctx.avgReadiness}`);
  }

  if (ctx.workouts7d.length > 0) {
    lines.push(`\nการซ้อม (${ctx.totalSessions} sessions, วิ่งรวม ${ctx.totalRunKm} km):`);
    for (const day of ctx.workouts7d) {
      const parts: string[] = [`  - ${day.date}:`];
      for (const r of day.runs) parts.push(`วิ่ง ${Number(r.km).toFixed(2)}km${r.avgHR ? ` HR${r.avgHR}` : ""}${r.pace ? ` pace ${r.pace}` : ""}`);
      for (const o of day.other) parts.push(`${o.label} ${o.durationMin}min`);
      lines.push(parts.join(" | "));
    }
  }

  if (ctx.latestPain) {
    if (ctx.latestPain.hasResolvedPain) {
      lines.push(`\nResolved pain: ${ctx.latestPain.painLocation} marked resolved (${ctx.latestPain.resolvedAt ?? ctx.latestPain.date}). Use gradual ramp-up, not active injury wording.`);
    } else {
      lines.push(`\nCurrent pain: ${ctx.latestPain.painLocation} ${ctx.latestPain.painLevel}/10 (${ctx.latestPain.date})`);
    }
    if (ctx.recentMaxPain && ctx.recentMaxPain.painLevel > ctx.latestPain.painLevel) {
      lines.push(`Recent max pain safety context: ${ctx.recentMaxPain.painLocation} ${ctx.recentMaxPain.painLevel}/10`);
    }
  }

  if (ctx.latestBody) {
    const b = ctx.latestBody;
    const bodyParts = [b.weightKg && `น้ำหนัก ${b.weightKg} kg`, b.bodyFatPct && `ไขมัน ${b.bodyFatPct}%`, b.muscleKg && `กล้ามเนื้อ ${b.muscleKg} kg`].filter(Boolean);
    if (bodyParts.length) lines.push(`\nร่างกาย: ${bodyParts.join(", ")}`);
  }

  if (ctx.contextNotes.length) {
    lines.push(`\nCoach context notes:`);
    for (const note of ctx.contextNotes.slice(0, 8)) lines.push(`  - ${note}`);
  }

  return lines.join("\n") || "ไม่มีข้อมูล";
}

function formatPainContext(ctx: CoachContext | undefined) {
  if (!ctx?.latestPain) return "No current pain log.";
  const latest = ctx.latestPain;
  const max = ctx.recentMaxPain;
  const parts = [latest.hasResolvedPain
    ? `Latest pain resolved: ${latest.painLocation} on ${latest.resolvedAt ?? latest.date}. Use gradual ramp-up wording.`
    : `Latest pain: ${latest.painLocation} ${latest.painLevel}/10 on ${latest.date}`];
  if (max && max.painLevel > latest.painLevel) {
    parts.push(`Recent max pain: ${max.painLocation} ${max.painLevel}/10. Use as safety history only.`);
  }
  if (hasRedFlag(latest) || hasRedFlag(max)) parts.push("Red flag symptoms exist. Avoid running.");
  return parts.join("\n");
}

function phaseFromDays(daysUntilRace: number | null): string {
  if (daysUntilRace == null) return "Build";
  if (daysUntilRace < 0) return "Recovery";
  if (daysUntilRace <= 7) return "Race Week";
  if (daysUntilRace <= 14) return "Taper";
  if (daysUntilRace <= 28) return "Sharpen";
  if (daysUntilRace <= 56) return "Build";
  return "Base";
}

function weeklyFocusForPhase(phase: string): string {
  if (phase === "Race Week") return "รักษาความสด ลดโหลด และซ้อมเฉพาะที่ไม่สร้างความล้า";
  if (phase === "Taper") return "ลดปริมาณ คงความคม และฟื้นตัวให้ทันวันแข่ง";
  if (phase === "Sharpen") return "เติมความเร็วเฉพาะเป้าหมายแบบคุมโหลด";
  if (phase === "Base") return "สร้างฐาน aerobic และความสม่ำเสมอ";
  if (phase === "Recovery") return "ฟื้นตัวหลังแข่งและประเมินร่างกาย";
  return "เพิ่มความทนทานและซ้อมเฉพาะเป้าหมายอย่างค่อยเป็นค่อยไป";
}

function defaultWorkoutType(phase: string, latestPain: PainSummary | null | undefined, recentMax: PainSummary | null | undefined, ctx: CoachContext | undefined) {
  if (!latestPain?.hasResolvedPain && ((latestPain?.painLevel ?? 0) >= 3 || hasRedFlag(latestPain))) return "Recovery / Walk + Mobility";
  if (!latestPain?.hasResolvedPain && (latestPain?.painLevel ?? 0) >= 1 && (recentMax?.painLevel ?? 0) >= 3) return "Easy Run / Recovery";
  if (ctx?.avgReadiness != null && ctx.avgReadiness < 70) return "Recovery";
  if (phase === "Race Week") return ctx?.isRaceToday ? "Race Day" : "Shakeout / Easy";
  return "Easy Run";
}

function hasRecentInjuryConstraint(ctx: CoachContext | undefined) {
  const latest = ctx?.latestPain;
  const max = ctx?.recentMaxPain;
  return (!latest?.hasResolvedPain && ((latest?.painLevel ?? 0) >= 3 || ((latest?.painLevel ?? 0) >= 1 && (max?.painLevel ?? 0) >= 3)))
    || hasRedFlag(latest)
    || hasRedFlag(max);
}

function hasRedFlag(pain: PainSummary | null | undefined) {
  if (!pain) return false;
  return pain.canBearWeight === "no" || pain.swellingOrRedness === "yes" || pain.redFlags.length > 0 || pain.painType.some((type) => /sharp|ชา|แปลบ/i.test(type));
}

function deriveEasyHrTarget(ctx: CoachContext | undefined) {
  const cap = readString(ctx?.profile, ["easyHrCap", "easy_hr_cap"]);
  if (cap) return /hr|bpm/i.test(cap) ? cap : `HR ไม่เกิน ${cap}`;
  const maxHr = readNumber(ctx?.profile, ["maxHR", "max_hr"]);
  if (maxHr) return `HR ประมาณ ${Math.round(maxHr * 0.65)}-${Math.round(maxHr * 0.75)} bpm`;
  return "คุยได้เป็นประโยค";
}

function targetRacePaceSeconds(goal: RaceGoal) {
  const total = parseTimeToSeconds(goal.targetTime);
  const km = distanceKm(goal.raceDistance);
  return total && km ? Math.round(total / km) : null;
}

function parseTimeToSeconds(value: string | undefined) {
  if (!value) return null;
  const parts = value.trim().split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function parsePaceToSeconds(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[':](\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function paceRange(fromSec: number, toSec: number) {
  const fast = Math.max(180, Math.min(fromSec, toSec));
  const slow = Math.max(180, Math.max(fromSec, toSec));
  return `${formatPace(fast)}-${formatPace(slow)}/km`;
}

function formatPace(seconds: number) {
  const rounded = Math.round(seconds / 5) * 5;
  const min = Math.floor(rounded / 60);
  const sec = String(rounded % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function distanceKm(distance: RaceGoal["raceDistance"]) {
  if (distance === "5K") return 5;
  if (distance === "10K") return 10;
  if (distance === "Half Marathon") return 21.1;
  if (distance === "Full Marathon") return 42.2;
  return null;
}

function buildPhaseOverview(totalWeeks: number, currentPhase: string) {
  if (totalWeeks <= 1) {
    return [{ name: "Race Week", weekRange: "1", focus: "ลดโหลดและรักษาความสด", notes: "ไม่มีเวลาสร้าง fitness ใหม่แล้ว เน้นความพร้อมวันแข่ง" }];
  }
  return [
    { name: currentPhase, weekRange: `1-${Math.max(1, totalWeeks - 1)}`, focus: weeklyFocusForPhase(currentPhase), notes: "ปรับจากข้อมูลซ้อมจริงและสัญญาณร่างกายล่าสุด" },
    { name: "Race Week", weekRange: String(totalWeeks), focus: "ลดโหลด รักษาความสด และเตรียม race execution", notes: "ซ้อมสั้นลง เน้นหลับ กิน และความมั่นใจ" },
  ];
}

function buildSafetyNotes(ctx: CoachContext | undefined, derived: DerivedPlanInputs) {
  const latest = ctx?.latestPain;
  const max = ctx?.recentMaxPain;
  const notes = [`ใช้ pace guide: easy ${derived.paceGuidance.easy ?? "-"} และ recovery ${derived.paceGuidance.recovery ?? "-"}`];
  if (latest) {
    notes.push(`สถานะเจ็บล่าสุด: ${latest.painLocation} ${latest.painLevel}/10`);
    if (max && max.painLevel > latest.painLevel) notes.push(`ช่วง 3 วันที่ผ่านมาเคยขึ้นถึง ${max.painLevel}/10 ใช้เป็น safety context`);
  }
  notes.push("ถ้าปวดเพิ่ม ฟอร์มเปลี่ยน หรือ HR สูงผิดปกติ ให้ลดเป็น recovery/พัก");
  return notes.join(" · ");
}

function countdownText(days: number | null) {
  if (days == null) return "ยังไม่ทราบวันแข่ง";
  if (days < 0) return "แข่งเสร็จแล้ว";
  if (days === 0) return "วันนี้วันแข่ง";
  if (days === 1) return "เหลือ 1 วันถึงวันแข่ง";
  return `เหลือ ${days} วันถึงวันแข่ง`;
}

function todayBangkok() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dateDiffDays(fromDate: string, toDate: string): number | null {
  const from = Date.parse(`${fromDate}T12:00:00+07:00`);
  const to = Date.parse(`${toDate.slice(0, 10)}T12:00:00+07:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / DAY_MS);
}

function dayNameFrom(today: string, offset: number) {
  const date = new Date(Date.parse(`${today}T12:00:00+07:00`) + offset * DAY_MS);
  return new Intl.DateTimeFormat("th-TH", { weekday: "short", timeZone: "Asia/Bangkok" }).format(date);
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readString(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(source: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!source) return null;
  for (const key of keys) {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function painLabel(pain: PainSummary | null | undefined) {
  return pain?.painLocation ? `เจ็บ${pain.painLocation}` : "อาการเจ็บ";
}
