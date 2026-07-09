import type { SickLog, SickSymptom, SickSeverity, SickRiskLevel, SickTrainingDecision, SickHealthStatus } from "@/types/sick";

// Symptoms that are only above the neck — mild-only path
const ABOVE_NECK_SYMPTOMS: SickSymptom[] = [
  "sore_throat",
  "runny_nose",
  "nasal_congestion",
  "headache",
];

// Symptoms that always trigger hard stop
const HARD_STOP_SYMPTOMS: SickSymptom[] = [
  "chest_tightness",
  "fever",
  "gi_nausea",
  "gi_diarrhea",
  "dizziness",
  "heavy_fatigue",
];

export function hasHardStopSymptoms(symptoms: SickSymptom[], severity?: SickSeverity): boolean {
  // Severe rating on its own is a hard stop
  if (severity === "severe") return true;
  // Specific high-risk symptoms are always a hard stop
  if (symptoms.some((s) => HARD_STOP_SYMPTOMS.includes(s))) return true;
  // Moderate cough may indicate respiratory involvement — treated as hard stop
  if (symptoms.includes("cough") && severity === "moderate") return true;
  return false;
}

export function isMildAboveNeckOnly(symptoms: SickSymptom[], severity?: SickSeverity): boolean {
  if (!symptoms.length) return false;
  if (hasHardStopSymptoms(symptoms, severity)) return false;
  if (severity === "moderate") return false;
  return symptoms.every((s) => ABOVE_NECK_SYMPTOMS.includes(s));
}

export function getIllnessRiskLevel(input: {
  healthStatus: SickHealthStatus;
  symptoms: SickSymptom[];
  severity?: SickSeverity;
}): SickRiskLevel {
  const { healthStatus, symptoms, severity } = input;
  if (healthStatus === "normal") return "none";
  if (healthStatus === "fatigue" && !symptoms?.length) return "caution";
  if (!symptoms?.length) return "caution"; // sick declared but no symptoms — conservative
  if (hasHardStopSymptoms(symptoms, severity)) return "hard_stop";
  if (isMildAboveNeckOnly(symptoms, severity)) return "mild";
  return "caution";
}

export function getIllnessTrainingDecision(riskLevel: SickRiskLevel): SickTrainingDecision {
  if (riskLevel === "hard_stop") return "rest_only";
  if (riskLevel === "mild" || riskLevel === "caution") return "light_movement_only";
  return "normal_training_allowed";
}

export function deriveSickLogFlags(symptoms: SickSymptom[], severity?: SickSeverity): {
  fever: boolean;
  chestSymptoms: boolean;
  giSymptoms: boolean;
  heavyFatigue: boolean;
  aboveNeckOnly: boolean;
} {
  return {
    fever: symptoms.includes("fever"),
    chestSymptoms:
      symptoms.includes("chest_tightness") ||
      (symptoms.includes("cough") && (severity === "moderate" || severity === "severe")),
    giSymptoms: symptoms.includes("gi_nausea") || symptoms.includes("gi_diarrhea"),
    heavyFatigue: symptoms.includes("heavy_fatigue") || severity === "severe",
    aboveNeckOnly: isMildAboveNeckOnly(symptoms, severity),
  };
}

export function buildSickLog(params: {
  date: string;
  createdAt: string;
  healthStatus: SickHealthStatus;
  symptoms: SickSymptom[];
  severity?: SickSeverity;
  note?: string;
}): SickLog {
  const { date, createdAt, healthStatus, symptoms, severity, note } = params;
  const flags = deriveSickLogFlags(symptoms, severity);
  const riskLevel = getIllnessRiskLevel({ healthStatus, symptoms, severity });
  const trainingDecision = getIllnessTrainingDecision(riskLevel);
  return {
    date,
    createdAt,
    healthStatus,
    symptoms,
    severity,
    note,
    ...flags,
    riskLevel,
    trainingDecision,
    source: "manual",
  };
}

export function getIllnessTodayHeadline(log: Pick<SickLog, "riskLevel">): string {
  if (log.riskLevel === "hard_stop") return "วันนี้พักก่อน ร่างกายกำลังสู้กับอาการป่วย";
  if (log.riskLevel === "mild" || log.riskLevel === "caution") return "วันนี้ลดความหนักไว้ก่อน";
  return "";
}

export function getIllnessSubtext(log: Pick<SickLog, "fever" | "chestSymptoms" | "giSymptoms" | "heavyFatigue" | "riskLevel">): string {
  if (log.fever) return "วันนี้งดซ้อม เน้นพัก ดื่มน้ำ และนอนให้พอ";
  if (log.chestSymptoms) return "มีอาการที่หน้าอก วันนี้งดซ้อม เน้นพักผ่อน";
  if (log.giSymptoms) return "มีอาการทางระบบย่อยอาหาร วันนี้งดซ้อม เน้นพักและดื่มน้ำ";
  if (log.heavyFatigue) return "อ่อนเพลียมาก วันนี้งดซ้อม เน้นพักผ่อน";
  if (log.riskLevel === "hard_stop") return "วันนี้งดซ้อม เน้นพัก ดื่มน้ำ และนอนให้พอ";
  if (log.riskLevel === "mild") return "มีอาการเหนือคอเล็กน้อยและไม่มีไข้ ถ้าจะขยับให้เบามากและหยุดทันทีถ้าอาการแย่ลง";
  return "ลดความหนักไว้ก่อน ฟังร่างกายเป็นหลัก";
}

export function getIllnessCoachGuidance(log: Pick<SickLog, "riskLevel">): string {
  if (log.riskLevel === "hard_stop") {
    return "จากข้อมูลวันนี้เหมือนร่างกายกำลังป่วยอยู่ วันนี้งดซ้อมหนักก่อนนะครับ เน้นพัก ดื่มน้ำ และนอนให้พอ";
  }
  if (log.riskLevel === "mild") {
    return "มีอาการเหนือคอเล็กน้อย ถ้าจะขยับตัวให้เป็นเดินเบา ๆ หรือ mobility เบา 10–20 นาทีเท่านั้น และหยุดทันทีถ้าอาการแย่ลง";
  }
  return "ร่างกายส่งสัญญาณไม่สบาย วันนี้ลดความหนักหรือพักเลย";
}

export function isSickRiskLevel(value: unknown): value is SickRiskLevel {
  return value === "none" || value === "mild" || value === "caution" || value === "hard_stop";
}
