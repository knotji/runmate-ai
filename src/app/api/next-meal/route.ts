import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { CoachContext, MealContextSummary } from "@/lib/buildCoachContext";
import type { DailyNutritionBalance } from "@/lib/dailyNutritionBalance";
import type { ReadinessV2Result } from "@/lib/readinessV2";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NextMealOption = {
  title: string;
  description: string;
  why: string;
  tags: string[];
  convenience: string;
};

export type NextMealRecommendation = {
  mealSlot: string;
  mealSlotLabel: string;
  summary: string;
  options: NextMealOption[];
  nutritionFocus: string[];
  caution: string | null;
  basedOn: string[];
};

export type NextMealResponse = {
  ok: boolean;
  recommendation: NextMealRecommendation;
  usedFallback?: boolean;
  errorCode?: string;
};

// ─── Meal slot inference ──────────────────────────────────────────────────────

function getBangkokHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  return parseInt(parts.find((p) => p.type === "hour")?.value ?? "12", 10);
}

const SLOT_LABELS: Record<string, string> = {
  breakfast: "มื้อเช้า",
  lunch: "มื้อกลางวัน",
  snack: "มื้อว่าง",
  dinner: "มื้อเย็น",
  recovery: "มื้อฟื้นตัว",
};

function inferMealSlot(
  ctx: Partial<CoachContext>,
  explicitSlot?: string,
): { slot: string; label: string } {
  if (explicitSlot && explicitSlot !== "auto") {
    return { slot: explicitSlot, label: SLOT_LABELS[explicitSlot] ?? explicitSlot };
  }

  const hour = getBangkokHour();
  const meals = (ctx.mealsToday ?? []) as MealContextSummary[];
  const mealTypes = meals.map((m) => m.mealType.toLowerCase());
  const hasBreakfast = mealTypes.some((t) => t.includes("เช้า") || t.includes("breakfast"));
  const hasLunch = mealTypes.some((t) => t.includes("กลางวัน") || t.includes("lunch"));
  const hasDinner = mealTypes.some((t) => t.includes("เย็น") || t.includes("dinner"));

  // Post-workout recovery meal takes priority
  if (ctx.hasWorkoutToday) {
    return { slot: "recovery", label: "มื้อฟื้นตัวหลังซ้อม" };
  }

  if (!hasBreakfast && hour < 10) return { slot: "breakfast", label: "มื้อเช้า" };
  if (!hasLunch && hour >= 10 && hour < 15) return { slot: "lunch", label: "มื้อกลางวัน" };
  if (hour >= 15 && hour < 17) return { slot: "snack", label: "มื้อว่าง" };
  if (!hasDinner && hour >= 17) return { slot: "dinner", label: "มื้อเย็น" };

  return { slot: "snack", label: "มื้อว่าง/เสริม" };
}

// ─── Fallback options ─────────────────────────────────────────────────────────

