export type CsvFormat =
  | "garmin_activities_csv"
  | "garmin_sleep_csv"
  | "generic_activity_csv"
  | "generic_sleep_csv"
  | "unknown_csv";

export const UNKNOWN_CSV_MESSAGE =
  "ยังอ่าน CSV รูปแบบนี้ไม่ได้ ลองส่งเป็นรูปหน้าสรุป หรือไฟล์จาก Garmin/Apple Health ที่มีคอลัมน์มาตรฐาน";

export function detectCsvFormat(headers: string[]): CsvFormat {
  const normalized = new Set(headers.map(normalizeHeader));
  const has = (header: string) => normalized.has(normalizeHeader(header));
  const hasSome = (values: string[]) => values.some(has);

  if (
    has("Activity Type") &&
    has("Date") &&
    has("Distance") &&
    has("Calories") &&
    has("Time") &&
    has("Avg HR") &&
    has("Max HR") &&
    has("Aerobic TE")
  ) {
    return "garmin_activities_csv";
  }

  if (
    has("Sleep Score 4 Weeks") &&
    has("Score") &&
    has("Resting Heart Rate") &&
    has("Body Battery") &&
    has("Pulse Ox") &&
    has("Respiration") &&
    has("HRV Status") &&
    has("Quality") &&
    has("Duration") &&
    has("Sleep Need") &&
    has("Bedtime") &&
    has("Wake Time")
  ) {
    return "garmin_sleep_csv";
  }

  if (hasSome(["activity", "activity type", "type", "sport"]) && hasSome(["duration", "time"]) && hasSome(["date", "start time"])) {
    return "generic_activity_csv";
  }

  if (hasSome(["sleep score", "score", "sleep_score"]) && hasSome(["duration", "sleep duration", "total sleep"]) && hasSome(["date", "day"])) {
    return "generic_sleep_csv";
  }

  return "unknown_csv";
}

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}
