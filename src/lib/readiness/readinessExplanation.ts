// Pure function — no React, no Supabase. Safe to import anywhere.
import type { DailyReadiness } from "./readinessTypes";

type ExplanationInput = Pick<
  DailyReadiness,
  "band" | "loadTarget" | "reasons" | "signals" | "hasSleepData"
>;

/**
 * Returns a short Thai explanation (1–2 lines) of WHY the readiness recommendation
 * is what it is, focusing on non-obvious cases where the user might be surprised.
 * Returns null when no clarification is needed (e.g. all-clear green band).
 */
export function buildReadinessExplanation(input: ExplanationInput): string | null {
  const { band, loadTarget, reasons, signals } = input;

  if (band === "pain_risk") return null;

  const loadSig = signals.find((s) => s.key === "load");
  const painSig = signals.find((s) => s.key === "pain");
  const recoverySig = signals.find((s) => s.key === "recovery");

  const hasHighLoad = loadSig?.tone === "bad";
  const hasPoorRecovery = recoverySig?.tone === "bad";
  const hasPainWarning = painSig?.tone === "warn" || painSig?.tone === "bad";
  const hasPainReason = reasons.some((r) => r.key === "pain_recent" || r.key === "pain_active");

  // Green band but easy/walk target → load is the limiting factor, not recovery
  if (band === "green" && (loadTarget === "easy" || loadTarget === "walk") && hasHighLoad) {
    return "ร่างกายฟื้นตัวดี แต่โหลดซ้อมสะสมสูงอยู่ — วันนี้คุมเบาไว้จะช่วยฟื้นได้ต่อเนื่อง";
  }

  // Recovering from pain — make the constraint explicit
  if (hasPainWarning && hasPainReason) {
    if (loadTarget === "easy") {
      return "กำลังฟื้นตัวจากอาการเจ็บ — easy ได้แต่อย่ากด pace";
    }
    return "มีประวัติเจ็บเร็ว ๆ นี้ — ค่อย ๆ กลับมาซ้อมทีละน้อย";
  }

  // Red band — low recovery
  if (band === "red") {
    if (hasPoorRecovery) return "ค่าฟื้นตัวต่ำ — ร่างกายต้องการพักมากกว่าซ้อมวันนี้";
    return "สัญญาณร่างกายบอกให้พัก — งดซ้อมหนักและเพิ่มการนอน";
  }

  // Yellow band + high load
  if (band === "yellow" && hasHighLoad) {
    return "โหลดสะสมสัปดาห์นี้สูง — easy run หรือพักก็ได้วันนี้";
  }

  return null;
}
