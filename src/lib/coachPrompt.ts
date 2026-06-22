export function buildCoachResponseFormatInstruction(
  language?: string,
  length?: string,
  hasImage?: boolean,
  imageIntent?: string | null,
): string {
  const wantsEnglish = language === "en" || language === "english";
  const isShort = length === "short" || length === "สั้น";
  const responseLength = isShort
    ? "Keep most answers to 2-4 short Thai lines unless the user asks for detail."
    : "Keep most answers to 3-6 short Thai lines unless the user asks for detail.";

  if (hasImage) {
    return `
IMAGE RESPONSE GUIDANCE:
- Answer the user's actual question about the image.
- Image intent hint: ${imageIntent ?? "not specified"}.
- If the image is food/menu/label and the user asks to choose, pick one clearly first.
- If the image is food/menu/label and the user asks generally, give practical nutrition advice without exact macro claims unless visible.
- If the image is a run/sleep/body screenshot, summarize only the key visible metrics and give practical advice.
- If the image is pain/injury-related, do not diagnose; give conservative guidance and red flags.
- Images in Coach Chat are temporary and must not be described as saved to Report.
- Never duplicate units like "bpm bpm".
${responseLength}
`;
  }

  return `
RESPONSE STYLE GUIDANCE:
- ${wantsEnglish ? "Answer in English unless the user writes Thai." : "Answer in Thai unless the user clearly asks for another language."}
- Free-form chat is the default: answer naturally first.
- Use structured bullets only when the user clearly asks for a plan, workout, food choice, injury guidance, race planning, or a report summary.
- Use Report/Profile/Race context only when relevant, with 1-3 context points max.
- Casual/emotional questions should feel supportive, not like a workout template.
- Training questions still need practical targets and safety adjustments.
- Injury safety still overrides training advice.
${responseLength}
`;
}
