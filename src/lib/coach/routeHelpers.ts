type ChatMessage = { role?: "user" | "assistant"; content?: string };

export function bangkokDateTimeString() {
  const nowBangkok = new Date(Date.now() + 7 * 60 * 60 * 1000);
  const dd = String(nowBangkok.getUTCDate()).padStart(2, "0");
  const mm = String(nowBangkok.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = nowBangkok.getUTCFullYear();
  const buddhistYear = yyyy + 543;
  const hh = String(nowBangkok.getUTCHours()).padStart(2, "0");
  const min = String(nowBangkok.getUTCMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min} (Bangkok UTC+7, พ.ศ. ${buddhistYear})`;
}

export function buildToneInstruction(coachingTone?: string) {
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

export function fallbackCoachReply(question: string) {
  const risky = /เจ็บ|ปวด|หน้ามืด|แน่นหน้าอก|วิงเวียน|เป็นลม|หายใจไม่ออก/.test(question);
  if (risky) {
    return "ขอให้หยุดซ้อมไว้ก่อนนะครับ อันนี้ไม่ใช่การวินิจฉัย แต่ถ้ามีอาการแย่ลง บวม ลงน้ำหนักไม่ได้ ชา หรือแน่นหน้าอก ควรปรึกษาแพทย์/นักกายภาพครับ";
  }
  return "ตอนนี้โค้ชตอบจากระบบไม่ได้ชั่วคราวครับ แต่คุยต่อได้เลย ถ้าเป็นเรื่องซ้อมให้เริ่มจากตัวเลือกที่ปลอดภัยก่อน: เบาลง พักให้พอ และอย่าฝืนถ้าร่างกายส่งสัญญาณล้า";
}

export function getRaceGoal(context: unknown) {
  if (!context || typeof context !== "object" || !("raceGoal" in context)) return null;
  const raceGoal = (context as { raceGoal?: unknown }).raceGoal;
  return raceGoal && typeof raceGoal === "object" ? raceGoal : null;
}

export function hasActiveRaceGoal(context: unknown) {
  return !!getRaceGoal(context);
}

export function removeStaleRaceMessages(messages: ChatMessage[]) {
  const staleRacePattern = /sub\s?25|race\s?day|5k\s+sub|แข่ง|วันแข่ง/i;
  return messages.map((message) => {
    if (!message.content || !staleRacePattern.test(message.content)) return message;
    return {
      ...message,
      content: "[ละข้อความเก่าเรื่อง race ออกจาก context เพราะตอนนี้ยังไม่มี Race Goal active]",
    };
  });
}

export function raceEveGuard(question: string, context: unknown, dateTimeStr: string) {
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

