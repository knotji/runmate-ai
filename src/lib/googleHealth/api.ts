// Google Health API v4 (health.googleapis.com) — schema and filter syntax confirmed
// directly against the real discovery document
// (GET https://health.googleapis.com/$discovery/rest?version=v4), not guessed and not
// taken from third-party blog posts. In particular:
// - Every int64-typed field (all "minutes*" fields, heart-rate beatsPerMinute, steps,
//   etc.) is serialized as a JSON STRING, not a number — Google APIs do this
//   everywhere to avoid JS Number precision loss on large int64 values. Every read
//   below parses these explicitly; don't add a new field here without checking the
//   discovery doc's "format": "int64" (-> string) vs "double" (-> real number).
// - The `filter` query param's own field-by-field documentation (in the discovery
//   doc) is the source of truth for which interval field each data type supports —
//   Sleep and ECG are documented exceptions; every other session type (including
//   Exercise) only supports `interval.civil_start_time`, not `interval.start_time`.

const BASE_URL = "https://health.googleapis.com/v4";

async function healthApiGet<T>(accessToken: string, path: string): Promise<T | null> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

type GoogleHealthDate = { year: number; month: number; day: number };

// civilStartTime/civilEndTime are server-computed using the session's own recorded
// UTC offset — prefer these over slicing startTime/endTime (a UTC instant) for the
// "which local date does this belong to" question, since slicing a UTC timestamp can
// land on the wrong calendar day near midnight (the same class of bug fixed earlier
// in weeklyReview.ts's cutoff-date calculation).
type Interval = {
  startTime: string;
  endTime: string;
  startUtcOffset?: string;
  endUtcOffset?: string;
  civilStartTime?: { date: GoogleHealthDate };
  civilEndTime?: { date: GoogleHealthDate };
};

// int64 fields arrive as strings on the wire (see file header) — typed `string` here
// to match reality; callers parse with Number(...).
export type GoogleHealthSleepDataPoint = {
  name: string;
  sleep: {
    interval: Interval;
    type?: "SLEEP_TYPE_UNSPECIFIED" | "CLASSIC" | "STAGES";
    metadata?: { nap?: boolean };
    summary?: {
      minutesAsleep?: string;
      minutesAwake?: string;
      minutesInSleepPeriod?: string;
      minutesToFallAsleep?: string;
      stagesSummary?: { type: "AWAKE" | "LIGHT" | "DEEP" | "REM" | "ASLEEP" | "RESTLESS"; minutes: string }[];
    };
  };
};

export type GoogleHealthExerciseDataPoint = {
  name: string;
  exercise: {
    interval: Interval;
    exerciseType?: string;
    metricsSummary?: {
      caloriesKcal?: number; // double, not int64 — arrives as a real JSON number
      averageHeartRateBeatsPerMinute?: string;
      distanceMillimeters?: number; // double
      elevationGainMillimeters?: number; // double
    };
    notes?: string;
  };
};

export function civilDateKey(d: GoogleHealthDate): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Prefer the server-computed civil (local) date over slicing a UTC instant, which
 *  can land on the wrong calendar day near local midnight. Falls back to the UTC
 *  slice when civilStartTime/civilEndTime isn't present on the interval (it's an
 *  output-only field, so older or third-source-synced records may lack it). */
export function intervalCivilDateKey(interval: Interval, edge: "start" | "end"): string {
  const civil = edge === "start" ? interval.civilStartTime : interval.civilEndTime;
  if (civil) return civilDateKey(civil.date);
  return (edge === "start" ? interval.startTime : interval.endTime).slice(0, 10);
}

/** Sleep sessions ending on/after the given ISO instant (sleep only supports
 *  filtering by end_time — a quirk confirmed in the API's own type registry). */
