import { NextResponse } from "next/server";
import { textFromAI } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { buildCoachResponseFormatInstruction } from "@/lib/coachPrompt";
import { coachChatPrompt } from "@/lib/prompts/coachChat";
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

    const systemExtra = [
      `Current Bangkok date/time: ${dateTimeStr}`,
      buildRunnerProfileContext(profile),
      `Context from Report/Profile/Race Goal:\n${JSON.stringify(context)}`,
      imageIntentInstruction,
    ].filter(Boolean).join("\n\n");

    const result = await textFromAI({
      system: `${coachChatPrompt}\n\n${chatInstructions}\n\n${systemExtra}`,
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
  const hh = String(nowBangkok.getUTCHours()).padStart(2, "0");
  const min = String(nowBangkok.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min} (Bangkok UTC+7)`;
}
