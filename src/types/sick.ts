export type SickSymptom =
  | "sore_throat"
  | "runny_nose"
  | "nasal_congestion"
  | "cough"
  | "chest_tightness"
  | "fever"
  | "body_ache"
  | "headache"
  | "gi_nausea"
  | "gi_diarrhea"
  | "dizziness"
  | "heavy_fatigue"
  | "other";

export const SICK_SYMPTOM_LABELS: Record<SickSymptom, string> = {
  sore_throat: "เจ็บคอ",
  runny_nose: "น้ำมูก",
  nasal_congestion: "คัดจมูก",
  cough: "ไอ",
  chest_tightness: "แน่นหน้าอก",
  fever: "มีไข้",
  body_ache: "ปวดเมื่อยทั้งตัว",
  headache: "ปวดหัว",
  gi_nausea: "คลื่นไส้",
  gi_diarrhea: "ท้องเสีย",
  dizziness: "เวียนหัว",
  heavy_fatigue: "อ่อนเพลียมาก",
  other: "อื่น ๆ",
};

export const ALL_SICK_SYMPTOMS: SickSymptom[] = [
  "sore_throat",
  "runny_nose",
  "nasal_congestion",
  "cough",
  "chest_tightness",
  "fever",
  "body_ache",
  "headache",
  "gi_nausea",
  "gi_diarrhea",
  "dizziness",
  "heavy_fatigue",
  "other",
];

export type SickSeverity = "mild" | "moderate" | "severe";
export type SickHealthStatus = "normal" | "fatigue" | "sick";
export type SickRiskLevel = "none" | "mild" | "caution" | "hard_stop";
export type SickTrainingDecision = "normal_training_allowed" | "light_movement_only" | "rest_only";

export type SickLog = {
  date: string;
  createdAt: string;
  healthStatus: SickHealthStatus;
  symptoms: SickSymptom[];
  severity?: SickSeverity;
  note?: string;
  // Derived flags (computed from symptoms + severity at save time)
  fever: boolean;
  chestSymptoms: boolean;
  giSymptoms: boolean;
  heavyFatigue: boolean;
  aboveNeckOnly: boolean;
  // Guardrail output
  riskLevel: SickRiskLevel;
  trainingDecision: SickTrainingDecision;
  source: "manual";
};
