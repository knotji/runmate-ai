import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { racePlanPrompt } from "@/lib/prompts/racePlan";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import { demoRacePlan } from "@/lib/training";
import type { RaceGoal, RacePlan } from "@/types/race";
import type { CoachContext } from "@/lib/buildCoachContext";

export async function POST(request: Request) {
  const body = await request.json() as { goal: RaceGoal; context?: CoachContext };
  const goal = body.goal;
  const ctx = body.context;

  const todayMs = Date.now() + 7 * 60 * 60 * 1000; // Bangkok UTC+7
  const todayStr = new Date(todayMs).toISOString().slice(0, 10);
  const raceDateMs = goal.raceDate ? new Date(goal.raceDate).getTime() : null;
  const daysUntilRace = raceDateMs ? Math.round((raceDateMs - new Date(todayStr).getTime()) / 86400000) : null;
  const weeksUntilRace = daysUntilRace != null ? Math.floor(daysUntilRace / 7) : null;

  const historySection = ctx ? buildHistorySummary(ctx) : "ไม่มีข้อมูล history";
  const profileCtx = ctx?.profile ? buildRunnerProfileContext(ctx.profile) : "";
  const system = profileCtx ? `${racePlanPrompt}\n\n${profileCtx}` : racePlanPrompt;

  const result = await jsonFromAI<RacePlan>({
    system,
    user: `Today: ${todayStr}
Days until race: ${daysUntilRace ?? "unknown"}
Weeks until race: ${weeksUntilRace ?? "unknown"}

ข้อมูลผู้ใช้จาก History (7 วันล่าสุด):
${historySection}

Race Goal:
${JSON.stringify(goal)}

Create a personalized race plan based on BOTH the goal AND the real history data above. Return JSON only.`,
    fallback: demoRacePlan(goal),
  });

  return NextResponse.json(result);
}

function buildHistorySummary(ctx: CoachContext): string {
  const lines: string[] = [];

  if (ctx.sleep7d.length > 0) {
    lines.push(`การนอน (${ctx.sleep7d.length} คืน):`)
    for (const s of ctx.sleep7d.slice(0, 7)) {
      const parts = [s.date, s.durationH && `นอน ${s.durationH}`, s.readiness && `readiness ${s.readiness}`].filter(Boolean);
      lines.push(`  - ${parts.join(", ")}`);
    }
    if (ctx.avgReadiness != null) lines.push(`  เฉลี่ย readiness: ${ctx.avgReadiness}`);
  }

  if (ctx.workouts7d.length > 0) {
    lines.push(`\nการออกกำลังกาย (${ctx.totalSessions} sessions, วิ่งรวม ${ctx.totalRunKm} km):`);
    for (const day of ctx.workouts7d) {
      const parts: string[] = [`  - ${day.date}:`];
      for (const r of day.runs) parts.push(`วิ่ง ${r.km.toFixed(2)}km${r.avgHR ? ` HR${r.avgHR}` : ""}${r.pace ? ` pace${r.pace}` : ""}`);
      for (const o of day.other) parts.push(`${o.label} ${o.durationMin}min`);
      lines.push(parts.join(" | "));
    }
  }

  if (ctx.latestBody) {
    const b = ctx.latestBody;
    const bodyParts = [b.weightKg && `น้ำหนัก ${b.weightKg} kg`, b.bodyFatPct && `ไขมัน ${b.bodyFatPct}%`, b.muscleKg && `กล้ามเนื้อ ${b.muscleKg} kg`].filter(Boolean);
    if (bodyParts.length) lines.push(`\nส่วนประกอบร่างกาย: ${bodyParts.join(", ")}`);
  }

  if (ctx.profile) {
    const p = ctx.profile as Record<string, string>;
    const profileParts = [p.age && `อายุ ${p.age} ปี`, p.level && `ระดับ ${p.level}`, p.maxHR && `HR max ${p.maxHR}`].filter(Boolean);
    if (profileParts.length) lines.push(`\nโปรไฟล์: ${profileParts.join(", ")}`);
  }

  return lines.join("\n") || "ไม่มีข้อมูล";
}
