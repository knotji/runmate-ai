/**
 * Correct known AI Thai food-vocabulary errors before display.
 * "ของเสียง" is an AI hallucination for "ของทอด" (fried food).
 */
export function sanitizeAIThaiText(text: string): string {
  return text.replace(/ของเสียง/g, "ของทอด");
}
