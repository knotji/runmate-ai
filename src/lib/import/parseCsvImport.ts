import { parseCsvHeaders, parseCsvText, cleanInteger, cleanNumber, dateToBangkokDateKey, normalizeDash, parseDateTime, parseDurationToMinutes, parseDurationToSeconds, parsePaceToSecPerKm } from "@/lib/import/csvUtils";
import { detectCsvFormat, UNKNOWN_CSV_MESSAGE, type CsvFormat } from "@/lib/import/detectImportSource";
import { parseGarminActivitiesCsvRows } from "@/lib/import/adapters/garminActivitiesCsv";
import { parseGarminSleepCsvRows } from "@/lib/import/adapters/garminSleepCsv";
import type { ImportSourceMetadata, NormalizedActivityRecord, NormalizedImportResult, NormalizedSleepRecord } from "@/lib/import/normalized";

export type CsvImportKind = "sleep" | "activity";

export type ParsedCsvImport =
  | ({ kind: "sleep" } & NormalizedImportResult<NormalizedSleepRecord>)
  | ({ kind: "activity" } & NormalizedImportResult<NormalizedActivityRecord>);

export function parseCsvImportText(
  text: string,
  options: { originalFileName?: string; preferredKind?: CsvImportKind; importedAt?: string } = {},
): ParsedCsvImport | { kind: "unknown"; format: CsvFormat; message: string; warnings: string[] } {
  const headers = parseCsvHeaders(text);
  const rows = parseCsvText(text);
  const format = detectCsvFormat(headers);

  if (format === "garmin_activities_csv") {
    return { kind: "activity", ...parseGarminActivitiesCsvRows(rows, options) };
  }

  if (format === "garmin_sleep_csv") {
    return { kind: "sleep", ...parseGarminSleepCsvRows(rows, options) };
  }

  if (format === "generic_activity_csv" || (format === "unknown_csv" && options.preferredKind === "activity")) {
    const result = parseGenericActivityRows(rows, options);
    if (result.records.length) return { kind: "activity", ...result };
  }

  if (format === "generic_sleep_csv" || (format === "unknown_csv" && options.preferredKind === "sleep")) {
    const result = parseGenericSleepRows(rows, options);
    if (result.records.length) return { kind: "sleep", ...result };
  }

  return { kind: "unknown", format, message: UNKNOWN_CSV_MESSAGE, warnings: [] };
}

function parseGenericActivityRows(
  rows: Record<string, string>[],
  options: { originalFileName?: string; importedAt?: string } = {},
): NormalizedImportResult<NormalizedActivityRecord> {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const records: NormalizedActivityRecord[] = [];

  rows.forEach((row, index) => {
    const date = parseDateTime(pick(row, ["Date", "Start Time", "Time", "Activity Date"]));
    const durationSeconds = parseDurationToSeconds(pick(row, ["Duration", "Time", "Elapsed Time", "Moving Time"]));
    if (!date || durationSeconds == null) {
      warnings.push(`แถว ${index + 2}: ข้ามเพราะไม่มีวันที่หรือเวลา`);
      return;
    }

    const activityType = mapGenericActivity(pick(row, ["Activity Type", "Activity", "Type", "Sport"]));
    records.push({
      dateTime: date.toISOString(),
      dateKey: dateToBangkokDateKey(date),
      activityType,
      title: normalizeDash(pick(row, ["Title", "Name", "Activity"])),
      distanceKm: cleanNumber(pick(row, ["Distance", "Distance Km", "Distance (km)"])),
      durationSeconds,
      calories: cleanInteger(pick(row, ["Calories", "Calories (kcal)", "Kcal"])),
      avgHr: cleanInteger(pick(row, ["Avg HR", "Average HR", "Average Heart Rate"])),
      maxHr: cleanInteger(pick(row, ["Max HR", "Maximum HR", "Max Heart Rate"])),
      avgPaceSecPerKm: parsePaceToSecPerKm(pick(row, ["Avg Pace", "Average Pace", "Pace"])),
      source: source("generic_csv", "generic_activity_csv", importedAt, options.originalFileName),
    });
  });

  return { records, warnings, detectedFormat: "generic_activity_csv" };
}

function parseGenericSleepRows(
  rows: Record<string, string>[],
  options: { originalFileName?: string; importedAt?: string } = {},
): NormalizedImportResult<NormalizedSleepRecord> {
  const importedAt = options.importedAt ?? new Date().toISOString();
  const warnings: string[] = [];
  const records: NormalizedSleepRecord[] = [];

  rows.forEach((row, index) => {
    const date = parseDateTime(pick(row, ["Date", "Day", "Sleep Date"]));
    if (!date) {
      warnings.push(`แถว ${index + 2}: ข้ามเพราะไม่มีวันที่`);
      return;
    }

    records.push({
      dateKey: dateToBangkokDateKey(date),
      sleepScore: cleanInteger(pick(row, ["Sleep Score", "Score", "sleep_score"])),
      durationMinutes: parseDurationToMinutes(pick(row, ["Duration", "Sleep Duration", "Total Sleep"])),
      sleepNeedMinutes: parseDurationToMinutes(pick(row, ["Sleep Need", "Need"])),
      bedtime: normalizeDash(pick(row, ["Bedtime", "Start", "Sleep Start"])),
      wakeTime: normalizeDash(pick(row, ["Wake Time", "End", "Sleep End"])),
      restingHeartRate: cleanInteger(pick(row, ["Resting Heart Rate", "Resting HR", "RHR"])),
      hrvMs: cleanInteger(pick(row, ["HRV", "HRV Status", "Avg HRV"])),
      energyScore: cleanInteger(pick(row, ["Energy Score", "Energy"])),
      quality: normalizeDash(pick(row, ["Quality", "Sleep Quality"])),
      source: source("generic_csv", "generic_sleep_csv", importedAt, options.originalFileName),
    });
  });

  return { records, warnings, detectedFormat: "generic_sleep_csv" };
}

function source(
  provider: ImportSourceMetadata["provider"],
  detectedFormat: string,
  importedAt: string,
  originalFileName?: string,
): ImportSourceMetadata {
  return {
    provider,
    importType: "csv",
    originalFileName,
    detectedFormat,
    importedAt,
    confidence: 0.72,
    missingFields: [],
  };
}

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const found = Object.keys(row).find((candidate) => normalizeKey(candidate) === normalizeKey(key));
    if (found && normalizeDash(row[found]) != null) return row[found];
  }
  return undefined;
}

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function mapGenericActivity(value: unknown): NormalizedActivityRecord["activityType"] {
  const text = String(value ?? "").toLowerCase();
  if (/run|running/.test(text)) return "run";
  if (/walk/.test(text)) return "walk";
  if (/cardio/.test(text)) return "cardio";
  if (/strength|weight/.test(text)) return "strength";
  if (/bike|biking|cycling|ride/.test(text)) return "bike";
  return "other";
}
