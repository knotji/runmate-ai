import {
  cleanInteger,
  cleanNumber,
  dateToBangkokDateKey,
  normalizeDash,
  parseDateTime,
  parseDurationToSeconds,
  parsePaceToSecPerKm,
  type CsvRow,
} from "@/lib/import/csvUtils";
import type { ImportSourceMetadata, NormalizedActivityRecord, NormalizedImportResult } from "@/lib/import/normalized";

export function isGarminActivitiesCsv(headers: string[]): boolean {
  const normalized = new Set(headers.map((header) => header.trim().toLowerCase()));
  return ["activity type", "date", "distance", "calories", "time", "avg hr", "max hr", "aerobic te"].every((header) => normalized.has(header));
}

export function parseGarminActivitiesCsvRows(
  rows: CsvRow[],
  options: { originalFileName?: string; importedAt?: string } = {},
): NormalizedImportResult<NormalizedActivityRecord> {
  const warnings: string[] = [];
  const importedAt = options.importedAt ?? new Date().toISOString();
  const records: NormalizedActivityRecord[] = [];

  rows.forEach((row, index) => {
    const date = parseDateTime(get(row, "Date"));
    const durationSeconds = parseDurationToSeconds(get(row, "Time"));
    if (!date || durationSeconds == null) {
      warnings.push(`แถว ${index + 2}: ข้ามเพราะไม่มีวันที่หรือเวลา`);
      return;
    }

    const missingFields: string[] = [];
    const avgPace = parsePaceToSecPerKm(get(row, "Avg Pace"));
    if (avgPace == null && normalizeDash(get(row, "Avg Pace")) == null) missingFields.push("avgPace");

    const source: ImportSourceMetadata = {
      provider: "garmin_connect",
      importType: "csv",
      originalFileName: options.originalFileName,
      detectedFormat: "garmin_activities_csv",
      importedAt,
      confidence: 0.92,
      missingFields,
    };

    records.push({
      dateTime: date.toISOString(),
      dateKey: dateToBangkokDateKey(date),
      activityType: mapActivityType(get(row, "Activity Type")),
      title: normalizeDash(get(row, "Title")),
      distanceKm: cleanNumber(get(row, "Distance")),
      durationSeconds,
      movingTimeSeconds: parseDurationToSeconds(get(row, "Moving Time")),
      elapsedTimeSeconds: parseDurationToSeconds(get(row, "Elapsed Time")),
      calories: cleanInteger(get(row, "Calories")),
      avgHr: cleanInteger(get(row, "Avg HR")),
      maxHr: cleanInteger(get(row, "Max HR")),
      aerobicTrainingEffect: cleanNumber(get(row, "Aerobic TE")),
      anaerobicTrainingEffect: cleanNumber(get(row, "Anaerobic TE")),
      avgPaceSecPerKm: avgPace,
      bestPaceSecPerKm: parsePaceToSecPerKm(get(row, "Best Pace")),
      totalAscentM: cleanNumber(get(row, "Total Ascent")),
      totalDescentM: cleanNumber(get(row, "Total Descent")),
      steps: cleanInteger(get(row, "Steps")),
      bodyBatteryDrain: cleanNumber(get(row, "Body Battery Drain")),
      source,
    });
  });

  return { records, warnings, detectedFormat: "garmin_activities_csv" };
}

function get(row: CsvRow, key: string): string | undefined {
  return row[key] ?? row[Object.keys(row).find((candidate) => candidate.trim().toLowerCase() === key.toLowerCase()) ?? ""];
}

function mapActivityType(value: unknown): NormalizedActivityRecord["activityType"] {
  const text = String(value ?? "").toLowerCase();
  if (/running|run/.test(text)) return "run";
  if (/cardio/.test(text)) return "cardio";
  if (/strength|weight/.test(text)) return "strength";
  if (/walking|walk/.test(text)) return "walk";
  if (/cycling|biking|bike/.test(text)) return "bike";
  return "other";
}
