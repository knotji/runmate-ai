import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import type { AIPrescription, StrengthRoutine } from "@/types/strength";
import type { CoachContext } from "@/lib/buildCoachContext";

const SYSTEM_PROMPT = `You are RunMate AI — a running and strength coach that designs personalized strength training adjustments based on a runner's recovery, pain, and schedule context.

ABSOLUTE RULES:
- Do NOT diagnose any medical conditions or make medical statements. Use words like "ประเมินคร่าว ๆ", "อาจ", "ควรระวัง" if discussing pain.
- Output all comments, reasons, warnings, and notes in Thai. Use clear, encouraging, and friendly coach-like Thai language.
- Return valid JSON only — no markdown.

SAFETY & ADJUSTMENT GUIDELINES:
1. Low Recovery / Poor Sleep:
   - If readiness score < 65 or sleep duration < 6.0 hours, downgrade intensity to "easy", reduce sets/reps, or pivot towards Recovery/Mobility.
2. Pain / Injury:
   - If there is recent pain log (especially medium/high risk), note it and adjust or skip exercises that load the painful area. E.g., for knee/ankle pain, reduce or avoid heavy squats/lunges or specify modification notes (e.g. "เลี่ยงมุมลึก", "บอดี้เวทเบาๆ").
3. Timing near Race / Long Run:
   - If a race or long run is scheduled for tomorrow/very soon, avoid heavy lower-body volume. Focus on core and mobility.
   - If a hard workout/race occurred in the last 24h, reduce lower-body sets/reps to allow recovery.
4. Keep the template identity:
   - Do NOT rewrite the template completely. Modify reps, sets, rest, or add custom modification notes to existing exercises. Keep it helpful.`;

export async function POST(request: Request) {
  const body = await request.json() as {
    routine: StrengthRoutine;
    context: CoachContext;
  };

  const { routine, context } = body;

  const fallback: AIPrescription = {
    routineName: routine.name,
    recommendedTitle: `วันนี้: ${routine.name} (ค่าเริ่มต้น)`,
    intensity: routine.id === "fullbody" ? "moderate" : "easy",
    estimatedDurationMin: routine.warmupMin + routine.cooldownMin + 15,
    reason: "ใช้ฟอร์มเริ่มต้นตามแผนปกติ",
    exercises: routine.exercises.map((e) => ({ ...e, modificationNote: "" })),
    warnings: [],
    shouldAvoid: []
  };

  const userPrompt = buildPrompt(routine, context);

  try {
    const result = await jsonFromAI<AIPrescription>({
      system: SYSTEM_PROMPT,
      user: userPrompt,
      fallback,
    });

    return NextResponse.json({ ok: true, data: result.data });
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[strength-ai-prescription-error]", error);
    }
    return NextResponse.json({ ok: true, data: fallback });
  }
}

function buildPrompt(routine: StrengthRoutine, context: CoachContext): string {
  const profile = context.profile ?? {};
  const recentPain = context.recentPainLogs ?? [];
  const activeRace = context.raceGoal ?? null;

  const lines = [
    `Template Name: ${routine.name}`,
    `Template Description: ${routine.description}`,
    `Exercises: ${JSON.stringify(routine.exercises)}`,
    "",
    "Runner Context:",
    `- Today Date: ${context.todayDate}`,
    `- Sleep Avg: ${context.sleep7d?.[0]?.durationH ?? "unknown"} hours (score ${context.sleep7d?.[0]?.score ?? "unknown"})`,
    `- Readiness Today: ${context.avgReadiness ?? "unknown"} (score ${context.sleep7d?.[0]?.readiness ?? "unknown"})`,
    `- Active Race Goal: ${activeRace ? `${activeRace.raceName} (${activeRace.raceDistance}) on ${activeRace.raceDate}` : "none"}`,
    `- Days Until Race: ${context.daysUntilRace ?? "none"}`
  ];

  if (profile.weightKg) {
    lines.push(`- Weight: ${profile.weightKg} kg`);
  }

  if (recentPain.length > 0) {
    lines.push("- Recent pain reports:");
    for (const p of recentPain) {
      lines.push(`  * ${p.date}: ${p.painLocation} level ${p.painLevel}/10, risk ${p.riskLevel}`);
    }
  }

  lines.push(
    "",
    "Task:",
    "Adjust sets, reps, durationSec, restSec, and add modificationNote for each exercise if needed. Keep the return shape matching the schema exactly.",
    "Return JSON structure exactly:",
    '{"routineName": "string", "recommendedTitle": "string", "intensity": "easy"|"moderate"|"hard", "estimatedDurationMin": number, "reason": "string", "exercises": [{"name": "string", "sets": number, "reps": "string", "durationSec": number|null, "restSec": number, "modificationNote": "string"}], "warnings": ["string"], "shouldAvoid": ["string"]}'
  );

  return lines.join("\n");
}