export async function fetchGoogleHealthSleep(accessToken: string, sinceIso: string): Promise<GoogleHealthSleepDataPoint[]> {
  const filter = encodeURIComponent(`sleep.interval.civil_end_time >= "${sinceIso.slice(0, 10)}"`);
  const result = await healthApiGet<{ dataPoints: GoogleHealthSleepDataPoint[] }>(
    accessToken,
    `/users/me/dataTypes/sleep/dataPoints?filter=${filter}`,
  );
  return result?.dataPoints ?? [];
}

/** Exercise sessions starting on/after the given date (YYYY-MM-DD). Per the API's own
 *  filter-field documentation (the `filter` query param's description in the discovery
 *  doc): all session types except Sleep and ECG only support `civil_start_time`
 *  filtering (date-only or date+local-time, no timezone/Z suffix) — plain
 *  `interval.start_time` is NOT a valid filter field for exercise, despite being valid
 *  for interval-typed *sample* data types like steps/distance. */
export async function fetchGoogleHealthExercise(accessToken: string, sinceDateKey: string): Promise<GoogleHealthExerciseDataPoint[]> {
  const filter = encodeURIComponent(`exercise.interval.civil_start_time >= "${sinceDateKey}"`);
  const result = await healthApiGet<{ dataPoints: GoogleHealthExerciseDataPoint[] }>(
    accessToken,
    `/users/me/dataTypes/exercise/dataPoints?filter=${filter}`,
  );
  return result?.dataPoints ?? [];
}

/** Daily resting heart rate, keyed by YYYY-MM-DD. Confirmed field names: `date`,
 *  `beatsPerMinute` (int64-as-string) on the DailyRestingHeartRate schema; the
 *  dataPoint wrapper key (`dailyRestingHeartRate`) follows the same
 *  typeKey-mirrors-dataType-id convention confirmed for sleep/exercise. */
export async function fetchGoogleHealthDailyRestingHR(accessToken: string, sinceDateKey: string): Promise<Map<string, number>> {
  const filter = encodeURIComponent(`daily_resting_heart_rate.date >= "${sinceDateKey}"`);
  const result = await healthApiGet<{ dataPoints: (GoogleHealthDailyDataPoint & { dailyRestingHeartRate?: { beatsPerMinute?: string } })[] }>(
    accessToken,
    `/users/me/dataTypes/daily-resting-heart-rate/dataPoints?filter=${filter}`,
  );
  const map = new Map<string, number>();
  for (const dp of result?.dataPoints ?? []) {
    const bpm = dp.dailyRestingHeartRate?.beatsPerMinute;
    if (dp.date && bpm != null) map.set(civilDateKey(dp.date), Number(bpm));
  }
  return map;
}

type GoogleHealthDailyDataPoint = { date: GoogleHealthDate };

/** Daily heart rate variability (ms), keyed by YYYY-MM-DD. Confirmed field name:
 *  `averageHeartRateVariabilityMilliseconds` (a real double, not int64-as-string)
 *  on the DailyHeartRateVariability schema — note this replaces an earlier,
 *  wrong guess of `rmssdMillis`. The dataPoint wrapper key
 *  (`dailyHeartRateVariability`) follows the same convention as resting HR. */
export async function fetchGoogleHealthDailyHRV(accessToken: string, sinceDateKey: string): Promise<Map<string, number>> {
  const filter = encodeURIComponent(`daily_heart_rate_variability.date >= "${sinceDateKey}"`);
  const result = await healthApiGet<{ dataPoints: (GoogleHealthDailyDataPoint & { dailyHeartRateVariability?: { averageHeartRateVariabilityMilliseconds?: number } })[] }>(
    accessToken,
    `/users/me/dataTypes/daily-heart-rate-variability/dataPoints?filter=${filter}`,
  );
  const map = new Map<string, number>();
  for (const dp of result?.dataPoints ?? []) {
    const ms = dp.dailyHeartRateVariability?.averageHeartRateVariabilityMilliseconds;
    if (dp.date && ms != null) map.set(civilDateKey(dp.date), ms);
  }
  return map;
}
