import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import type { PainAnalysisResult, PainRiskLevel, PainTrainingImpact } from "@/types/pain";

const SYSTEM_PROMPT = `You are RunMate AI — a running coach assistant that helps assess training impact from reported pain.

ABSOLUTE RULES:
- Do NOT diagnose diseases, conditions, or injuries by name
- Do NOT claim certainty from photos — images only help locate the area
- Use hedging language: "อาจเป็น", "ควรระวัง", "จากข้อมูลที่ให้มา", "แนะนำให้ปรึกษาผู้เชี่ยวชาญ"
- Write all output in Thai except JSON keys
- Return valid JSON only — no markdown

RISK LOGIC (apply strictly):
- riskLevel "high" + trainingImpact "seek_professional" when ANY of:
    painLevel >= 5, swellingOrRedness = "yes", canBearWeight = "no",
    painType includes "numb" or "sharp", pain started DURING run and is sharp
- riskLevel "medium" + trainingImpact "reduce_load" when ANY of:
    painLevel 3–4, painfulWhen includes 3+ activities, pain worsens during activity
    (but none of the "high" conditions)
- riskLevel "low" + trainingImpact "run_ok_easy" when:
    painLevel <= 2 AND no swelling AND can bear weight AND no numbness/sharpness
- trainingImpact "rest" when painLevel >= 5 and riskLevel "high" but user hasn't selected sharp/numb
    (severe ache without alarm signs — rest before professional visit)

COACH ADVICE: 1–3 concise Thai sentences. Be direct, warm, not alarmist.
RED FLAGS: list only if present. Empty array [] if none.`;

export async function POST(request: Request) {
  const body = await request.json() as {
    formData: {
      painLocation: string;
      painSide: string;
      painLevel: number;
      startedWhen: string;
      painType: string[];
      painfulWhen: string[];
      swellingOrRedness: string;
      canBearWeight: string;
      notes?: string;
    };
    imageDataUrl?: string;
  };

  const { formData, imageDataUrl } = body;

  // Server-side risk computation as fallback baseline
  const serverFallback = computeRiskFromForm(formData);

  const userPrompt = buildPrompt(formData);

  const result = await jsonFromAI<PainAnalysisResult>({
    system: SYSTEM_PROMPT,
    user: userPrompt,
    imageDataUrl,
    fallback: serverFallback,
  });

  // Validate and sanitize AI output
  const data = sanitize(result.data, serverFallback);
  return NextResponse.json({ ok: true, data });
}

function buildPrompt(f: {
  painLocation: string;
  painSide: string;
  painLevel: number;
  startedWhen: string;
  painType: string[];
  painfulWhen: string[];
  swellingOrRedness: string;
  canBearWeight: string;
  notes?: string;
}): string {
  const lines = [
    `ตำแหน่งที่เจ็บ: ${f.painLocation}`,
    `ข้าง: ${sideThai(f.painSide)}`,
    `ระดับความเจ็บปวด: ${f.painLevel}/10`,
    `เริ่มเจ็บตอน: ${f.startedWhen}`,
    `ลักษณะอาการ: ${f.painType.join(", ") || "ไม่ระบุ"}`,
    `เจ็บเมื่อ: ${f.painfulWhen.join(", ") || "ไม่ระบุ"}`,
    `บวมหรือแดง: ${triThai(f.swellingOrRedness)}`,
    `รับน้ำหนักได้: ${triThai(f.canBearWeight)}`,
  ];
  if (f.notes?.trim()) lines.push(`หมายเหตุ: ${f.notes.trim()}`);
  if (!f.painLocation.trim()) return "ไม่มีข้อมูล";

  return [
    "นักวิ่งรายงานอาการเจ็บดังนี้:",
    ...lines,
    "",
    'ประเมินผลและคืน JSON: { "riskLevel": "low"|"medium"|"high", "trainingImpact": "run_ok_easy"|"reduce_load"|"rest"|"seek_professional", "coachAdvice": "string", "redFlags": [] }',
  ].join("\n");
}

function sideThai(s: string) {
  return { left: "ซ้าย", right: "ขวา", both: "ทั้งสองข้าง", unknown: "ไม่แน่ใจ" }[s] ?? s;
}
function triThai(s: string) {
  return { yes: "ใช่", no: "ไม่มี", unknown: "ไม่แน่ใจ" }[s] ?? s;
}

function computeRiskFromForm(f: {
  painLevel: number;
  painType: string[];
  swellingOrRedness: string;
  canBearWeight: string;
  painfulWhen: string[];
}): PainAnalysisResult {
  const highAlarm =
    f.painLevel >= 5 ||
    f.swellingOrRedness === "yes" ||
    f.canBearWeight === "no" ||
    f.painType.includes("numb") ||
    f.painType.includes("sharp");

  if (highAlarm) {
    return {
      riskLevel: "high",
      trainingImpact: f.painLevel >= 5 ? "seek_professional" : "rest",
      coachAdvice: "จากข้อมูลที่ให้มา มีสัญญาณที่ควรระวัง แนะนำให้หยุดพักและปรึกษานักกายภาพบำบัดหรือแพทย์ก่อนกลับมาซ้อม",
      redFlags: buildRedFlags(f),
    };
  }

  if (f.painLevel >= 3) {
    return {
      riskLevel: "medium",
      trainingImpact: "reduce_load",
      coachAdvice: "อาจเกิดจากความล้าสะสม แนะนำลดความหนักของการซ้อม 24–48 ชั่วโมง หลีกเลี่ยง speed work และ hills ชั่วคราว",
      redFlags: [],
    };
  }

  return {
    riskLevel: "low",
    trainingImpact: "run_ok_easy",
    coachAdvice: "อาการยังเบา ถ้าไม่แย่ลงระหว่างวิ่ง easy run ได้ตามปกติ แต่ให้ฟังร่างกายอย่างใกล้ชิด",
    redFlags: [],
  };
}

function buildRedFlags(f: { painType: string[]; swellingOrRedness: string; canBearWeight: string; painLevel: number }): string[] {
  const flags: string[] = [];
  if (f.swellingOrRedness === "yes") flags.push("มีอาการบวมหรือแดง");
  if (f.canBearWeight === "no") flags.push("รับน้ำหนักไม่ได้");
  if (f.painType.includes("numb")) flags.push("มีอาการชา");
  if (f.painType.includes("sharp")) flags.push("เจ็บแบบแหลมคม");
  if (f.painLevel >= 7) flags.push("ระดับความเจ็บปวดสูง (≥7/10)");
  return flags;
}

const VALID_RISK: PainRiskLevel[] = ["low", "medium", "high"];
const VALID_IMPACT: PainTrainingImpact[] = ["run_ok_easy", "reduce_load", "rest", "seek_professional"];

function sanitize(data: PainAnalysisResult, fallback: PainAnalysisResult): PainAnalysisResult {
  return {
    riskLevel: VALID_RISK.includes(data?.riskLevel) ? data.riskLevel : fallback.riskLevel,
    trainingImpact: VALID_IMPACT.includes(data?.trainingImpact) ? data.trainingImpact : fallback.trainingImpact,
    coachAdvice: typeof data?.coachAdvice === "string" && data.coachAdvice.trim() ? data.coachAdvice : fallback.coachAdvice,
    redFlags: Array.isArray(data?.redFlags) ? data.redFlags.filter((f) => typeof f === "string") : [],
  };
}
