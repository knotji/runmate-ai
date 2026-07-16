// Google Health API v4 (health.googleapis.com) — response shapes confirmed
// against the official google-health-cli source (pkg/output/simplify.go,
// pkg/types/registry.go), not guessed from docs marketing copy.

const BASE_URL = "https://health.googleapis.com/v4";

async function healthApiGet<T>(accessToken: string, path: string): Promise<T | null> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

type Interval = { startTime: string; endTime: string; startUtcOffset?: string; endUtcOffset?: string };

export type GoogleHealthSleepDataPoint = {
  name: string;
  sleep: {
    interval: Interval;
    type?: string;
    metadata?: { nap?: boolean };
    summary?: {
      minutesAsleep?: number;
      minutesAwake?: number;
      minutesInSleepPeriod?: number;
      minutesToFallAsleep?: number;
      stagesSummary?: { type: string; minutes: number }[];
    };
  };
};

export type GoogleHealthExerciseDataPoint = {
  name: string;
  exercise: {
    interval: Interval;
    exerciseType?: string;
    metricsSummary?: {
      caloriesKcal?: number;
      averageHeartRateBeatsPerMinute?: number;
    };
    notes?: string;
  };
};

export type GoogleHealthDailyDataPoint = {
  date: { year: number; month: number; day: number };
  [key: string]: unknown;
};

function civilDateKey(d: { year: number; month: number; day: number }): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** Sleep sessions ending on/after the given ISO instant (sleep only supports
 *  filtering by end_time — a quirk confirmed in the API's own type registry). */
export async function fetchGoogleHealthSleep(accessToken: string, sinceIso: string): Promise<GoogleHealthSleepDataPoint[]> {
  const filter = encodeURIComponent(`sleep.interval.civil_end_time >= "${sinceIso.slice(0, 10)}"`);
  const result = await healthApiGet<{ dataPoints: GoogleHealthSleepDataPoint[] }>(
    accessToken,
    `/users/me/dataTypes/sleep/dataPoints:list?filter=${filter}`,
  );
  return result?.dataPoints ?? [];
}

// NOTE — everything in this file down to fetchGoogleHealthExercise's filter clause is
// confirmed against the API's own open-source CLI (google-health-cli). Below this point,
// the exact filter field name and the two daily-summary payload keys
// (dailyRestingHeartRate.beatsPerMinute, dailyHeartRateVariability.rmssdMillis) are
// inferred from the API's established naming convention (typeKey = camelCase data type
// name, nested object mirrors the type) rather than confirmed from a real response —
// verify these once real Google Health API credentials exist, per the migration plan.

/** Exercise sessions starting on/after the given ISO instant. */
export async function fetchGoogleHealthExercise(accessToken: string, sinceIso: string): Promise<GoogleHealthExerciseDataPoint[]> {
  const filter = encodeURIComponent(`exercise.interval.start_time >= "${sinceIso}"`);
  const result = await healthApiGet<{ dataPoints: GoogleHealthExerciseDataPoint[] }>(
    accessToken,
    `/users/me/dataTypes/exercise/dataPoints:list?filter=${filter}`,
  );
  return result?.dataPoints ?? [];
}

/** Daily resting heart rate, keyed by YYYY-MM-DD. */
export async function fetchGoogleHealthDailyRestingHR(accessToken: string, sinceDateKey: string): Promise<Map<string, number>> {
  const filter = encodeURIComponent(`daily_resting_heart_rate.date >= "${sinceDateKey}"`);
  const result = await healthApiGet<{ dataPoints: GoogleHealthDailyDataPoint[] }>(
    accessToken,
    `/users/me/dataTypes/daily-resting-heart-rate/dataPoints:list?filter=${filter}`,
  );
  const map = new Map<string, number>();
  for (const dp of result?.dataPoints ?? []) {
    const bpm = (dp as unknown as { dailyRestingHeartRate?: { beatsPerMinute?: number } }).dailyRestingHeartRate?.beatsPerMinute;
    if (dp.date && bpm != null) map.set(civilDateKey(dp.date), bpm);
  }
  return map;
}

/** Daily heart rate variability (ms), keyed by YYYY-MM-DD. */
export async function fetchGoogleHealthDailyHRV(accessToken: string, sinceDateKey: string): Promise<Map<string, number>> {
  const filter = encodeURIComponent(`daily_heart_rate_variability.date >= "${sinceDateKey}"`);
  const result = await healthApiGet<{ dataPoints: GoogleHealthDailyDataPoint[] }>(
    accessToken,
    `/users/me/dataTypes/daily-heart-rate-variability/dataPoints:list?filter=${filter}`,
  );
  const map = new Map<string, number>();
  for (const dp of result?.dataPoints ?? []) {
    const ms = (dp as unknown as { dailyHeartRateVariability?: { rmssdMillis?: number } }).dailyHeartRateVariability?.rmssdMillis;
    if (dp.date && ms != null) map.set(civilDateKey(dp.date), ms);
  }
  return map;
}
