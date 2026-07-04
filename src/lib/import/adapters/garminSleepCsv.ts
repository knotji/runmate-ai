import {
  cleanInteger,
  cleanNumber,
  dateToBangkokDateKey,
  normalizeDash,
  parseDateTime,
  parseDurationToMinutes,
  type CsvRow,
} from "@/lib/import/csvUtils";
import type { ImportSourceMetadata, NormalizedImportResult, NormalizedSleepRecord } from "@/lib/import/normalized";

export function isGarminSleepCsv(headers: string[]): boolean {
  const normalized = new Set(headers.map((header) => header.trim().toLowerCase()));
  return [
    "sleep score 4 weeks",
    "score",
    "resting heart rate",
    "body battery",
    "pulse ox",
    "respiration",
    "hrv status",
    "quality",
    "duration",
    "sleep need",
    "bedtime",
    "wake time",
  ].every((header) => normalized.has(header));
}

export function parseGarminSleepCsvRows(
  rows: CsvRow[],
  options: { originalFileName?: string; importedAt?: string } = {},
): NormalizedImportResult<NormalizedSleepRecord> {
  const warnings: string[] = [];
  const importedAt = options.importedAt ?? new Date().toISOString();
  const records: NormalizedSleepRecord[] = [];

  rows.forEach((row, index) => {
    const date = parseDateTime(get(row, "Sleep Score 4 Weeks"));
    if (!date) {
      warnings.push(`แถว ${index + 2}: ข้ามเพราะไม่มีวันที่`);
      return;
    }

    const missingFields = ["energyScore"];
    const hrvText = normalizeDash(get(row, "HRV Status"));
    const hrvMs = cleanInteger(hrvText);
    const source: ImportSourceMetadata = {
      provider: "garmin_connect",
      importType: "csv",
      originalFileName: options.originalFileName,
      detectedFormat: "garmin_sleep_csv",
      importedAt,
      confidence: 0.9,
      missingFields,
    };

    records.push({
      dateKey: dateToBangkokDateKey(date),
      sleepScore: cleanInteger(get(row, "Score")),
      durationMinutes: parseDurationToMinutes(get(row, "Duration")),
      sleepNeedMinutes: parseDurationToMinutes(get(row, "Sleep Need")),
      bedtime: normalizeDash(get(row, "Bedtime")),
      wakeTime: normalizeDash(get(row, "Wake Time")),
      restingHeartRate: cleanInteger(get(row, "Resting Heart Rate")),
      hrvMs,
      hrvStatus: hrvText && hrvMs == null ? hrvText : undefined,
      bodyBatteryChange: cleanNumber(get(row, "Body Battery")),
      spo2Avg: cleanNumber(get(row, "Pulse Ox")),
      respirationAvg: cleanNumber(get(row, "Respiration")),
      quality: normalizeDash(get(row, "Quality")),
      source,
    });
  });

  return { records, warnings, detectedFormat: "garmin_sleep_csv" };
}

function get(row: CsvRow, key: string): string | undefined {
  return row[key] ?? row[Object.keys(row).find((candidate) => candidate.trim().toLowerCase() === key.toLowerCase()) ?? ""];
}
