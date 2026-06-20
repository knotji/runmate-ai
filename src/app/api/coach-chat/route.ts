import { NextResponse } from "next/server";
import { textFromAI } from "@/lib/ai";
import { coachChatPrompt } from "@/lib/prompts/coachChat";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";

export async function POST(request: Request) {
  const body = await request.json();
  const latest = body.messages?.at(-1)?.content || "";
  const context = body.context || {};
  const messages = hasActiveRaceGoal(context) ? (body.messages || []) : removeStaleRaceMessages(body.messages || []);

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

  const profileCtx = buildRunnerProfileContext((context as Record<string, unknown>)?.profile as Record<string, unknown> ?? null);
  const systemExtra = [
    `วันที่และเวลาปัจจุบัน: ${dateTimeStr}`,
    profileCtx,
    `Context:\n${JSON.stringify(context)}`,
  ].filter(Boolean).join("\n\n");

  const result = await textFromAI({
    system: `${coachChatPrompt}\n\n${systemExtra}`,
    messages,
    fallback: fallbackCoachReply(latest),
  });

  return NextResponse.json(result);
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

  const dates = [...raw.matchAll(/20\d{2}-\d{2}-\d{2}/g)].map((match) => match[0]);
  if (!dates.length) return false;

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return dates.some((date) => {
    const [year, month, day] = date.split("-").map(Number);
    const raceUtc = Date.UTC(year, month - 1, day);
    const daysUntilRace = Math.round((raceUtc - todayUtc) / 86_400_000);
    return daysUntilRace >= 0 && daysUntilRace <= 1;
  });
}
