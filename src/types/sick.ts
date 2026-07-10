export type SickSymptom =
  | "sore_throat"
  | "runny_nose"
  | "nasal_congestion"
  | "cough"
  | "chest_tightness"
  | "breathing_difficulty"
  | "fever"
  | "body_ache"
  | "headache"
  | "chills"
  | "gi_nausea"
  | "gi_diarrhea"
  | "gi_vomiting"
  | "dizziness"
  | "heavy_fatigue"
  | "other";

export const SICK_SYMPTOM_LABELS: Record<SickSymptom, string> = {
  sore_throat: "เจ็บคอ",
  runny_nose: "น้ำมูก",
  nasal_congestion: "คัดจมูก",
  cough: "ไอ",
  chest_tightness: "แน่นหน้าอก",
  breathing_difficulty: "หายใจไม่โล่ง",
  fever: "มีไข้",
  body_ache: "ปวดเมื่อยทั้งตัว",
  headache: "ปวดหัว",
  chills: "หนาวสั่น",
  gi_nausea: "คลื่นไส้",
  gi_diarrhea: "ท้องเสีย",
  gi_vomiting: "อาเจียน",
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
  "breathing_difficulty",
  "fever",
  "body_ache",
  "headache",
  "chills",
  "gi_nausea",
  "gi_diarrhea",
  "gi_vomiting",
  "dizziness",
  "heavy_fatigue",
  "other",
];

export type SymptomGroup = {
  id: string;
  label: string;
  symptoms: SickSymptom[];
};

export const SYMPTOM_GROUPS: SymptomGroup[] = [
  { id: "throat_nose",  label: "คอ / จมูก",          symptoms: ["sore_throat", "runny_nose", "nasal_congestion"] },
  { id: "cough_chest",  label: "ไอ / หน้าอก",        symptoms: ["cough", "chest_tightness", "breathing_difficulty"] },
  { id: "fever_ache",   label: "ไข้ / ปวดเมื่อย",   symptoms: ["fever", "body_ache", "headache", "chills"] },
  { id: "stomach",      label: "ท้อง / คลื่นไส้",   symptoms: ["gi_nausea", "gi_diarrhea", "gi_vomiting"] },
  { id: "dizzy_fatigue",label: "เวียนหัว / เพลียมาก", symptoms: ["dizziness", "heavy_fatigue"] },
  { id: "other",        label: "อื่น ๆ",             symptoms: ["other"] },
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
