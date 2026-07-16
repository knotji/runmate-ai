import type { FitbitSleepLogEntry } from "@/lib/fitbit/mapSleep";
import type { FitbitActivityLogEntry } from "@/lib/fitbit/mapActivity";

async function fitbitGet<T>(accessToken: string, path: string): Promise<T | null> {
  const response = await fetch(`https://api.fitbit.com${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) return null;
  return response.json() as Promise<T>;
}

/** Sleep logs for a single date (YYYY-MM-DD, Fitbit's own local-to-the-device date). */
export async function fetchFitbitSleepForDate(accessToken: string, dateKey: string): Promise<FitbitSleepLogEntry[]> {
  const result = await fitbitGet<{ sleep: FitbitSleepLogEntry[] }>(accessToken, `/1.2/user/-/sleep/date/${dateKey}.json`);
  return result?.sleep ?? [];
}

/** Activity logs after a given date (YYYY-MM-DD), ascending, capped at 20 per call —
 *  plenty for a daily sync window. */
export async function fetchFitbitActivitiesAfterDate(accessToken: string, afterDateKey: string): Promise<FitbitActivityLogEntry[]> {
  const result = await fitbitGet<{ activities: FitbitActivityLogEntry[] }>(
    accessToken,
    `/1/user/-/activities/list.json?afterDate=${afterDateKey}&sort=asc&limit=20&offset=0`,
  );
  return result?.activities ?? [];
}
