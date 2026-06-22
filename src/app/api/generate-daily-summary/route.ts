import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { dailySummaryPrompt } from "@/lib/prompts/dailySummary";
import type { DailySummary } from "@/types/logs";
import type { PainSummary } from "@/lib/buildCoachContext";

const fallback: DailySummary = {
  readinessScore: 70,
  overallSummary: "วันนี้เป็นวันที่ดีสำหรับการเก็บข้อมูลและรักษาความสม่ำเสมอ",
  trainingReview: "ถ้ามีซ้อม ให้ถือว่าเน้นคุณภาพแบบเบาและไม่ฝืน",
  nutritionReview: "มื้ออาหารควรบาลานซ์คาร์บ โปรตีน และน้ำ โดยเฉพาะหลังซ้อม",
  recoveryReview: "ให้ความสำคัญกับการนอนและลดความล้าสะสม",
  whatWentWell: "คุณเริ่มบันทึกข้อมูลที่ช่วยให้โค้ชปรับแผนได้ดีขึ้น",
  whatToImprove: "พรุ่งนี้ลองเพิ่มรายละเอียด sleep/run ให้ครบขึ้น",
  tomorrowPlan: "พักหรือกิจกรรมเบา ๆ ตามความพร้อมของร่างกาย",
  coachMessage: "ความสม่ำเสมอที่ปลอดภัยคือทางลัดระยะยาวของนักวิ่ง",
};

function buildInjuryBlock(pains: PainSummary[]): string {
  if (!pains.length) return "";
  const worst = pains.reduce((max, p) => p.painLevel > max.painLevel ? p : max, pains[0]);
  const lines: string[] = [
    "⚠️ ACTIVE INJURY OVERRIDE — apply to tomorrowPlan and whatToImprove:",
    `Injury: ${worst.painLocation}${worst.painSide !== "unknown" ? ` (${worst.painSide})` : ""} level ${worst.painLevel}/10 risk=${worst.riskLevel} impact=${worst.trainingImpact}`,
  ];
  if (worst.swellingOrRedness === "yes") lines.push("• Swelling/redness present — no running, rest required.");
  if (worst.canBearWeight === "no") lines.push("• Cannot bear weight — no running, rest required.");
  if (worst.redFlags?.length) lines.push(`• Red flags: ${worst.redFlags.join(", ")}`);
  if (worst.painLevel >= 5 || worst.canBearWeight === "no" || worst.swellingOrRedness === "yes") {
    lines.push("• RULE: No running. Recommend professional evaluation if worsening.");
  } else if (worst.painLevel >= 3) {
    lines.push("• RULE: Do NOT recommend running as default. Recommend Rest/Recovery or เดินเบา ๆ / mobility first.");
    lines.push("• RULE: Easy run allowed only as conditional — 'ถ้าอาการหายและเดินไม่เจ็บ ค่อยกลับไป easy run สั้น ๆ ได้'");
  } else {
    lines.push("• RULE: Very easy run only if pain-free during walking and warm-up.");
  }
  lines.push("• FORBIDDEN: Do NOT write 'Easy Run สั้น ๆ' as the main tomorrowPlan recommendation.");
  return "\n\n" + lines.join("\n");
}

function isActivePain(pain: PainSummary): boolean {
  if (pain.hasResolvedPain) return false;
  return pain.hasActivePain
    || pain.painLevel > 0
    || pain.swellingOrRedness === "yes"
    || pain.canBearWeight === "no"
    || Boolean(pain.redFlags?.length);
}

export async function POST(request: Request) {
  const context = await request.json() as { recentPainLogs?: PainSummary[] };
  const recentPainLogs = context.recentPainLogs ?? [];

  // Inject explicit injury block for any active injury (level >= 3 or medium/high risk)
  const activePains = recentPainLogs.filter(
    (p) => isActivePain(p) && (p.painLevel >= 3 || p.riskLevel === "medium" || p.riskLevel === "high"),
  );
  const injuryBlock = buildInjuryBlock(activePains);

  const result = await jsonFromAI<DailySummary>({
    system: dailySummaryPrompt,
    user: `Generate daily summary JSON from this context:\n${JSON.stringify(context)}${injuryBlock}`,
    fallback,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, fallback) });
}
