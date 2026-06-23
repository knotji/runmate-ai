import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { CoachContext, TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";
import type { DailyCoachInsight } from "@/types/ai";

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

export async function POST(request: Request) {
  try {
    const ctx: CoachContext = await request.json();
    if (process.env.NODE_ENV === "development") {
      console.info("[context-debug]", {
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
    const system = profileCtx ? `${SYSTEM_PROMPT}\n\n${profileCtx}` : SYSTEM_PROMPT;

    const result = await jsonFromAI<DailyCoachInsight>({
      system,
      user: buildUserPrompt(ctx),
      fallback: FALLBACK,
    });

    return NextResponse.json({
      ...result,
      data: applyPostWorkoutRecoveryGuard(applyTodayPainGuard(result.data, ctx), ctx),
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[today-analysis-error]", error);
    }
    return NextResponse.json({ data: FALLBACK, error: "today analysis failed" });
  }
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
    const lastRunKm = typeof ctx.lastRun.km === "number" ? ctx.lastRun.km.toFixed(2) : String(ctx.lastRun.km ?? "?");
    lines.push(`Last run: ${ctx.lastRun.date}, ${lastRunKm} km, ${ctx.lastRun.durationMin} min, HR ${ctx.lastRun.avgHR ?? "unknown"}, pace ${ctx.lastRun.pace ?? "unknown"}`);
  }

  if (ctx.workouts7d.length === 0) {
    lines.push("- ไม่มีข้อมูล");
  } else {
    for (const day of ctx.workouts7d) {
      const parts: string[] = [`${day.date}:`];
      for (const r of day.runs) {
        parts.push(`วิ่ง ${Number(r.km).toFixed(2)}km ${r.durationMin}min${r.avgHR ? ` HR${r.avgHR}` : ""}${r.pace ? ` pace${r.pace}` : ""}`);
      }
      for (const w of day.walks) {
        parts.push(`เดิน${w.km != null ? ` ${Number(w.km).toFixed(2)}km` : ""} ${w.durationMin}min`);
      }
      for (const o of day.other) {
        parts.push(`${o.label} ${o.durationMin}min`);
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

  return lines.join("\n");
}

function applyPostWorkoutRecoveryGuard(insight: DailyCoachInsight, ctx: CoachContext): DailyCoachInsight {
  const workout = ctx.todayPrimaryWorkout;
  if (!ctx.hasWorkoutToday || !workout) return insight;

  const workoutLine = formatWorkoutShortThai(workout);
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
    `${workoutLine} วันนี้ให้เปลี่ยนโหมดเป็นฟื้นตัวก่อน`,
    hydrationLine,
    nutritionLine,
    mobilityLine,
    sleepLine,
    painLine ? `เช็กอาการ: ${painLine}` : "ถ้ามีอาการเจ็บเพิ่ม ให้ลดการเดินเยอะและพักมากขึ้น",
  ].filter(Boolean).slice(0, 6).join(" ");

  return {
    ...insight,
    workoutRec: postWorkoutTitle(workout),
    workoutTarget: "ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว",
    keyObservation,
    coachMessage,
  };
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
  if (latest.hasResolvedPain) {
    const resolvedLine = hasRecentSafetyHistory
      ? `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว แต่ช่วง 3 วันที่ผ่านมาเคยขึ้นถึง ${recentMax.painLevel}/10`
      : `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว`;
    return {
      ...cleaned,
      keyObservation: resolvedLine,
      coachMessage: `${resolvedLine} วันนี้ค่อย ๆ เพิ่มโหลดกลับได้แบบ conservative เริ่มจากเดิน/วอร์มอัปให้ไม่เจ็บก่อน หลีกเลี่ยงซ้อมหนักทันที และหยุดถ้าอาการกลับมาครับ`,
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
      coachMessage: `${contextLine} จึงยังให้ลดโหลดก่อน อาการดีขึ้นแล้ว แต่ควรคุมโหลดเพื่อไม่ให้กลับมาเจ็บซ้ำ Easy run ทำได้เฉพาะถ้าเดินและวอร์มอัปแล้วไม่เจ็บครับ`,
    };
  }

  if (latest.painLevel === 2) {
    return {
      ...cleaned,
      workoutRec: "Recovery / Walk + Mobility",
      workoutTarget: "เน้นฟื้นตัว · เดินเบา ๆ ถ้าไม่เจ็บ",
      keyObservation: painLine,
      coachMessage: `${contextLine} วันนี้ให้ conservative ไว้ก่อน ลดแรงกระแทกและดูอาการระหว่างวัน วิ่งได้เฉพาะแบบสั้นเบามากถ้าเดินกับวอร์มอัปแล้วไม่เจ็บครับ`,
    };
  }

  if (latest.painLevel >= 3 && latest.painLevel <= 4) {
    return {
      ...cleaned,
      workoutRec: "Rest / Recovery",
      workoutTarget: "Recovery Day · ไม่ต้องจับ pace",
      keyObservation: painLine,
      coachMessage: `${contextLine} วันนี้ไม่ควรวางวิ่งเป็น default ให้พักจากแรงกระแทกก่อน เลือก mobility เบา ๆ หรือเดินสั้น ๆ เฉพาะถ้าไม่ทำให้อาการเพิ่มครับ`,
    };
  }

  if (latest.painLevel >= 5) {
    return {
      ...cleaned,
      workoutRec: "งดวิ่ง / พักและประเมินอาการ",
      workoutTarget: "ไม่เน้น HR วันนี้ · พักจากการวิ่ง",
      keyObservation: painLine,
      coachMessage: `${contextLine} วันนี้งดวิ่งก่อนครับ ถ้าอาการยังไม่ดีขึ้น แย่ลง บวม แดง ชา หรือลงน้ำหนักลำบาก ควรพบแพทย์หรือนักกายภาพ`,
    };
  }

  return cleaned;
}

function formatWorkoutForPrompt(workout: TodayCompletedWorkoutSummary): string {
  const details = [
    workout.distanceKm != null ? `${workout.distanceKm.toFixed(2)} km` : null,
    workout.durationText ?? (workout.durationMin != null ? `${workout.durationMin} min` : null),
    workout.avgHR != null ? `avg HR ${workout.avgHR}` : null,
    workout.pace ? `pace ${workout.pace}` : null,
    workout.calories != null ? `${workout.calories} kcal` : null,
  ].filter(Boolean);
  return `${workout.label}${details.length ? ` (${details.join(", ")})` : ""}`;
}

function formatWorkoutShortThai(workout: TodayCompletedWorkoutSummary): string {
  const parts: string[] = [];
  if (workout.kind === "race") parts.push("วันนี้มี Race Result แล้ว");
  else if (workout.kind === "run") parts.push("วันนี้วิ่งไปแล้ว");
  else if (workout.kind === "strength") parts.push("วันนี้เวทไปแล้ว");
  else if (workout.kind === "walk") parts.push("วันนี้เดิน/ขยับตัวไปแล้ว");
  else parts.push(`วันนี้${workout.label}ไปแล้ว`);

  if (workout.distanceKm != null && workout.distanceKm > 0) parts.push(`${formatKm(workout.distanceKm)} km`);
  if (workout.durationText) parts.push(`เวลา ${workout.durationText}`);
  else if (workout.durationMin != null) parts.push(`เวลา ${workout.durationMin} นาที`);
  if (workout.avgHR != null) parts.push(`เฉลี่ย HR ${workout.avgHR}`);
  return parts.join(" ");
}

function postWorkoutTitle(workout: TodayCompletedWorkoutSummary): string {
  if (workout.kind === "race") return "Recovery หลัง Race วันนี้";
  if (workout.kind === "run") {
    return workout.distanceKm != null
      ? `ฟื้นตัวหลังวิ่ง ${formatKm(workout.distanceKm)} km`
      : "Recovery หลังวิ่งวันนี้";
  }
  if (workout.kind === "strength") return "ฟื้นตัวหลังเวทวันนี้";
  return "พักฟื้นหลังซ้อมวันนี้";
}

function buildHydrationLine(workout: TodayCompletedWorkoutSummary): string {
  const distance = workout.distanceKm ?? 0;
  const calories = workout.calories ?? 0;
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
      ? `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว แต่เคยขึ้นถึง ${recentMax.painLevel}/10 ในช่วงล่าสุด จึงยังค่อย ๆ เพิ่มโหลด`
      : `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว ค่อย ๆ เพิ่มโหลดกลับ`;
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

function formatKm(km: number): string {
  return Number.isInteger(km) ? String(km) : km.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
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
