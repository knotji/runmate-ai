import { NextResponse } from "next/server";
import { textFromAI } from "@/lib/ai";
import { coachChatPrompt } from "@/lib/prompts/coachChat";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { UserProfile } from "@/types/profile";
import { buildCoachResponseFormatInstruction } from "@/lib/coachPrompt";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const latest = body.messages?.at(-1)?.content || "";
    const context = body.context || {};
    const messages = hasActiveRaceGoal(context) ? (body.messages || []) : removeStaleRaceMessages(body.messages || []);

    if (process.env.NODE_ENV === "development") {
      console.info("[coach-context-debug]", {
        hasProfile: Boolean((context as Record<string, unknown>).profile),
        recentHistoryCount: ((context as { sleep7d?: unknown[] }).sleep7d?.length ?? 0) + ((context as { workouts7d?: unknown[] }).workouts7d?.length ?? 0),
        hasActiveRace: Boolean((context as Record<string, unknown>).raceGoal),
        raceDate: (context as Record<string, unknown>).raceDate ?? null,
        isRaceToday: Boolean((context as Record<string, unknown>).isRaceToday),
        isRaceTomorrow: Boolean((context as Record<string, unknown>).isRaceTomorrow),
      });
    }

    const nowBangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const dd   = String(nowBangkok.getUTCDate()).padStart(2, "0");
    const mm   = String(nowBangkok.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = nowBangkok.getUTCFullYear();
    const hh   = String(nowBangkok.getUTCHours()).padStart(2, "0");
    const min  = String(nowBangkok.getUTCMinutes()).padStart(2, "0");
    const dateTimeStr = `${dd}/${mm}/${yyyy} ${hh}:${min} (Bangkok UTC+7)`;

    const guardedReply = raceEveGuard(latest, context, dateTimeStr);
    if (guardedReply) {
      return NextResponse.json({ message: guardedReply, source: "guardrail" });
    }

    const profile = (context as Record<string, unknown>)?.profile as UserProfile | null;
    const responseDetail = profile?.responseDetail as string | undefined;
    const coachingTone = profile?.coachingTone as string | undefined;
    const imageDataUrl = body.imageDataUrl as string | undefined;
    const imageIntent = body.imageIntent as string | undefined;

    let basePrompt = coachChatPrompt;
    let chatInstructions = buildCoachResponseFormatInstruction(profile?.language, responseDetail, Boolean(imageDataUrl), imageIntent);

    if (responseDetail === "short" || responseDetail === "สั้น") {
      // Filter out instructions to include check-in time, ข้อมูลที่ใช้ประเมิน, and สิ่งที่ยังไม่รู้
      basePrompt = basePrompt
        .split("\n")
        .filter((line) => {
          const lower = line.toLowerCase();
          if (
            lower.includes("เวลาเช็คอิน:") ||
            lower.includes("ข้อมูลที่ใช้ประเมิน") ||
            lower.includes("สิ่งที่ยังไม่รู้")
          ) {
            return false;
          }
          return true;
        })
        .join("\n");
    }

    if (coachingTone === "friendly" || coachingTone === "เป็นกันเอง") {
      chatInstructions += `
COACHING TONE:
Use a friendly, practical, and warm Thai coaching tone (เป็นกันเอง). Avoid strict lecture tone unless it's a safety issue.
`;
    } else if (coachingTone === "direct" || coachingTone === "ตรงๆ") {
      chatInstructions += `
COACHING TONE:
Use a direct and straight-to-the-point Thai coaching tone (ตรงๆ).
`;
    } else if (coachingTone === "gentle" || coachingTone === "นุ่มนวล") {
      chatInstructions += `
COACHING TONE:
Use a gentle and encouraging Thai coaching tone (นุ่มนวล).
`;
    } else if (coachingTone === "strict" || coachingTone === "เข้มงวด") {
      chatInstructions += `
COACHING TONE:
Use a strict, structured, and disciplined Thai coaching tone (เข้มงวด).
`;
    }

    const imageIntentInstruction = imageIntent ? `
IMAGE INTENT DETECTED: The user has explicitly labeled the attached image as "${imageIntent}". Focus your analysis accordingly:
- If "อาหาร" (food/drink): Analyze as a running lifestyle nutrition coach. Focus on carbs, proteins, hydration, fats, and timing (before/after run vs. rest day).
- If "ฉลาก" (nutrition label): Extract and explain visible nutrition facts (macros, sodium, sugar, serving sizes) if readable in the image.
- If "ผลวิ่ง" (running result): Focus strictly on running performance metrics visible: distance, pace, duration, HR, zones, splits. Explain what they imply.
- If "Recovery/Sleep" (sleep/recovery): Focus strictly on recovery indicators: sleep score, duration, deep sleep, HRV, resting HR.
- If "เจ็บ/ปวด" (injury/pain): Focus on safety. Do NOT diagnose the medical condition. Give conservative training guidance and red flags/stop rules.
` : "";

    const profileCtx = buildRunnerProfileContext(profile);
    const systemExtra = [
      `วันที่และเวลาปัจจุบัน: ${dateTimeStr}`,
      profileCtx,
      `Context:\n${JSON.stringify(context)}`,
      imageIntentInstruction,
    ].filter(Boolean).join("\n\n");

    const result = await textFromAI({
      system: `${basePrompt}\n\n${chatInstructions}\n\n${systemExtra}`,
      messages,
      imageDataUrl,
      fallback: fallbackCoachReply(latest),
    });

    return NextResponse.json(result);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[coach-chat-error]", error);
    }
    return NextResponse.json({ message: "โค้ชตอบไม่สำเร็จ ลองใหม่อีกครั้ง" }, { status: 200 });
  }
}

