export function buildCoachResponseFormatInstruction(
  language?: string,
  length?: string,
  hasImage?: boolean,
  imageIntent?: string | null
): string {
  const isThai = language === "th" || language === "ไทย" || language === "mixed";
  const isShort = length === "short" || length === "สั้น";

  if (hasImage) {
    if (isThai && isShort) {
      if (imageIntent === "อาหาร" || imageIntent === "ฉลาก" || !imageIntent) {
        return `
CRITICAL MULTIMODAL RESPONSE FORMAT INSTRUCTION (Thai + Short):
- You MUST respond in Thai, keeping it extremely brief.
- If the image shows food, drink, a menu, or a nutrition label, you MUST follow this exact 5-line format (do not add blank lines, headings, numbers, or other text):
  Line 1: คำวินิจฉัย (กินได้ / ควรเลี่ยง / กินได้แต่ปรับนิด) และระบุว่าเหมาะกับช่วงไหน (เช่น ก่อนวิ่ง/หลังวิ่ง/วันพัก)
  Line 2: จุดที่ดีของมื้อนี้
  Line 3: จุดที่ควรระวัง
  Line 4: แนะนำให้ปรับอย่างไรแบบเป็นรูปธรรม (เช่น เพิ่มโปรตีน หรือลดปริมาณ)
  Line 5: แนะนำเพิ่มเติมหรือทางเลือกสำรอง
- If the image shows a running, sleep, or recovery screenshot, summarize key metrics and give a short 2-3 sentence recommendation (do not output a long analysis).
- Never duplicate heart rate units (do not write "bpm bpm", write only "bpm" once).
`;
      } else {
        return `
CRITICAL MULTIMODAL RESPONSE FORMAT INSTRUCTION (Thai + Short):
- You MUST respond in Thai, keeping it extremely brief.
- Summarize key metrics and give a short 2-3 sentence recommendation (do not output a long analysis, maximum 3-5 short bullets or short paragraphs).
- Never duplicate heart rate units (do not write "bpm bpm", write only "bpm" once).
`;
      }
    }

    return `
RESPONSE FORMAT INSTRUCTION FOR IMAGES:
- If the image shows food, drink, a menu, or a nutrition label:
  1. Diagnose if it's okay to eat based on goal, training day, timing, and recovery.
  2. Mention the best timing (e.g. before/after run, rest day).
  3. Detail key pros (what is good).
  4. Detail key cons/cautions (what to watch out for).
  5. Provide practical adjustments/recommendations.
- If the image shows a running, sleep, or recovery screenshot:
  1. Extract and summarize the key metrics.
  2. Give clear coaching recommendations based on the screenshot data.
- Keep the response concise, constructive, and friendly.
- Never duplicate heart rate units (do not write "bpm bpm").
`;
  }

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
- Never duplicate heart rate units (do not write "bpm" twice).
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
