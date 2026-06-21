import { formatBpm } from "./format";

export type CoachStylePreviewInput = {
  tone?: string;
  length?: string;
  language?: string;
  easyHrCap?: number | string | null;
};

/**
 * Generates a preview coaching recommendation based on style settings.
 */
export function getCoachStylePreview(input: CoachStylePreviewInput): string {
  const { tone, length, language, easyHrCap } = input;

  const hrStr = easyHrCap ? formatBpm(easyHrCap) : "Easy HR cap";

  const isThai = language === "th" || language === "ไทย" || language === "mixed";
  const isShort = length === "short" || length === "สั้น";
  const isFriendly = tone === "friendly" || tone === "เป็นกันเอง";

  if (isThai) {
    if (isShort && isFriendly) {
      return `วันนี้วิ่ง easy เบา ๆ พอครับ คุม HR ไม่เกิน ${hrStr} ถ้าเริ่มเหนื่อยให้ลด pace หรือเดินสลับได้เลย`;
    }
    if (isShort) {
      return `วันนี้แนะนำ Easy Run คุม HR ไม่เกิน ${hrStr} และหลีกเลี่ยงการเร่ง pace`;
    }
    return `วันนี้เหมาะกับการวิ่ง Easy Run โดยคุม HR ไม่เกิน ${hrStr} เพื่อให้ร่างกายได้พัฒนา aerobic base โดยไม่สะสมความล้ามากเกินไป`;
  }

  return `Today is good for an easy run. Keep HR under ${hrStr}, and slow down if effort starts to climb.`;
}
