import type { SleepAnalysis } from "@/types/logs";
import type { GoogleHealthSleepDataPoint } from "@/lib/googleHealth/api";

function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} m`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** Extracts the history_items id suffix from a dataPoint's resource name
 *  ("users/me/dataTypes/sleep/dataPoints/{id}"). */
export function googleHealthDataPointId(name: string): string {
  const parts = name.split("/");
  return parts[parts.length - 1];
}

export function googleHealthSleepHistoryItemId(name: string): string {
  return `ghealth-sleep-${googleHealthDataPointId(name)}`;
}

/** Maps one Google Health sleep data point to the `extracted` half of
 *  SleepAnalysis. `coach` is filled in separately via AI — see
 *  src/lib/prompts/coachFromStructuredData.ts. restingHR/hrv are passed in
 *  separately since they come from different data types (daily summaries),
 *  correlated by date rather than bundled with the sleep session itself. */
export function mapGoogleHealthSleepToExtracted(
  dp: GoogleHealthSleepDataPoint,
  dailyRestingHR: number | null,
  dailyHrv: number | null,
): SleepAnalysis["extracted"] {
  const { interval, summary } = dp.sleep;
  const dateOfSleep = interval.endTime.slice(0, 10);
  const minutesAsleep = summary?.minutesAsleep ?? null;
  const minutesInSleepPeriod = summary?.minutesInSleepPeriod ?? null;

  const stageMap = new Map((summary?.stagesSummary ?? []).map((s) => [s.type.toUpperCase(), s.minutes]));
  const hasStages = stageMap.size > 0;

  return {
    date: dateOfSleep,
    sleepDuration: minutesAsleep != null ? formatDurationMinutes(minutesAsleep) : null,
    actualSleepDurationMinutes: minutesAsleep,
    actualSleepDurationText: minutesAsleep != null ? formatDurationMinutes(minutesAsleep) : null,
    timeInBedMinutes: minutesInSleepPeriod,
    timeInBedText: minutesInSleepPeriod != null ? formatDurationMinutes(minutesInSleepPeriod) : null,
    sleepStartTime: interval.startTime,
    sleepEndTime: interval.endTime,
    avgSleepingHeartRate: null, // not part of the sleep session payload — would need per-sample heart-rate correlation
    avgSleepingHrv: null,
    avgRespiratoryRate: null,
    sleepStageAwakeMinutes: hasStages ? (stageMap.get("AWAKE") ?? null) : null,
    sleepStageRemMinutes: hasStages ? (stageMap.get("REM") ?? null) : null,
    sleepStageLightMinutes: hasStages ? (stageMap.get("LIGHT") ?? null) : null,
    sleepStageDeepMinutes: hasStages ? (stageMap.get("DEEP") ?? null) : null,
    sleepStageMinutes: hasStages
      ? {
          awake: stageMap.get("AWAKE") ?? null,
          rem: stageMap.get("REM") ?? null,
          light: stageMap.get("LIGHT") ?? null,
          deep: stageMap.get("DEEP") ?? null,
        }
      : null,
    sleepDurationSource: "actual",
    mergedFromMultipleImages: false,
    sleepScore: null, // not part of the public API — same as Fitbit/Samsung's proprietary scores
    energyScore: null,
    restingHR: dailyRestingHR,
    hrv: dailyHrv,
    sleepQualityLabel: null,
    visibleNotes: "นำเข้าอัตโนมัติจาก Google Health",
  };
}
