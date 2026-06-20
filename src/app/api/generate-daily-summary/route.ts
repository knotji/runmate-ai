import { NextResponse } from "next/server";
import { jsonFromAI } from "@/lib/ai";
import { mergeWithFallback } from "@/lib/fallback";
import { dailySummaryPrompt } from "@/lib/prompts/dailySummary";
import type { DailySummary } from "@/types/logs";

const fallback: DailySummary = {
  readinessScore: 70,
  overallSummary: "วันนี้เป็นวันที่ดีสำหรับการเก็บข้อมูลและรักษาความสม่ำเสมอ",
  trainingReview: "ถ้ามีซ้อม ให้ถือว่าเน้นคุณภาพแบบเบาและไม่ฝืน",
  nutritionReview: "มื้ออาหารควรบาลานซ์คาร์บ โปรตีน และน้ำ โดยเฉพาะหลังซ้อม",
  recoveryReview: "ให้ความสำคัญกับการนอนและลดความล้าสะสม",
  whatWentWell: "คุณเริ่มบันทึกข้อมูลที่ช่วยให้โค้ชปรับแผนได้ดีขึ้น",
  whatToImprove: "พรุ่งนี้ลองเพิ่มรายละเอียด sleep/run ให้ครบขึ้น",
  tomorrowPlan: "Easy Run สั้น ๆ หรือพัก ถ้าตื่นมาแล้วยังล้า",
  coachMessage: "ความสม่ำเสมอที่ปลอดภัยคือทางลัดระยะยาวของนักวิ่ง",
};

export async function POST(request: Request) {
  const context = await request.json();
  const result = await jsonFromAI<DailySummary>({
    system: dailySummaryPrompt,
    user: `Generate daily summary JSON from this context:\n${JSON.stringify(context)}`,
    fallback,
  });

  return NextResponse.json({ ...result, data: mergeWithFallback(result.data, fallback) });
}
