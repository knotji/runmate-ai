import type { LocalHistoryItem } from "@/lib/localHistory";
import type { ReadinessLabel, SleepAnalysis, WorkoutAnalysis } from "@/types/logs";

export type ImportSourceProvider =
  | "samsung_health"
  | "garmin_connect"
  | "apple_health"
  | "strava"
  | "generic_csv"
  | "generic_image"
  | "manual";

export type ImportType = "image" | "csv" | "pdf" | "manual";

export type ImportSourceMetadata = {
  provider: ImportSourceProvider;
  importType: ImportType;
  originalFileName?: string;
  detectedFormat?: string;
  importedAt: string;
  confidence?: number;
  missingFields?: string[];
};

export type NormalizedSleepRecord = {
  dateKey: string;
  sleepScore?: number;
  durationMinutes?: number;
  sleepNeedMinutes?: number;
  bedtime?: string;
  wakeTime?: string;
  restingHeartRate?: number;
  overnightHeartRate?: number;
  hrvMs?: number;
  hrvStatus?: string;
  bodyBatteryChange?: number;
  energyScore?: number;
  spo2Avg?: number;
  spo2Lowest?: number;
  respirationAvg?: number;
  respirationLowest?: number;
  quality?: string;
  source: ImportSourceMetadata;
};

export type NormalizedActivityRecord = {
  dateTime: string;
  dateKey: string;
  activityType: "run" | "walk" | "cardio" | "strength" | "bike" | "other";
  title?: string;
  distanceKm?: number;
  durationSeconds?: number;
  movingTimeSeconds?: number;
  elapsedTimeSeconds?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  aerobicTrainingEffect?: number;
  anaerobicTrainingEffect?: number;
  avgPaceSecPerKm?: number;
  bestPaceSecPerKm?: number;
  totalAscentM?: number;
  totalDescentM?: number;
  steps?: number;
  bodyBatteryDrain?: number;
  source: ImportSourceMetadata;
};

export type NormalizedImportResult<T> = {
  records: T[];
  warnings: string[];
  detectedFormat: string;
};

export type SleepHistoryData = SleepAnalysis & {
  source?: ImportSourceMetadata;
  dateKey?: string;
  recordedAt?: string;
};

export type WorkoutHistoryData = WorkoutAnalysis & {
  source?: ImportSourceMetadata;
  dateKey?: string;
  recordedAt?: string;
};

export function normalizedSleepToHistoryItem(record: NormalizedSleepRecord): LocalHistoryItem {
  const recordedAt = `${record.dateKey}T12:00:00+07:00`;
  const readinessScore = clampScore(record.sleepScore ?? estimateSleepReadiness(record));
  const data: SleepHistoryData = {
    extracted: {
      date: record.dateKey,
      sleepDuration: record.durationMinutes != null ? secondsToDuration(record.durationMinutes * 60) : null,
      actualSleepDurationMinutes: record.durationMinutes ?? null,
      actualSleepDurationText: record.durationMinutes != null ? formatSleepDuration(record.durationMinutes) : null,
      timeInBedMinutes: null,
      timeInBedText: null,
      sleepStartTime: record.bedtime ?? null,
      sleepEndTime: record.wakeTime ?? null,
      avgSleepingHeartRate: record.overnightHeartRate ?? record.restingHeartRate ?? null,
      avgSleepingHrv: record.hrvMs ?? null,
      avgRespiratoryRate: record.respirationAvg ?? null,
      sleepDurationSource: record.durationMinutes != null ? "actual" : "unknown",
      sleepScore: record.sleepScore ?? null,
      energyScore: record.energyScore ?? null,
      restingHR: record.restingHeartRate ?? record.overnightHeartRate ?? null,
      hrv: record.hrvMs ?? null,
      sleepQualityLabel: record.quality ?? record.hrvStatus ?? null,
      visibleNotes: buildSleepVisibleNotes(record),
    },
    coach: {
      readinessScore,
      readinessLabel: readinessLabelFromScore(readinessScore),
      aiSummary: "นำเข้าข้อมูลการนอนจาก CSV แล้ว",
      todayRecommendation: record.energyScore == null
        ? "ไม่มี Energy Score จากแหล่งข้อมูลนี้ — ประเมินจากการนอน HRV และโหลดซ้อมแทน"
        : "ใช้คะแนนการนอนและ Energy Score เพื่อประเมินความพร้อม",
      nutritionFocus: "เติมน้ำและมื้อเช้าให้พอ โดยดูร่วมกับแผนซ้อมวันนี้",
      recoveryFocus: "ดูคุณภาพการนอน HRV และชีพจรพักร่วมกัน",
      sleepFocus: record.sleepNeedMinutes && record.durationMinutes && record.durationMinutes < record.sleepNeedMinutes
        ? "เวลานอนต่ำกว่า sleep need ควรหาเวลาพักเพิ่ม"
        : "รักษาเวลานอนให้สม่ำเสมอ",
      warningNotes: record.energyScore == null
        ? "ไม่มี Energy Score จากแหล่งข้อมูลนี้ — ประเมินจากการนอน HRV และโหลดซ้อมแทน"
        : "",
    },
    confidence: "medium",
    unclearFields: record.source.missingFields ?? [],
    source: record.source,
    dateKey: record.dateKey,
    recordedAt,
  };

  return {
    id: `sleep-${record.dateKey}-${stableHash(JSON.stringify(record.source))}`,
    type: "sleep",
    createdAt: record.source.importedAt,
    recordedAt,
    dateKey: record.dateKey,
    source: record.source,
    data,
  };
}