function buildFallback(
  slot: string,
  slotLabel: string,
  ctx: Partial<CoachContext>,
): NextMealRecommendation {
  const isRecovery = !ctx.hasWorkoutToday || slot === "recovery";
  const isPostStrength = ctx.todayPrimaryWorkout?.kind === "strength";
  const nb = ctx.nutritionBalanceToday as DailyNutritionBalance | null | undefined;
  const needProtein = nb?.proteinStatus === "low" || nb?.proteinStatus === "unknown";
  const basedOn: string[] = ["ข้อมูลล่าสุดจาก Report"];
  if (nb) basedOn.push("สัดส่วนอาหารวันนี้");
  if (ctx.hasWorkoutToday) basedOn.push("การซ้อมวันนี้");

  let options: NextMealOption[];

  if (isPostStrength || (ctx.hasWorkoutToday && needProtein)) {
    options = [
      { title: "ข้าวไก่ย่าง + ไข่ต้ม", description: "ข้าวสวย ไก่ย่างอก ไข่ต้ม 1–2 ฟอง", why: "โปรตีนสูง คาร์บพอดี เหมาะหลังเวท/วิ่ง", tags: ["โปรตีน", "คาร์บพอดี"], convenience: "ตามสั่ง" },
      { title: "อกไก่ + ข้าวกล้อง + กล้วย", description: "7-11 หรือทำเอง", why: "โปรตีนสูง คาร์บจากข้าวกล้องและกล้วย ฟื้นกล้ามเนื้อได้ดี", tags: ["โปรตีน", "คาร์บ", "7-11"], convenience: "7-11" },
      { title: "สุกี้น้ำไก่/เต้าหู้ + ผัก", description: "สุกี้น้ำแบบเบา ใส่ผักเยอะ", why: "ย่อยง่าย ได้โปรตีนและไฟเบอร์ ไม่หนักเกิน", tags: ["โปรตีน", "ผัก", "ย่อยง่าย"], convenience: "ตามสั่ง" },
    ];
  } else if (isRecovery || slot === "snack") {
    options = [
      { title: "ข้าวต้มไก่ + ไข่ต้ม", description: "ข้าวต้มอ่อน ไก่ฉีก ไข่ต้ม", why: "เบา ย่อยง่าย ฟื้นตัวได้ดีวันพัก", tags: ["ย่อยง่าย", "โปรตีน"], convenience: "ตามสั่ง" },
      { title: "โยเกิร์ตโปรตีน + กล้วย", description: "โยเกิร์ตกรีกหรือโปรตีน + กล้วยหอม", why: "เสริมโปรตีน คาร์บจากผลไม้ หาได้ง่าย", tags: ["โปรตีน", "ผลไม้", "7-11"], convenience: "7-11" },
      { title: "สลัดไก่/ทูน่า", description: "สลัดผักกับอกไก่หรือทูน่า", why: "ไขมันต่ำ ได้โปรตีนและไฟเบอร์ เหมาะวันพัก", tags: ["ไฟเบอร์", "โปรตีน", "คุมไขมัน"], convenience: "food court" },
    ];
  } else {
    options = [
      { title: "ข้าวไข่ดาว + ผักสด", description: "ข้าวสวย ไข่ดาว/ต้ม ผักสด", why: "สมดุลคาร์บและโปรตีน ราคาถูก หาง่าย", tags: ["สมดุล", "ตามสั่ง"], convenience: "ตามสั่ง" },
      { title: "ก๋วยเตี๋ยวน้ำไก่/เป็ด", description: "เส้นน้ำใส เนื้อไม่ทอด", why: "ย่อยง่าย คาร์บดี ไม่มันจัด", tags: ["ย่อยง่าย", "คาร์บ"], convenience: "ตามสั่ง" },
      { title: "ข้าวไก่กาแฟ 7-11 + ไข่ต้ม", description: "เมนู 7-11 หาได้ทุกที่", why: "โปรตีนพอ คาร์บพอดี สะดวกวันยุ่ง", tags: ["7-11", "สะดวก"], convenience: "7-11" },
    ];
  }

  return {
    mealSlot: slot,
    mealSlotLabel: slotLabel,
    summary: `คำแนะนำสำรองจากข้อมูล Report วันนี้${nb?.proteinStatus === "low" ? " — โปรตีนยังน้อย ควรเสริม" : ""}`,
    options,
    nutritionFocus: needProtein ? ["protein", "carbs"] : ["balance"],
    caution: null,
    basedOn,
  };
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const OUTPUT_CONTRACT = `
Return valid JSON only. No markdown. No text outside JSON.
{
  "mealSlot": "breakfast|lunch|dinner|snack|recovery|unknown",
  "summary": "string",
  "options": [
    {
      "title": "string",
      "description": "string",
      "why": "string",
      "tags": ["string"],
      "convenience": "ตามสั่ง|7-11|food court|ทำเอง|delivery|ทั่วไป"
    }
  ],
  "nutritionFocus": ["string"],
  "caution": "string|null",
  "basedOn": ["string"]
}
Exactly 3 options. Thai language. Mobile-friendly short text.`;

function buildPrompt(
  ctx: Partial<CoachContext>,
  slot: string,
  slotLabel: string,
  profileCtx: string,
  userIntent?: string,
): string {
  const lines: string[] = [];
  lines.push(`วันนี้: ${ctx.todayDate ?? "ไม่ทราบ"}`);
  lines.push(`มื้อแนะนำ: ${slotLabel}`);

  if (userIntent) lines.push(`\nความต้องการพิเศษ: ${userIntent}`);

  // Readiness
  const rv2 = ctx.readinessV2 as ReadinessV2Result | null | undefined;
  if (rv2) {
    lines.push(`\nReadiness วันนี้: ${rv2.score}/100 (${rv2.label})`);
    if (rv2.cap != null) lines.push(`- Pain cap: ใช้คะแนนสูงสุด ${rv2.cap} เพราะมีอาการเจ็บ`);
    lines.push(`- ${rv2.readinessNote}`);
  }

  // Today's workout/plan
  if (ctx.hasWorkoutToday && ctx.todayPrimaryWorkout) {
    const w = ctx.todayPrimaryWorkout;
    lines.push(`\nซ้อมวันนี้ (เสร็จแล้ว): ${w.kind}${w.distanceKm ? ` ${w.distanceKm}km` : ""}${w.durationMin ? ` ${w.durationMin}นาที` : ""}`);
    lines.push("- Rule: ต้องการโปรตีน + คาร์บฟื้นตัวหลังซ้อม");
  } else if (ctx.workouts7d && ctx.workouts7d.length > 0) {
    lines.push(`\nภาระซ้อม 7 วัน: ${ctx.totalRunKm ?? 0} km รวม`);
  } else {
    lines.push(`\nวันนี้: วันพัก/ไม่มีซ้อม`);
  }

  // Meals logged today
  const meals = (ctx.mealsToday ?? []) as MealContextSummary[];
  if (meals.length > 0) {
    lines.push(`\nมื้ออาหารวันนี้ (${meals.length} มื้อ):`);
    for (const m of meals.slice(0, 4)) {
      const foods = m.foods.slice(0, 5).join(", ");
      lines.push(`- ${m.mealType}: ${foods || "ไม่ระบุ"}`);
    }
    lines.push("- Rule: หลีกเลี่ยงอาหารซ้ำถ้าเป็นไปได้");
  } else {
    lines.push(`\nยังไม่มีมื้ออาหารวันนี้`);
  }

  // Nutrition balance
  const nb = ctx.nutritionBalanceToday as DailyNutritionBalance | null | undefined;
  if (nb && nb.mealCount > 0) {
    lines.push(`\nสัดส่วนอาหารวันนี้:`);
    lines.push(`- โปรตีน: ${nb.proteinStatus}, คาร์บ: ${nb.carbStatus}, ผัก: ${nb.veggieFiberStatus}`);
    lines.push(`- ทอด/มัน: ${nb.friedFatStatus}, น้ำตาล: ${nb.sugarStatus}`);
    if (nb.nextMealHints.length > 0) lines.push(`- คำแนะนำมื้อถัดไป: ${nb.nextMealHints.join("; ")}`);
    if (nb.healthCheckBiases.length > 0) lines.push(`- Health check note: ${nb.healthCheckBiases.join("; ")}`);
  }

  // Pain
  if (ctx.latestPain) {
    const p = ctx.latestPain;
    if (p.hasResolvedPain) {
      lines.push(`\nอาการเจ็บ: หายแล้ว (${p.painLocation})`);
    } else {
      lines.push(`\nอาการเจ็บ: ${p.painLocation} ${p.painLevel}/10 — ควรเลือกมื้อเบาและย่อยง่าย`);
    }
  }

  // Profile
  if (profileCtx) {
    lines.push(`\n${profileCtx}`);
  }

  lines.push(`\n${OUTPUT_CONTRACT}`);

  return lines.join("\n");
}

// ─── POST /api/next-meal ──────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      context?: Partial<CoachContext>;
      targetMealSlot?: string;
      userIntent?: string;
    };
    const ctx = body.context ?? {};
    const { slot, label } = inferMealSlot(ctx, body.targetMealSlot);
    const profileCtx = buildRunnerProfileContext(
      (ctx.profile as Parameters<typeof buildRunnerProfileContext>[0]) ?? null,
    );
    const fallback = buildFallback(slot, label, ctx);

    const system = [
      "You are RunMate AI, a Thai running nutrition coach.",
      "Recommend 3 practical next-meal options in Thai.",
      "Rules: exact 3 options, Thai language, practical Thai food, no scary medical language,",
      "do not say 'ห้ามกิน' except allergies, no supplements as default,",
      "respect allergy/avoid lists strictly, avoid foods already eaten today,",
      "tailor to training/recovery context.",
      "For health check concerns: use 'เลือกแบบเบากว่า' / 'ควรระวัง' wording only.",
    ].join(" ");

    const user = buildPrompt(ctx, slot, label, profileCtx, body.userIntent);

    const result = await jsonFromAI<NextMealRecommendation>({
      system,
      user,
      fallback,
    });

    const raw = result.data;
    const recommendation: NextMealRecommendation = {
      mealSlot: typeof raw.mealSlot === "string" ? raw.mealSlot : slot,
      mealSlotLabel: typeof raw.mealSlotLabel === "string" ? raw.mealSlotLabel : label,
      summary: typeof raw.summary === "string" ? raw.summary : fallback.summary,
      options: Array.isArray(raw.options) && raw.options.length >= 1
        ? raw.options.slice(0, 3).map((o) => ({
            title: typeof o.title === "string" ? o.title : "",
            description: typeof o.description === "string" ? o.description : "",
            why: typeof o.why === "string" ? o.why : "",
            tags: Array.isArray(o.tags) ? (o.tags as string[]).filter((t) => typeof t === "string") : [],
            convenience: typeof o.convenience === "string" ? o.convenience : "ทั่วไป",
          }))
        : fallback.options,
      nutritionFocus: Array.isArray(raw.nutritionFocus) ? (raw.nutritionFocus as string[]) : fallback.nutritionFocus,
      caution: typeof raw.caution === "string" ? raw.caution : null,
      basedOn: Array.isArray(raw.basedOn) ? (raw.basedOn as string[]) : fallback.basedOn,
    };

    return NextResponse.json({
      ok: !result.usedFallback,
      recommendation,
      usedFallback: Boolean(result.usedFallback),
      errorCode: result.errorCode,
    } satisfies NextMealResponse);
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn("[next-meal-error]", error);
    return NextResponse.json({
      ok: false,
      recommendation: buildFallback("snack", "มื้อว่าง", {}),
      usedFallback: true,
      errorCode: "CONTEXT_SCHEMA_ERROR",
    } satisfies NextMealResponse);
  }
}
