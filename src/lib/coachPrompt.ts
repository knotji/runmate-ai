/**
 * Generates prompt instructions to lock the AI Coach response format.
 * Ensures the response is short but complete (contains Workout, Target, Why, Watch out, and Adjustment components).
 */
export function buildCoachResponseFormatInstruction(language?: string, length?: string): string {
  const isThai = language === "th" || language === "ไทย" || language === "mixed";
  const isShort = length === "short" || length === "สั้น";

  if (isThai && isShort) {
    return `
CRITICAL RESPONSE FORMAT INSTRUCTION (Thai + Short):
- You MUST respond in Thai, keeping it extremely brief but complete.
- Every training recommendation must strictly follow this exact 5-line structure (do not add blank lines, headings, or other text):
  Line 1: วันนี้ควรซ้อมอะไร (Workout name)
  Line 2: ระยะหรือเวลา และเป้าหมาย HR หรือ pace target (คุม HR ไม่เกิน X bpm)
  Line 3: เหตุผลสั้น ๆ 1 ประโยค (Why)
  Line 4: วิธีปรับถ้ารู้สึกหนักเกินไป (Adjustment, e.g., ถ้า HR ลอย ให้ลด pace หรือเดินสลับ)
  Line 5: สิ่งที่ต้องระวังเพื่อความปลอดภัย (Watch out, e.g., เจ็บ/แน่นผิดปกติให้หยุดซ้อม)
- Do NOT output more than 5 lines.
- Never duplicate heart rate units (do not write "bpm bpm", write only "bpm" once).
- Do NOT omit critical training safety/caution information just because the style is short.
`;
  }

  return `
RESPONSE FORMAT INSTRUCTION:
Every training recommendation you provide must contain these 5 components:
1. Workout: what to do today
2. Target: duration/distance and HR/pace cap (never duplicate units, e.g. "bpm bpm")
3. Why: one short reason
4. Watch out: one caution (safety check)
5. Adjustment: what to do if it feels too hard
- Keep the response concise and aligned with the selected coach style.
- Do not omit critical training safety information even if the response style is short.
`;
}
