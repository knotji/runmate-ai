import type { SleepAnalysis } from "@/types/logs";

// Shape of one entry in Fitbit's Sleep Log API response
// (GET /1.2/user/-/sleep/date/[date].json — "sleep" array).
// Sleep score / energy score / HRV / respiratory rate are NOT part of the public
// Sleep Log API (they're Fitbit's own proprietary scoring, same situation as
// Samsung Health's sleep/energy scores) — left null here, same "not available"
// convention the rest of extracted uses for anything the source can't provide.
export type FitbitSleepLogEntry = {
  logId: number;
  dateOfSleep: string;
  startTime: string;
  endTime: string;
  minutesAsleep: number;
  minutesAwake: number;
  timeInBed: number;
  efficiency: number;
  type: "stages" | "classic";
  levels?: {
    summary?: {
      deep?: { minutes: number };
      light?: { minutes: number };
      rem?: { minutes: number };
      wake?: { minutes: number };
      asleep?: { minutes: number };
      restless?: { minutes: number };
      awake?: { minutes: number };
    };
  };
};

function formatDurationMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m} m`;
  if (m <= 0) return `${h} h`;
  return `${h} h ${m} m`;
}

/** Maps one Fitbit sleep log entry to the `extracted` half of SleepAnalysis.
 *  `coach` (the Thai commentary) is filled in separately via AI — see
 *  src/lib/prompts/coachFromStructuredData.ts. */
export function mapFitbitSleepToExtracted(entry: FitbitSleepLogEntry): SleepAnalysis["extracted"] {
  const stages = entry.levels?.summary;
  const hasStageBreakdown = entry.type === "stages" && stages && (stages.deep || stages.light || stages.rem);

  return {
    date: entry.dateOfSleep,
    sleepDuration: formatDurationMinutes(entry.minutesAsleep),
    actualSleepDurationMinutes: entry.minutesAsleep,
    actualSleepDurationText: formatDurationMinutes(entry.minutesAsleep),
    timeInBedMinutes: entry.timeInBed,
    timeInBedText: formatDurationMinutes(entry.timeInBed),
    sleepStartTime: entry.startTime,
    sleepEndTime: entry.endTime,
    avgSleepingHeartRate: null,
    avgSleepingHrv: null,
    avgRespiratoryRate: null,
    sleepStageAwakeMinutes: hasStageBreakdown ? (stages?.wake?.minutes ?? null) : null,
    sleepStageRemMinutes: hasStageBreakdown ? (stages?.rem?.minutes ?? null) : null,
    sleepStageLightMinutes: hasStageBreakdown ? (stages?.light?.minutes ?? null) : null,
    sleepStageDeepMinutes: hasStageBreakdown ? (stages?.deep?.minutes ?? null) : null,
    sleepStageMinutes: hasStageBreakdown
      ? {
          awake: stages?.wake?.minutes ?? null,
          rem: stages?.rem?.minutes ?? null,
          light: stages?.light?.minutes ?? null,
          deep: stages?.deep?.minutes ?? null,
        }
      : null,
    sleepDurationSource: "actual",
    mergedFromMultipleImages: false,
    sleepScore: null,
    energyScore: null,
    restingHR: null,
    hrv: null,
    sleepQualityLabel: entry.efficiency != null ? `Sleep efficiency ${entry.efficiency}%` : null,
    visibleNotes: "นำเข้าอัตโนมัติจาก Fitbit",
  };
}

/** Deterministic history_items id for a Fitbit sleep log — makes re-syncing the
 *  same log an upsert instead of a duplicate row. */
export function fitbitSleepHistoryItemId(logId: number): string {
  return `fitbit-sleep-${logId}`;
}
