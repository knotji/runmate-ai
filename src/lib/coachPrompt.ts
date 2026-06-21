export function buildCoachResponseFormatInstruction(
  language?: string,
  length?: string,
  hasImage?: boolean,
  imageIntent?: string | null
): string {
  const isThai = language === "th" || language === "ไทย" || language === "mixed";
  const isShort = length === "short" || length === "สั้น";

  // ─── Image responses ──────────────────────────────────────────────────────
  if (hasImage) {
    if (isThai && isShort) {
      if (imageIntent === "อาหาร" || imageIntent === "ฉลาก" || !imageIntent) {
        return `
CRITICAL MULTIMODAL RESPONSE FORMAT INSTRUCTION (Thai + Short):
- You MUST respond in Thai, keeping it extremely brief.
- If the image shows food, drink, a menu, or a nutrition label:
  FIRST check the user's message for food choice keywords (เลือก, เมนูไหนดี, อันไหนดี, ช่วยเลือก, กินอะไรดี, เอาอะไรดี, รูปนี้กินอะไรดี):
  → FOOD CHOICE (3-4 lines, no extra text):
    Line 1: Natural Thai pick — use one of:
      "เลือก[ชื่อเมนู]ครับ"  OR  "ผมเลือก[ชื่อเมนู]ครับ"  OR  "จากรูป ผมเลือก[ชื่อเมนู]ครับ"
      For a set: "เลือกชุด[ชื่อเมนู]ครับ" (e.g., "เลือกชุดปลานิลเผาครับ")
      ✗ NEVER write "เลือกชุดนี้ยัง...", "เลือกอันนี้ยัง...", "เลือกอันนี้คือ..."
    Line 2: เหมาะกับวันนี้เพราะ... (short reason)
    Line 3: ถ้าอยากปรับ... (optional adjustment)
    Line 4: ระวัง... (optional caution)
    ✗ Do NOT open with "กินได้ครับ". ✗ Do NOT add workout sections.
  → FOOD ANALYSIS (5 lines, no choice keywords in message):
    Line 1: คำวินิจฉัย (กินได้ / ควรเลี่ยง / กินได้แต่ปรับนิด) + ช่วงที่เหมาะ
    Line 2: จุดที่ดีของมื้อนี้
    Line 3: จุดที่ควรระวัง
    Line 4: แนะนำให้ปรับอย่างไรแบบเป็นรูปธรรม
    Line 5: แนะนำเพิ่มเติมหรือทางเลือกสำรอง
- If the image shows a running, sleep, or recovery screenshot, summarize key metrics and give a short 2-3 sentence recommendation (do not output a long analysis).
- Never duplicate heart rate units (do not write "bpm bpm", write only "bpm" once).
`;
      }
      return `
CRITICAL MULTIMODAL RESPONSE FORMAT INSTRUCTION (Thai + Short):
- You MUST respond in Thai, keeping it extremely brief.
- Summarize key metrics and give a short 2-3 sentence recommendation (maximum 3-5 short bullets or short paragraphs).
- Never duplicate heart rate units (do not write "bpm bpm", write only "bpm" once).
`;
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

  // ─── Text-only responses — intent-aware ──────────────────────────────────
  if (isThai && isShort) {
    return `
RESPONSE FORMAT INSTRUCTION (Thai + Short):
Respond in Thai. Keep it short and natural — 3-5 lines for most answers.

STEP 1: Identify intent from the user's message:
• food_choice (PRIORITY): เลือก, เลือกให้, กินอะไรดี, เอาอะไรดี, เมนูไหนดี, อันไหนดี, ช่วยเลือก → use FOOD CHOICE FORMAT
• food/nutrition: อาหาร, กินได้ไหม, วิเคราะห์มื้อนี้, เครื่องดื่ม → use FOOD FORMAT
• sleep/recovery: อยากนอน, ง่วง, พักอีกได้ไหม, นอนต่อ → use SLEEP FORMAT
• workout/training: ควรซ้อมอะไร, วิ่งได้ไหม, ควรพักไหม, ขอแผน → use WORKOUT FORMAT
• casual/other: short question or follow-up → answer in 1-3 lines naturally

STEP 2: Apply the matching format:

FOOD CHOICE FORMAT (3-4 lines — pick first, PRIORITY over FOOD FORMAT):
  Line 1: Natural Thai pick — use one of these patterns:
    "เลือก[ชื่อเมนู]ครับ"            e.g. "เลือกปลานิลเผาครับ"
    "ผมเลือก[ชื่อเมนู]ครับ"          e.g. "ผมเลือกปลานึ่งครับ"
    "จากรูป ผมเลือก[ชื่อเมนู]ครับ"  e.g. "จากรูป ผมเลือกปลานิลเผาครับ"
    For a set: "เลือกชุด[ชื่อเมนู]ครับ"  e.g. "เลือกชุดปลานิลเผาครับ"
    ✗ NEVER write "เลือกชุดนี้ยัง...", "เลือกอันนี้ยัง...", "เลือกอันนี้คือ..."
  Line 2: เหมาะกับวันนี้เพราะ... (short reason)
  Line 3: ถ้าอยากปรับ... (optional adjustment)
  Line 4: ระวัง... (optional caution)
  ✗ Do NOT open with "กินได้ครับ". ✗ Do NOT add workout sections. ✗ Do NOT write "วันนี้ควรซ้อมอะไร".
  ✓ Active injury: 1 short line only if relevant to recovery choice.

FOOD FORMAT (3-5 lines — no workout sections):
  Line 1: กินได้/เลี่ยง + ช่วงที่เหมาะ (ก่อนวิ่ง/หลังวิ่ง/วันพัก)
  Line 2: จุดดี
  Line 3: จุดระวัง
  Line 4: ปรับยังไง (optional)
  [active injury note: 1 line only if relevant to recovery]
  ✗ Do NOT write "วันนี้ควรซ้อมอะไร" in food answers.
  ✗ Do NOT add workout plan sections to food answers.

SLEEP FORMAT (3-4 lines — conversational):
  Start with the direct answer (e.g. "นอนต่อได้ครับ").
  Add recovery context briefly.
  If active injury or low readiness: recommend rest naturally.
  ✗ Do NOT start with "วันนี้ควรซ้อมอะไร".

WORKOUT FORMAT (ONLY for training questions):
  Line 1: วันนี้ควรซ้อมอะไร (or "พัก / Recovery")
  Line 2: ระยะหรือเวลา + HR/pace target
  Line 3: เหตุผล 1 ประโยค
  Line 4: วิธีปรับถ้าหนักเกินไป
  Line 5: สิ่งที่ต้องระวัง
  [active injury override: if painLevel >= 3 → Rest/Recovery first;
   Easy Run only as conditional: "ถ้าอาการหายและเดินไม่เจ็บ ค่อยกลับมาวิ่งได้"]

Never duplicate units (e.g. "bpm bpm" → "bpm").
`;
  }

  // Thai non-short or English — intent-aware detailed format
  return `
INTENT-FIRST RESPONSE RULE:
Identify the user's intent before responding. Use the matching format.

For food_choice (เลือก, เมนูไหนดี, ช่วยเลือก, อันไหนดี): open with a natural pick — e.g. "เลือกปลานิลเผาครับ", "ผมเลือกปลานึ่งครับ", "จากรูป ผมเลือกปลานิลเผาครับ". For a set: "เลือกชุด[ชื่อเมนู]ครับ". NEVER write "เลือกชุดนี้ยัง..." or "เลือกอันนี้ยัง...". Then short reason, adjustment, caution. Do NOT open with "กินได้ครับ". PRIORITY over generic food format.
For food/nutrition: food coaching format — diagnosis → timing → pros → cons → adjustments.
  Active injury: brief note at end only, not the main answer.
For sleep/recovery: answer naturally and directly. Injury/low readiness can recommend more rest.
For workout/training: 5 components — workout → target (distance/HR/pace) → reason → caution → adjustment.
  Active injury (painLevel >= 3): Rest/Recovery first. Easy Run only as conditional.
For casual/follow-up: reply conversationally and briefly.

Do NOT use workout format for food, sleep, or casual questions.
Keep responses mobile-friendly: 3-6 short lines. No long paragraphs in chat.
Never duplicate units ("bpm bpm" → "bpm").
`;
}