function fallbackCoachReply(question: string) {
  const risky = /เจ็บ|ปวด|หน้ามืด|แน่นหน้าอก|วิงเวียน|เป็นลม|หายใจไม่ออก/.test(question);
  if (risky) {
    return "ถ้ามีอาการเจ็บ หน้ามืด แน่นหน้าอก หรือผิดปกติ แนะนำให้หยุดซ้อมก่อน ลดความหนัก และปรึกษาผู้เชี่ยวชาญถ้าอาการไม่หายหรือรุนแรงนะครับ";
  }
  return "จากข้อมูลตอนนี้ แนะนำให้เลือกทางที่ซ้อมได้ต่อเนื่องและไม่สะสมความล้า ถ้าไม่แน่ใจให้เริ่มจาก Easy Run สั้น ๆ คุม HR สบาย หรือพักเมื่อรู้สึกล้า";
}

function raceEveGuard(question: string, context: unknown, dateTimeStr: string) {
  const normalizedQuestion = question.toLowerCase().replace(/\s+/g, "");
  const asksLongRun =
    normalizedQuestion.includes("longrun") ||
    normalizedQuestion.includes("ลองรัน") ||
    normalizedQuestion.includes("วิ่งยาว");

  if (!asksLongRun || !hasImminentSub25Race(context)) return "";

  return [
    `เวลาเช็คอิน: ${dateTimeStr}`,
    "ไม่ควร long run ครับ",
    "",
    "พรุ่งนี้มี Race 5K เป้าหมาย Sub 25 แล้ว วันนี้/พรุ่งนี้ก่อนแข่งไม่ใช่เวลาสร้างความอึดเพิ่มแล้ว เป้าหมายคือเก็บขาให้สดที่สุดครับ",
    "",
    "แผนที่เหมาะกว่า:",
    "- ถ้ายังไม่ได้ขยับวันนี้: Shakeout 3-4 km เบามาก",
    "- Pace ประมาณ 7:30-8:30/km",
    "- HR คุมต่ำกว่า 145",
    "- ไม่เร่งท้าย ไม่แอบ tempo",
    "- ถ้าขาสดจริง ๆ ค่อยใส่ strides 15-20 วิ x 3 รอบ เอาแค่ปลุกขา",
    "",
    "ถ้าขาตึง ง่วง หรือรู้สึกล้า:",
    "- เดิน 20-30 นาที",
    "- mobility 10 นาที",
    "- แล้วจบ พัก นอน เติมน้ำ",
    "",
    "สรุปวันนี้: ไม่ long run ครับ เก็บขาไว้กด 5K พรุ่งนี้ดีกว่า วันนี้ชนะด้วยการไม่ซ่าครับ",
  ].join("\n");
}

function hasActiveRaceGoal(context: unknown) {
  return !!getRaceGoal(context);
}

function getRaceGoal(context: unknown) {
  if (!context || typeof context !== "object" || !("raceGoal" in context)) return null;
  const raceGoal = (context as { raceGoal?: unknown }).raceGoal;
  return raceGoal && typeof raceGoal === "object" ? raceGoal : null;
}

function removeStaleRaceMessages(messages: { role?: string; content?: string }[]) {
  const staleRacePattern = /sub\s?25|race\s?day|5k\s+sub|แข่ง|วันแข่ง/i;
  return messages.map((message) => {
    if (!message.content || !staleRacePattern.test(message.content)) return message;
    return {
      ...message,
      content: "[ละข้อความเก่าเรื่อง race ออกจาก context เพราะตอนนี้ยังไม่มี Race Goal active]",
    };
  });
}

function hasImminentSub25Race(context: unknown) {
  const raceGoal = getRaceGoal(context);
  if (!raceGoal) return false;

  const raw = JSON.stringify(raceGoal).toLowerCase();
  const raceSignals =
    raw.includes("sub 25") ||
    raw.includes("sub25") ||
    raw.includes("5k") ||
    raw.includes("race day") ||
    raw.includes("race");

  if (!raceSignals) return false;

  const ctx = context as Record<string, unknown>;
  const latestRace = ctx.latestCompletedRace as { raceDate?: unknown } | null;
  if (latestRace?.raceDate && latestRace.raceDate === ctx.todayDate) return false;
  return Boolean(ctx.isRaceToday || ctx.isRaceTomorrow);
}
