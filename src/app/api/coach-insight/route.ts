import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { CoachContext } from "@/lib/buildCoachContext";
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
      });
    }
    const profileCtx = buildRunnerProfileContext(ctx.profile);
    const system = profileCtx ? `${SYSTEM_PROMPT}\n\n${profileCtx}` : SYSTEM_PROMPT;

    const result = await jsonFromAI<DailyCoachInsight>({
      system,
      user: buildUserPrompt(ctx),
      fallback: FALLBACK,
    });

    return NextResponse.json(result);
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
    if (ctx.avgReadiness != null) lines.push(`เฉลี่ย readiness: ${ctx.avgReadiness}`);
  }

  lines.push(`\nการออกกำลังกาย 7 วันล่าสุด (รวม ${ctx.totalRunKm} km วิ่ง, ${ctx.totalSessions} sessions):`);
  lines.push(`Run days: ${ctx.runDays7d}, longest run: ${ctx.longestRun7dKm ?? "unknown"} km, last workout: ${ctx.lastWorkoutDate ?? "unknown"}`);
  if (ctx.lastRun) {
    lines.push(`Last run: ${ctx.lastRun.date}, ${ctx.lastRun.km.toFixed(2)} km, ${ctx.lastRun.durationMin} min, HR ${ctx.lastRun.avgHR ?? "unknown"}, pace ${ctx.lastRun.pace ?? "unknown"}`);
  }

  if (ctx.workouts7d.length === 0) {
    lines.push("- ไม่มีข้อมูล");
  } else {
    for (const day of ctx.workouts7d) {
      const parts: string[] = [`${day.date}:`];
      for (const r of day.runs) {
        parts.push(`วิ่ง ${r.km.toFixed(2)}km ${r.durationMin}min${r.avgHR ? ` HR${r.avgHR}` : ""}${r.pace ? ` pace${r.pace}` : ""}`);
      }
      for (const w of day.walks) {
        parts.push(`เดิน${w.km ? ` ${w.km.toFixed(2)}km` : ""} ${w.durationMin}min`);
      }
      for (const o of day.other) {
        parts.push(`${o.label} ${o.durationMin}min`);
      }
      lines.push(`  ${parts.join(" | ")}`);
    }
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
- coachMessage ต้องมี why เสมอ ไม่ใช่แค่สั่ง`;