export function normalizedActivityToHistoryItem(record: NormalizedActivityRecord): LocalHistoryItem {
  const duration = record.durationSeconds != null ? secondsToDuration(record.durationSeconds) : null;
  const workoutKind = activityTypeToWorkoutKind(record.activityType);
  const data: WorkoutHistoryData = {
    extracted: {
      workoutKind,
      date: record.dateKey,
      distanceKm: record.distanceKm ?? null,
      duration,
      avgPace: record.avgPaceSecPerKm != null ? formatPace(record.avgPaceSecPerKm) : null,
      avgSpeedKmh: record.distanceKm != null && record.durationSeconds
        ? Math.round((record.distanceKm / (record.durationSeconds / 3600)) * 10) / 10
        : null,
      avgHR: record.avgHr ?? null,
      maxHR: record.maxHr ?? null,
      cadence: null,
      calories: record.calories ?? null,
      elevationGain: record.totalAscentM ?? null,
      vo2Max: null,
      sweatLossMl: null,
      visibleMetrics: buildActivityVisibleMetrics(record),
      intensity: record.aerobicTrainingEffect != null && record.aerobicTrainingEffect >= 3.5 ? "hard" : "moderate",
    },
    coach: {
      workoutSummary: record.title || activityLabel(record.activityType),
      intensityAssessment: record.aerobicTrainingEffect != null ? `Aerobic TE ${record.aerobicTrainingEffect}` : "นำเข้าจาก CSV",
      trainingLoadNote: "บันทึกกิจกรรมจาก CSV เพื่อใช้คำนวณโหลดซ้อม",
      wasTooHard: false,
      recoveryAdvice: "ดู HR, ระยะเวลา และโหลดรวมของวันร่วมกัน",
      nutritionAfterWorkout: "เติมน้ำและโปรตีน/คาร์บตามความหนักของกิจกรรม",
      nextWorkoutSuggestion: "ปรับตาม readiness และแผนซ้อมล่าสุด",
      coachNote: "ข้อมูลนี้นำเข้าจากไฟล์ CSV",
    },
    confidence: "medium",
    unclearFields: record.source.missingFields ?? [],
    source: record.source,
    dateKey: record.dateKey,
    recordedAt: record.dateTime,
  };

  return {
    id: `workout-${record.dateKey}-${stableHash(`${record.dateTime}-${record.activityType}-${record.durationSeconds ?? ""}-${record.distanceKm ?? ""}`)}`,
    type: "workout",
    createdAt: record.source.importedAt,
    recordedAt: record.dateTime,
    dateKey: record.dateKey,
    source: record.source,
    data,
  };
}

function estimateSleepReadiness(record: NormalizedSleepRecord): number {
  let score = record.sleepScore ?? 65;
  if (record.durationMinutes != null) {
    if (record.durationMinutes < 300) score -= 15;
    else if (record.durationMinutes < 360) score -= 8;
    else if (record.durationMinutes >= 420) score += 3;
  }
  if (record.hrvMs != null && record.hrvMs < 35) score -= 5;
  if (record.restingHeartRate != null && record.restingHeartRate > 65) score -= 5;
  return score;
}

function buildSleepVisibleNotes(record: NormalizedSleepRecord): string | null {
  const parts = [
    record.sleepNeedMinutes != null ? `Sleep need ${formatSleepDuration(record.sleepNeedMinutes)}` : null,
    record.hrvStatus ? `HRV ${record.hrvStatus}` : null,
    record.bodyBatteryChange != null ? `Body Battery ${record.bodyBatteryChange}` : null,
    record.spo2Avg != null ? `SpO2 ${record.spo2Avg}%` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function buildActivityVisibleMetrics(record: NormalizedActivityRecord): string[] {
  return [
    record.title,
    record.distanceKm != null ? `${record.distanceKm} km` : null,
    record.durationSeconds != null ? secondsToDuration(record.durationSeconds) : null,
    record.avgHr != null ? `Avg HR ${record.avgHr}` : null,
    record.maxHr != null ? `Max HR ${record.maxHr}` : null,
    record.calories != null ? `${record.calories} kcal` : null,
    record.aerobicTrainingEffect != null ? `Aerobic TE ${record.aerobicTrainingEffect}` : null,
    record.bodyBatteryDrain != null ? `Body Battery ${record.bodyBatteryDrain}` : null,
  ].filter((value): value is string => Boolean(value));
}

function activityTypeToWorkoutKind(type: NormalizedActivityRecord["activityType"]): WorkoutAnalysis["extracted"]["workoutKind"] {
  if (type === "run") return "outdoor_run";
  if (type === "walk") return "walk";
  if (type === "strength") return "strength";
  if (type === "bike") return "cycling";
  return "other";
}

function activityLabel(type: NormalizedActivityRecord["activityType"]): string {
  if (type === "run") return "วิ่ง";
  if (type === "walk") return "เดิน";
  if (type === "strength") return "เวท";
  if (type === "bike") return "ปั่นจักรยาน";
  if (type === "cardio") return "คาร์ดิโอ";
  return "กิจกรรม";
}

function readinessLabelFromScore(score: number): ReadinessLabel {
  if (score >= 80) return "Excellent";
  if (score >= 66) return "Good";
  if (score >= 50) return "Fair";
  return "Low";
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function secondsToDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatSleepDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} ชม. ${m} นาที`;
}

function formatPace(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function stableHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
