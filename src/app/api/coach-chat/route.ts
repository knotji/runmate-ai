import { NextResponse } from "next/server";
import { textFromAI } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { buildCoachResponseFormatInstruction } from "@/lib/coachPrompt";
import { coachChatPrompt } from "@/lib/prompts/coachChat";
import { createClient } from "@/lib/supabase/server";
import { saveCoachMessage, fetchPromptCoachMessages } from "@/lib/coachMessages";
import type { UserProfile } from "@/types/profile";

type ChatMessage = { role?: "user" | "assistant"; content?: string };

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const latest = String(body.messages?.at(-1)?.content ?? "");
    const context = body.context || {};
    const messages = hasActiveRaceGoal(context) ? body.messages || [] : removeStaleRaceMessages(body.messages || []);
    const dateTimeStr = bangkokDateTimeString();

    if (process.env.NODE_ENV === "development") {
      console.info("[coach-context-debug]", {
        hasProfile: Boolean((context as Record<string, unknown>).profile),
        recentHistoryCount: ((context as { sleep7d?: unknown[] }).sleep7d?.length ?? 0) + ((context as { workouts7d?: unknown[] }).workouts7d?.length ?? 0),
        hasActiveRace: Boolean((context as Record<string, unknown>).raceGoal),
        raceDate: (context as Record<string, unknown>).raceDate ?? null,
        isRaceToday: Boolean((context as Record<string, unknown>).isRaceToday),
        isRaceTomorrow: Boolean((context as Record<string, unknown>).isRaceTomorrow),
        sleepAvg7dText: (context as Record<string, unknown>).sleepAvg7dText ?? null,
        sleepNightCount7d: (context as Record<string, unknown>).sleepNightCount7d ?? null,
        latestSleepDateKey: (context as Record<string, unknown>).latestSleepDateKey ?? null,
        hasLatestHealthCheck: Boolean((context as Record<string, unknown>).latestHealthCheck),
        mealsTodayCount: Array.isArray((context as Record<string, unknown>).mealsToday) ? ((context as Record<string, unknown>).mealsToday as unknown[]).length : 0,
        activePain: Boolean((context as Record<string, unknown>).activePain),
        recentPainHistory: Boolean((context as Record<string, unknown>).recentPainHistory),
        painResolved: Boolean((context as Record<string, unknown>).painResolved),
        manualCurrentPainOverride: Boolean((context as Record<string, unknown>).manualCurrentPainOverride),
      });
    }

    const guardedReply = raceEveGuard(latest, context, dateTimeStr);
    if (guardedReply) {
      return NextResponse.json({ message: guardedReply, source: "guardrail" });
    }

    const profile = ((context as Record<string, unknown>)?.profile ?? null) as UserProfile | null;
    const responseDetail = profile?.responseDetail;
    const coachingTone = profile?.coachingTone;
    const imageDataUrl = body.imageDataUrl as string | undefined;
    const imageIntent = body.imageIntent as string | undefined;

    // Retrieve server-side Supabase client and user session
    const supabase = await createClient();
    let userId: string | undefined;
    if (supabase) {
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }

    // Save incoming user message to database in the background
    if (supabase && userId && latest) {
      void saveCoachMessage(supabase, {
        userId,
        role: "user",
        content: latest,
        metadata: {
          source: "coach_chat",
          dateKey: context.todayDate,
          painRecoveryStatus: context.painRecoveryStatus,
          readiness: context.overallScore,
          route: "coach",
          hasImage: !!imageDataUrl,
        },
      });
    }

    // Fetch prompt messages from database for context
    let recentChatPromptSection = "";
    if (supabase && userId) {
      const promptHistory = await fetchPromptCoachMessages(supabase, { userId, limit: 8 });
      if (promptHistory && promptHistory.length > 0) {
        const formattedMsgs = promptHistory.map((m) => {
          const roleLabel = m.role === "user" ? "User" : "Coach";
          return `${roleLabel}: ${m.content}`;
        }).join("\n");

        recentChatPromptSection = `
Recent Coach conversation:
${formattedMsgs}

Use recent chat only for continuity. Do not let chat history override today's recovery, pain, race, or safety guardrails.
`;
      }
    }

    let chatInstructions = buildCoachResponseFormatInstruction(profile?.language, responseDetail, Boolean(imageDataUrl), imageIntent);
    chatInstructions += buildToneInstruction(coachingTone);

    const imageIntentInstruction = imageIntent ? `
IMAGE INTENT HINT: "${imageIntent}".
- Treat this as a hint, not a rigid template.
- Answer the user's actual question about the image.
- Food/menu/label: give practical running nutrition advice; choose clearly if the user asks to choose.
- Run/sleep/body screenshot: summarize only the key visible metrics and explain what they mean.
- Injury/pain: do not diagnose; give conservative training guidance and red flags.
- Chat images are temporary and are not saved to Report.
` : "";

    const contextGuidance = buildContextGuidance(latest, context);
    const systemExtra = [
      `Current Bangkok date/time: ${dateTimeStr}`,
      buildLatestReportContextOverride(context),
      buildReadinessGuidance(context),
      buildRunnerProfileContext(profile),
      contextGuidance,
      `Context from Report/Profile/Race Goal:\n${JSON.stringify(context)}`,
      imageIntentInstruction,
      recentChatPromptSection,
    ].filter(Boolean).join("\n\n");

    // Slice to the last message to avoid duplication since history is injected in systemExtra
    const userMessage = messages.at(-1);
    const messagesForAI = userMessage ? [userMessage] : [];

    const result = await textFromAI({
      system: `${coachChatPrompt}\n\n${chatInstructions}\n\n${systemExtra}`,
      messages: messagesForAI as { role: "user" | "assistant"; content: string }[],
      imageDataUrl,
      fallback: fallbackCoachReply(latest),
    });

    // Save assistant reply to database in the background
    const assistantMessage = result.message;
    if (supabase && userId && assistantMessage) {
      void saveCoachMessage(supabase, {
        userId,
        role: "assistant",
        content: assistantMessage,
        metadata: {
          source: "coach_chat",
          model: result.source || "gemini",
          dateKey: context.todayDate,
          guardrailTone: context.guardrailTone,
          painRecoveryStatus: context.painRecoveryStatus,
        },
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[coach-chat-error]", error);
    }
    return NextResponse.json({ message: "โค้ชตอบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 200 });
  }
}

export function buildLatestReportContextOverride(context: unknown): string {
  const ctx = context as Record<string, unknown>;
  const lines = [
    "LATEST REPORT CONTEXT OVERRIDES CHAT HISTORY:",
    "- Treat the current Report/Profile/Race context below as the source of truth.",
    "- Ignore older sleep averages or health metrics mentioned in prior chat messages when they conflict with this context.",
    "- Recent chat history is lower priority than today's safety and recovery context. Never use chat history to override pain recovery, recovery score, sleep, load, race guardrails, or active injury guidance.",
    "- If recent chat says user wanted tempo but current painRecoveryStatus is active_pain/recent_pain/cleared_light, Coach must not recommend tempo.",
    "- If current recovery/sleep is low, Coach must not recommend hard workout just because prior chat discussed it.",
  ];
  const sleepAvg = stringValue(ctx.sleepAvg7dText);
  const sleepCount = numberValue(ctx.sleepNightCount7d);
  const latestSleep = stringValue(ctx.latestSleepDurationText);
  const latestSleepDate = stringValue(ctx.latestSleepDateKey);
  if (sleepAvg) {
    lines.push(`- Current sleepAvg7dText: ${sleepAvg}${sleepCount != null ? ` from ${sleepCount} deduped sleep night(s)` : ""}. Use this exact value if mentioning sleep average.`);
  } else {
    lines.push("- Current sleepAvg7dText: unavailable. Do not mention a numeric sleep average.");
  }
  if (latestSleep) {
    lines.push(`- Latest sleep: ${latestSleepDate ?? "latest"} duration ${latestSleep}.`);
  }
  return lines.join("\n");
}

function buildToneInstruction(coachingTone?: string) {
  if (coachingTone === "friendly" || coachingTone === "เป็นกันเอง") {
    return "\nCOACHING TONE: Friendly, practical, warm Thai tone. Avoid lecture style unless safety matters.";
  }
  if (coachingTone === "direct" || coachingTone === "ตรงๆ") {
    return "\nCOACHING TONE: Direct and concise Thai tone.";
  }
  if (coachingTone === "gentle" || coachingTone === "นุ่มนวล") {
    return "\nCOACHING TONE: Gentle and encouraging Thai tone.";
  }
  if (coachingTone === "strict" || coachingTone === "เข้มงวด") {
    return "\nCOACHING TONE: Structured and disciplined, but still conversational.";
  }
  return "";
}

function fallbackCoachReply(question: string) {
  const risky = /เจ็บ|ปวด|หน้ามืด|แน่นหน้าอก|วิงเวียน|เป็นลม|หายใจไม่ออก/.test(question);
  if (risky) {
    return "ขอให้หยุดซ้อมไว้ก่อนนะครับ อันนี้ไม่ใช่การวินิจฉัย แต่ถ้ามีอาการแย่ลง บวม ลงน้ำหนักไม่ได้ ชา หรือแน่นหน้าอก ควรปรึกษาแพทย์/นักกายภาพครับ";
  }
  return "ตอนนี้โค้ชตอบจากระบบไม่ได้ชั่วคราวครับ แต่คุยต่อได้เลย ถ้าเป็นเรื่องซ้อมให้เริ่มจากตัวเลือกที่ปลอดภัยก่อน: เบาลง พักให้พอ และอย่าฝืนถ้าร่างกายส่งสัญญาณล้า";
}

function raceEveGuard(question: string, context: unknown, dateTimeStr: string) {
  const normalizedQuestion = question.toLowerCase().replace(/\s+/g, "");
  const asksLongRun =
    normalizedQuestion.includes("longrun") ||
    normalizedQuestion.includes("ลองรัน") ||
    normalizedQuestion.includes("วิ่งยาว");

  const ctx = context as Record<string, unknown>;
  const raceIsSoon = Boolean(ctx.isRaceToday || ctx.isRaceTomorrow);
  const raceGoal = getRaceGoal(context);
  const latestRace = ctx.latestCompletedRace as { raceDate?: unknown } | null;
  const raceCompletedToday = latestRace?.raceDate && latestRace.raceDate === ctx.todayDate;

  if (!asksLongRun || !raceIsSoon || !raceGoal || raceCompletedToday) return "";

  return [
    `เวลาเช็คอิน: ${dateTimeStr}`,
    "ไม่ควร long run ครับ",
    "",
    "ถ้าวันแข่งอยู่วันนี้หรือพรุ่งนี้ เป้าหมายไม่ใช่สร้าง fitness เพิ่มแล้ว แต่คือเก็บขาให้สดและลดความเสี่ยงล้า",
    "",
    "ทางเลือกที่เหมาะกว่า:",
    "- พัก หรือเดินเบา 20-30 นาที",
    "- ถ้าขาสดจริง ๆ ทำ shakeout 2-4 km แบบสบายมาก",
    "- ไม่ tempo, ไม่ interval, ไม่เร่งท้าย",
    "- เติมน้ำ กินคาร์บย่อยง่าย และนอนให้พอ",
    "",
    "สรุป: วันนี้ชนะด้วยการไม่ซ่าครับ เก็บขาไว้ใช้วันแข่งดีกว่า",
  ].join("\n");
}

export function buildContextGuidance(question: string, context: unknown) {
  const ctx = context as Record<string, unknown>;
  const latestPain = readRecord(ctx.latestPain);
  const recentMaxPain = readRecord(ctx.recentMaxPain);
  const todayWorkout = readRecord(ctx.todayPrimaryWorkout);
  const sleepAvg7dText = stringValue(ctx.sleepAvg7dText);
  const sleepNightCount7d = numberValue(ctx.sleepNightCount7d);
  const latestSleepDurationText = stringValue(ctx.latestSleepDurationText);
  const latestSleepDateKey = stringValue(ctx.latestSleepDateKey);
  const latestSleepScore = numberValue(ctx.latestSleepScore);
  const latestEnergyScore = numberValue(ctx.latestEnergyScore);
  const latestHealthCheck = readRecord(ctx.latestHealthCheck);
  const mealsToday = Array.isArray(ctx.mealsToday) ? ctx.mealsToday : [];
  const mealRecommendation = isMealRecommendationQuestion(question);
  const manualCurrentPain = Boolean(ctx.manualCurrentPainOverride);
  const activePain = Boolean(ctx.activePain) || manualCurrentPain;
  const recentPainHistory = Boolean(ctx.recentPainHistory);
  const lines: string[] = [];

  if (!mealRecommendation) {
    if (sleepAvg7dText) {
      lines.push(`SLEEP SOURCE OF TRUTH: Current Report sleep average is ${sleepAvg7dText}${sleepNightCount7d != null ? ` from ${sleepNightCount7d} deduped sleep night(s)` : ""}. Never reuse older sleep averages from chat history.`);
    } else {
      lines.push("SLEEP SOURCE OF TRUTH: Current Report context has no sleep average. Do not invent or reuse old sleep averages.");
    }
    if (latestSleepDurationText) {
      lines.push(`LATEST SLEEP: ${latestSleepDateKey ?? "latest"} duration ${latestSleepDurationText}, sleep score ${latestSleepScore ?? "unknown"}, energy score ${latestEnergyScore ?? "unknown"}.`);
    }
  }

  if (!mealRecommendation && isSimpleFollowUp(question)) {
    lines.push("RESPONSE LENGTH HINT: This looks like a simple follow-up. Answer in 3-5 short Thai lines unless the user asks for detail.");
  }

  if (!mealRecommendation && isColdSoakQuestion(question)) {
    lines.push([
      "COLD SOAK ANSWER HINT:",
      "- Answer directly: ได้ครับ/ทำได้ครับ.",
      "- Say 10-15 minutes is enough.",
      "- Use comfortably cold water; avoid very icy water or lots of ice.",
      "- Rest the foot/light mobility after; no extra training today.",
      "- Mention latest pain first, recent max only as caution if relevant.",
      "- Add red-flag warning only if swelling/redness, numbness, worsening pain, cannot bear weight, or severe pain exists.",
    ].join("\n"));
  }

  if (manualCurrentPain && !mealRecommendation) {
    lines.push("CURRENT PAIN OVERRIDE: The user explicitly says they still have pain now. Treat pain as active, recommend rest/recovery, and do not let an older resolved Report status override this current statement.");
  }

  if (latestPain && !mealRecommendation) {
    const area = stringValue(latestPain.painLocation) ?? "อาการเจ็บ";
    const score = numberValue(latestPain.painLevel);
    const resolved = Boolean(latestPain.hasResolvedPain || latestPain.resolved || latestPain.status === "resolved");
    if (resolved && !manualCurrentPain) {
      lines.push(`PAIN WORDING HINT: Latest ${area} is marked resolved. Do not describe it as active injury; recommend gradual ramp-up and stop if symptoms return.`);
    } else if (resolved && manualCurrentPain) {
      lines.push(`PAIN WORDING HINT: Report marks the previous ${area} pain resolved, but the user currently reports pain again. Do not reuse the old resolved pain score as the current score.`);
    } else {
      lines.push(`PAIN WORDING HINT: Current/latest pain is ${area}${score != null ? ` ${score}/10` : ""}. Always mention this before older pain values.`);
    }
    const recentScore = numberValue(recentMaxPain?.painLevel);
    if (recentMaxPain && score != null && recentScore != null && recentScore > score) {
      lines.push(`RECENT MAX PAIN HINT: Recent max was ${recentScore}/10. Mention only as safety history, not as current pain.`);
    }
  }
  if (!mealRecommendation && recentPainHistory && !activePain) {
    lines.push("RECENT PAIN HISTORY ONLY: Latest pain is resolved. Use conservative easy/recovery ramp-up wording, but never say the user is currently injured or that injury status is active.");
  }

  if (todayWorkout) {
    const label = stringValue(todayWorkout.label) ?? stringValue(todayWorkout.kind) ?? "workout";
    const distance = numberValue(todayWorkout.distanceKm);
    const duration = stringValue(todayWorkout.durationText);
    lines.push(`TODAY WORKOUT HINT: User already completed ${label}${distance != null ? ` ${distance} km` : ""}${duration ? ` in ${duration}` : ""}. For recovery questions, do not recommend more hard training today.`);
  }

  if (mealRecommendation) {
    const mealSlot = detectMealSlot(question);
    const nutritionToday = readRecord(ctx.nutritionToday);
    const nutritionBalance = readRecord(ctx.nutritionBalanceToday);
    lines.push([
      "PERSONALIZED MEAL RECOMMENDATION MODE:",
      "- FOOD INTENT OVERRIDES unrelated sleep, pain, cold-soak, and general recovery instructions. Answer the meal request only.",
      `- Meal slot: ${mealSlot}.`,
      "- Answer in concise Thai: one principle line, exactly 3 numbered practical menu options, one short reason paragraph, and one small avoid/adjust note.",
      "- Use realistic Thai meals. Vary the main protein and cooking style.",
      "- Do not repeat the same main protein/menu style already logged today unless the user asks for it.",
      "- If the slot is unclear, call it 'มื้อนี้' and still give useful options without forcing a follow-up.",
      `- Suggested menu pool for this slot: ${mealExamples(mealSlot).join(" | ")}.`,
    ].join("\n"));
    if (mealsToday.length) {
      lines.push(`MEALS ALREADY LOGGED TODAY: ${mealsToday.map(formatMealContext).join(" | ")}.`);
      lines.push("- Briefly acknowledge the relevant earlier meal, then choose different first options.");
    } else {
      lines.push("MEALS ALREADY LOGGED TODAY: none. Do not invent an earlier meal. You may say 'ถ้ายังไม่ได้กินอะไรมาก่อน...'.");
    }
    if (nutritionBalance && numberValue(nutritionBalance.mealCount)) {
      const proteinStatus = stringValue(nutritionBalance.proteinStatus);
      const carbStatus = stringValue(nutritionBalance.carbStatus);
      const veggieStatus = stringValue(nutritionBalance.veggieFiberStatus);
      const friedStatus = stringValue(nutritionBalance.friedFatStatus);
      const sugarStatus = stringValue(nutritionBalance.sugarStatus);
      const varietyStatus = stringValue(nutritionBalance.varietyStatus);
      const repeatedItems = Array.isArray(nutritionBalance.repeatedItems) ? nutritionBalance.repeatedItems.filter((x): x is string => typeof x === "string") : [];
      const nextHints = Array.isArray(nutritionBalance.nextMealHints) ? nutritionBalance.nextMealHints.filter((x): x is string => typeof x === "string") : [];
      const hcBiases = Array.isArray(nutritionBalance.healthCheckBiases) ? nutritionBalance.healthCheckBiases.filter((x): x is string => typeof x === "string") : [];
      const balanceParts = [
        `protein=${proteinStatus}`,
        `carbs=${carbStatus}`,
        `veggie/fiber=${veggieStatus}`,
        `fried/fat=${friedStatus}`,
        `sugar=${sugarStatus}`,
      ].join(", ");
      lines.push([
        `DAILY NUTRITION BALANCE: ${balanceParts}. Variety=${varietyStatus}.`,
        repeatedItems.length ? `Repeated proteins/menus today: ${repeatedItems.join(", ")} — avoid these as first option.` : "",
        nextHints.length ? `Next meal hints from balance: ${nextHints.join("; ")}.` : "",
        hcBiases.length ? `Health check biases: ${hcBiases.join("; ")}.` : "",
        "Apply nutrition balance rules first before suggesting menus:",
        veggieStatus === "low" ? "- Veggie/fiber is low: include vegetables or fiber-rich food in this meal." : "",
        proteinStatus === "low" ? "- Protein is low: add lean non-fried protein (egg, fish, chicken, tofu)." : "",
        (friedStatus === "high" || friedStatus === "watch") ? "- Fried/fat is high/watch: avoid fried or greasy menu." : "",
        (sugarStatus === "high" || sugarStatus === "watch") ? "- Sugar is high/watch: avoid sweet drinks and desserts." : "",
        carbStatus === "high" ? "- Carbs are high: moderate carbs this meal, emphasize protein and vegetables." : "",
      ].filter(Boolean).join("\n"));
    } else if (nutritionToday) {
      lines.push(`NUTRITION TODAY ESTIMATE: meals=${numberValue(nutritionToday.mealCount) ?? mealsToday.length}, protein=${numberValue(nutritionToday.proteinG) ?? "unknown"} g, carbs=${numberValue(nutritionToday.carbsG) ?? "unknown"} g, fat=${numberValue(nutritionToday.fatG) ?? "unknown"} g.`);
    }
    if (todayWorkout) {
      lines.push("- Training context: a workout is already completed today. Include practical protein + carbs and hydration for recovery.");
    } else if (Boolean(ctx.isRaceToday || ctx.isRaceTomorrow)) {
      lines.push("- Training context: race today/tomorrow. Favor easy-to-digest carbs, moderate protein, hydration, and avoid greasy meals close to race.");
    } else if (latestPain) {
      lines.push("- Training context: recent pain/recovery context exists. Favor moderate carbs, non-fried protein, vegetables/fruit, and water.");
    } else {
      lines.push("- Training context: keep carbs proportional to training load and include protein plus vegetables.");
    }
  }

  if (latestHealthCheck && isFoodOrHealthNutritionQuestion(question)) {
    const flags = readRecord(latestHealthCheck.nutritionFlags);
    const guidance = readRecord(latestHealthCheck.foodGuidance);
    const keyLabs = Array.isArray(latestHealthCheck.keyLabs) ? latestHealthCheck.keyLabs : [];
    const activeFlags = Object.entries(flags ?? {}).filter(([, value]) => value === true).map(([key]) => key);
    const prefer = Array.isArray(guidance?.prefer) ? guidance.prefer.filter((item): item is string => typeof item === "string") : [];
    const limit = Array.isArray(guidance?.limit) ? guidance.limit.filter((item): item is string => typeof item === "string") : [];

    const asksAboutResults = /ผลตรวจ|สุขภาพ|ตรวจเลือด|ผลเลือด|แล็บ|lab|ค่าเลือด|ค่า ldl|คอเลส|triglyceride/i.test(question);
    if (asksAboutResults) {
      lines.push("HEALTH CHECK NUTRITION HINT: Latest health check is available. Use it only as cautious nutrition context, never as diagnosis or treatment.");
      if (activeFlags.length) lines.push(`Health caution flags: ${activeFlags.join(", ")}.`);
      if (keyLabs.length) {
        lines.push(`Key labs: ${keyLabs.slice(0, 8).map((lab) => {
          const record = readRecord(lab);
          return `${stringValue(record?.label) ?? "lab"} ${stringValue(record?.value) ?? "-"}${stringValue(record?.status) ? ` (${stringValue(record?.status)})` : ""}`;
        }).join("; ")}.`);
      }
      if (prefer.length) lines.push(`Prefer foods: ${prefer.slice(0, 5).join(", ")}.`);
      if (limit.length) lines.push(`Limit/caution foods: ${limit.slice(0, 5).join(", ")}.`);
    } else {
      const flagLabels: string[] = [];
      if (flags?.watchLDL || flags?.watchTotalCholesterol) flagLabels.push("watch LDL/Cholesterol");
      if (flags?.watchLiverEnzymes) flagLabels.push("watch liver enzymes");
      if (flags?.watchBloodSugar) flagLabels.push("watch blood sugar");
      if (flags?.watchUricAcid) flagLabels.push("watch uric acid");
      if (flags?.watchKidney) flagLabels.push("watch kidney values");

      const preferLabels = prefer.slice(0, 3).join(", ");
      const limitLabels = limit.slice(0, 3).join(", ");

      const parts = [
        flagLabels.length ? flagLabels.join(", ") : null,
        preferLabels ? `prefer ${preferLabels}` : null,
        limitLabels ? `limit ${limitLabels}` : null,
      ].filter(Boolean);

      lines.push(`Health check: ${parts.join("; ")}.`);
    }

    lines.push([
      "Translate flags into practical choices:",
      "- LDL/total cholesterol/triglyceride: non-fried fish/chicken/tofu/beans, vegetables, oats/whole grains; reduce fried food, crispy pork, processed meat, butter/cream, coconut-milk-heavy meals.",
      "- Blood sugar: balanced carbs + protein + fiber, unsweetened drinks; reduce sugary drinks/desserts and refined-carb-heavy meals.",
      "- Liver enzymes: lighter non-fried meals, vegetables, water; reduce alcohol and heavy fatty late meals.",
      "- Uric acid: balanced protein and hydration; reduce organ meats, alcohol, and high-purine-heavy patterns.",
      "- Kidney caution: do not push aggressive high-protein targets; suggest medical guidance for abnormal values.",
      "Use wording like 'จากผลตรวจล่าสุด ควรระวัง...' or 'ไม่ใช่ข้อห้ามเด็ดขาด แต่วันนี้เลือกแบบเบากว่าได้'. Never diagnose.",
    ].join("\n"));
  }

  return lines.length ? `Coach response guidance:\n${lines.join("\n")}` : "";
}

export function buildReadinessGuidance(context: unknown): string {
  const ctx = context as Record<string, unknown>;
  const activePain = Boolean(ctx.activePain);
  const recentPain = Boolean(ctx.recentPainHistory) || Boolean(ctx.painResolved);
  const painRecoveryStatus = stringValue(ctx.painRecoveryStatus as unknown) ?? null;
  const v2 = readRecord(ctx.readinessV2);
  const score = numberValue(v2?.score);
  const recSys = readRecord(ctx.recoverySystem);
  const axes = readRecord(recSys?.axes);
  const loadAxis = readRecord(axes?.load) as Record<string, unknown> | null;
  const recoveryAxis = readRecord(axes?.recovery) as Record<string, unknown> | null;
  const sleepAxis = readRecord(axes?.sleep) as Record<string, unknown> | null;
  const fuelAxis = readRecord(axes?.fuel) as Record<string, unknown> | null;
  const loadScore = numberValue(loadAxis?.score);
  const recoveryScore = numberValue(recoveryAxis?.score);
  const sleepScore = numberValue(sleepAxis?.score);
  const fuelScore = numberValue(fuelAxis?.score);
  const isRaceToday = Boolean(ctx.isRaceToday);
  const isRaceTomorrow = Boolean(ctx.isRaceTomorrow);
  const mealsToday = Array.isArray(ctx.mealsToday) ? (ctx.mealsToday as unknown[]).length : 0;
  const totalRunKm = numberValue(ctx.totalRunKm as unknown) ?? 0;

  // Derive band
  let band: string;
  if (activePain) {
    band = "pain_risk";
  } else if (score === null) {
    band = "yellow";
  } else if (score >= 66) {
    band = "green";
  } else if (score >= 50) {
    band = "yellow";
  } else {
    band = "red";
  }

  // Derive loadTarget (mirrors deriveLoadTarget in dailyReadiness.ts)
  let loadTarget: string;
  if (band === "pain_risk") {
    loadTarget = "rest";
  } else if (isRaceToday) {
    loadTarget = "race";
  } else if (isRaceTomorrow) {
    loadTarget = "easy";
  } else if (band === "red") {
    loadTarget = "walk";
  } else if (band === "yellow") {
    loadTarget = (loadScore ?? 0) >= 65 ? "easy" : "moderate";
  } else {
    loadTarget = (loadScore ?? 0) >= 65 ? "easy" : (loadScore ?? 0) <= 25 ? "build" : "moderate";
  }
  // Pain recovery cap
  if ((painRecoveryStatus === "improving" || painRecoveryStatus === "recent_pain") && loadTarget !== "walk") {
    loadTarget = "easy";
  } else if (painRecoveryStatus === "cleared_light" && (loadTarget === "moderate" || loadTarget === "build")) {
    loadTarget = "easy";
  }

  // Signal summary
  const signalLines: string[] = [];
  if (recoveryScore !== null) {
    signalLines.push(`Recovery: ${recoveryScore}/100 (${recoveryScore >= 66 ? "good" : recoveryScore >= 50 ? "moderate" : "low"})`);
  }
  if (loadScore !== null) {
    signalLines.push(`Training load: ${loadScore}/100 (${loadScore >= 65 ? "HIGH — accumulated fatigue" : loadScore <= 25 ? "low — body fresh" : "moderate"})`);
  }
  if (sleepScore !== null) {
    signalLines.push(`Sleep: ${sleepScore}/100 (${sleepScore >= 66 ? "good" : sleepScore >= 50 ? "moderate" : "low"})`);
  }
  if (fuelScore !== null && mealsToday >= 2) {
    signalLines.push(`Fuel: ${fuelScore}/100 (${fuelScore >= 60 ? "adequate" : "low"})`);
  } else if (mealsToday === 0) {
    signalLines.push("Fuel: no meal data logged today");
  } else if (mealsToday === 1) {
    signalLines.push("Fuel: partial data (1 meal logged — unclear)");
  }
  if (totalRunKm > 0) {
    signalLines.push(`Weekly run km so far: ${Math.round(totalRunKm * 10) / 10} km`);
  }

  // Pain context
  const painLines: string[] = [];
  if (activePain) {
    painLines.push("PAIN STATUS: Active pain today. BLOCK all running/high-impact recommendations. Guide toward rest, gentle movement, or physio only.");
  } else if (painRecoveryStatus === "improving") {
    painLines.push("PAIN STATUS: improving — user selected 'ดีขึ้น แต่ยังระวัง'. Max intensity = easy. Do NOT suggest tempo, interval, or hard sessions.");
  } else if (painRecoveryStatus === "recent_pain") {
    painLines.push("PAIN STATUS: recent pain (< 48 h pain-free). Max intensity = easy. If user asks about hard sessions, redirect to easy + patience.");
  } else if (painRecoveryStatus === "cleared_light") {
    painLines.push("PAIN STATUS: cleared_light — ok for easy running, but do NOT suggest pushing pace or hard efforts.");
  } else if (painRecoveryStatus === "cleared_normal") {
    painLines.push("PAIN STATUS: cleared_normal — no pain restriction. Treat as healthy runner.");
  } else if (recentPain) {
    painLines.push("PAIN STATUS: recent pain history detected (time-based). Be conservative; prefer easy suggestions.");
  }

  // Hard restriction line
  const restrictionLine = band === "pain_risk"
    ? "GUARDRAIL: Do NOT recommend running or high-impact activity. Rest/physio only."
    : band === "red"
    ? "GUARDRAIL: Do NOT recommend tempo, interval, or hard workouts. Easy walk or light jog at most."
    : band === "yellow" && (loadScore ?? 0) >= 65
    ? "GUARDRAIL: High load + moderate readiness. Do NOT suggest hard sessions. Recommend easy or rest."
    : band === "yellow"
    ? "GUARDRAIL: Moderate readiness. Avoid hard workout recommendations unless user explicitly insists."
    : "";

  // Avoid / allow
  const avoidAllow = band === "pain_risk"
    ? "Avoid: running, jumping, loaded impact. Allow: walking, gentle stretching, physio."
    : band === "red"
    ? "Avoid: interval, tempo, long hard run. Allow: easy jog, walking, rest."
    : band === "yellow"
    ? "Avoid: max-effort interval. Allow: easy run, light strength, stretching."
    : loadTarget === "build"
    ? "Allow: long run, short tempo, 10% km increase. No specific avoids."
    : "Allow: planned training. No specific avoids.";

  const lines = [
    `DAILY READINESS: band=${band}, loadTarget=${loadTarget}, readinessScore=${score ?? "none"}.`,
    signalLines.length ? `Signals — ${signalLines.join(" | ")}` : "",
    painLines.join(" "),
    restrictionLine,
    avoidAllow,
  ].filter(Boolean);

  return `DAILY_COACH_GUARDRAILS:\n${lines.join("\n")}`;
}

function isSimpleFollowUp(question: string) {
  return /ได้ไหม|ได้มั้ย|ควรไหม|ควรมั้ย|พักไหม|พักมั้ย|เดิน|นอนต่อ|กิน|แช่|ประคบ|ice|cold|เจ็บ/.test(question.toLowerCase()) && question.length <= 180;
}

function isColdSoakQuestion(question: string) {
  return /แช่.*น้ำเย็น|น้ำเย็น|ประคบเย็น|ice|cold|น้ำแข็ง/.test(question.toLowerCase());
}

function isFoodOrHealthNutritionQuestion(question: string) {
  return /กิน|อาหาร|เมนู|คอเลส|chol|ldl|triglyceride|น้ำตาล|ไขมัน|ตับ|ไต|uric|โปรตีน|คาร์บ|สุขภาพ|ผลตรวจ|meal|food|nutrition|diet/i.test(question);
}

function isMealRecommendationQuestion(question: string) {
  return /กินอะไร|มื้อเช้า|มื้อกลางวัน|มื้อเที่ยง|มื้อเย็น|มื้อค่ำ|มื้อนี้|จัดมื้อ|ไม่ซ้ำ|สมดุล|breakfast|lunch|dinner|snack|what.*eat/i.test(question);
}

function detectMealSlot(question: string): "breakfast" | "lunch" | "dinner" | "snack" | "meal" {
  if (/เช้า|มื้อเช้า|breakfast/i.test(question)) return "breakfast";
  if (/เที่ยง|กลางวัน|มื้อกลางวัน|lunch/i.test(question)) return "lunch";
  if (/เย็น|ค่ำ|มื้อเย็น|dinner/i.test(question)) return "dinner";
  if (/ของว่าง|ว่าง|snack/i.test(question)) return "snack";
  return "meal";
}

function mealExamples(slot: ReturnType<typeof detectMealSlot>): string[] {
  if (slot === "breakfast") return [
    "ข้าวต้มปลา + ไข่ต้ม",
    "โจ๊กไก่/หมูไม่ติดมันใส่ไข่ ลดปาท่องโก๋",
    "ขนมปังโฮลวีต + ไข่ + โยเกิร์ตไม่หวาน",
  ];
  if (slot === "lunch") return [
    "ข้าวไก่ย่าง/อกไก่ + ผัก + ไข่ต้ม",
    "สุกี้น้ำไก่หรือเต้าหู้ เพิ่มผัก ลดน้ำจิ้ม",
    "กะเพราไก่/หมูไม่ติดมัน ลดน้ำมัน + ไข่ต้ม",
  ];
  if (slot === "dinner") return [
    "สุกี้น้ำไก่/เต้าหู้ เพิ่มผัก",
    "เกาเหลา + ข้าวเล็กน้อย",
    "ต้มจืดเต้าหู้หมูสับ + ข้าวเล็กน้อย",
  ];
  if (slot === "snack") return [
    "โยเกิร์ตไม่หวาน + ผลไม้",
    "ไข่ต้ม + กล้วย",
    "นมหรือโปรตีนไม่หวาน + ถั่วไม่เค็มเล็กน้อย",
  ];
  return [
    "ข้าว + โปรตีนไม่ทอด + ผัก",
    "สุกี้น้ำเพิ่มผัก ลดน้ำจิ้ม",
    "ต้มจืด/เกาเหลา + ข้าวพอประมาณ",
  ];
}

function formatMealContext(value: unknown): string {
  const meal = readRecord(value);
  if (!meal) return "meal: details unavailable";
  const foods = Array.isArray(meal.foods)
    ? meal.foods.filter((food): food is string => typeof food === "string").slice(0, 6)
    : [];
  const macros = [
    numberValue(meal.proteinG) != null ? `protein ${numberValue(meal.proteinG)}g` : null,
    numberValue(meal.carbsG) != null ? `carbs ${numberValue(meal.carbsG)}g` : null,
    numberValue(meal.fatG) != null ? `fat ${numberValue(meal.fatG)}g` : null,
  ].filter(Boolean).join(", ");
  return `${stringValue(meal.mealType) ?? "meal"}: ${foods.join(", ") || "foods not specified"}${macros ? ` (${macros})` : ""}`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function hasActiveRaceGoal(context: unknown) {
  return !!getRaceGoal(context);
}

function getRaceGoal(context: unknown) {
  if (!context || typeof context !== "object" || !("raceGoal" in context)) return null;
  const raceGoal = (context as { raceGoal?: unknown }).raceGoal;
  return raceGoal && typeof raceGoal === "object" ? raceGoal : null;
}

function removeStaleRaceMessages(messages: ChatMessage[]) {
  const staleRacePattern = /sub\s?25|race\s?day|5k\s+sub|แข่ง|วันแข่ง/i;
  return messages.map((message) => {
    if (!message.content || !staleRacePattern.test(message.content)) return message;
    return {
      ...message,
      content: "[ละข้อความเก่าเรื่อง race ออกจาก context เพราะตอนนี้ยังไม่มี Race Goal active]",
    };
  });
}

function bangkokDateTimeString() {
  const nowBangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const dd = String(nowBangkok.getUTCDate()).padStart(2, "0");
  const mm = String(nowBangkok.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = nowBangkok.getUTCFullYear();
  const buddhistYear = yyyy + 543;
  const hh = String(nowBangkok.getUTCHours()).padStart(2, "0");
  const min = String(nowBangkok.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min} (Bangkok UTC+7, พ.ศ. ${buddhistYear})`;
}
