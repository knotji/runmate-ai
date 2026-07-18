import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshGoogleHealthToken } from "@/lib/googleHealth/oauth";
import {
  fetchGoogleHealthSleep,
  fetchGoogleHealthExercise,
  fetchGoogleHealthDailyRestingHR,
  fetchGoogleHealthDailyHRV,
  intervalCivilDateKey,
} from "@/lib/googleHealth/api";
import { mapGoogleHealthSleepToExtracted, googleHealthSleepHistoryItemId } from "@/lib/googleHealth/mapSleep";
import { mapGoogleHealthExerciseToExtracted, googleHealthExerciseHistoryItemId } from "@/lib/googleHealth/mapExercise";
import { isLikelyDuplicateWorkout, type WorkoutFingerprint } from "@/lib/googleHealth/dedupeSimilarWorkout";
import { coachFromStructuredSleepPrompt, coachFromStructuredWorkoutPrompt } from "@/lib/prompts/coachFromStructuredData";
import { jsonFromAI } from "@/lib/ai";
import { todayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";
import type { SleepAnalysis, WorkoutAnalysis } from "@/types/logs";

const SLEEP_COACH_FALLBACK: SleepAnalysis["coach"] = {
  readinessScore: 65,
  readinessLabel: "Fair",
  aiSummary: "ข้อมูลนอนนำเข้าจาก Google Health แล้ว ระบบยังสรุปความเห็นเพิ่มเติมไม่สำเร็จ",
  todayRecommendation: "ลองเช็คร่างกายตัวเองก่อนซ้อมตามปกติ",
  nutritionFocus: "เติมคาร์บและน้ำให้พอตามปกติ",
  recoveryFocus: "ฟังร่างกายเป็นหลัก พักถ้ารู้สึกล้า",
  sleepFocus: "รักษาเวลานอนให้สม่ำเสมอ",
  warningNotes: "ถ้ามีอาการผิดปกติควรปรึกษาผู้เชี่ยวชาญ",
};

const WORKOUT_COACH_FALLBACK: WorkoutAnalysis["coach"] = {
  workoutSummary: "ข้อมูลซ้อมนำเข้าจาก Google Health แล้ว ระบบยังสรุปความเห็นเพิ่มเติมไม่สำเร็จ",
  intensityAssessment: "ไม่สามารถประเมินความหนักเพิ่มเติมได้ในขณะนี้",
  trainingLoadNote: "-",
  wasTooHard: false,
  recoveryAdvice: "พักผ่อนและเติมน้ำตามปกติ",
  nutritionAfterWorkout: "เติมโปรตีนและคาร์บหลังซ้อม",
  nextWorkoutSuggestion: "ซ้อมตามแผนเดิมได้ตามปกติ",
  coachNote: "-",
};

async function generateSleepCoach(extracted: SleepAnalysis["extracted"]): Promise<SleepAnalysis["coach"]> {
  const result = await jsonFromAI<{ coach: SleepAnalysis["coach"] }>({
    system: coachFromStructuredSleepPrompt,
    user: JSON.stringify({ extracted }),
    fallback: { coach: SLEEP_COACH_FALLBACK },
  });
  return result.data.coach;
}

async function generateWorkoutCoach(extracted: WorkoutAnalysis["extracted"]): Promise<WorkoutAnalysis["coach"]> {
  const result = await jsonFromAI<{ coach: WorkoutAnalysis["coach"] }>({
    system: coachFromStructuredWorkoutPrompt,
    user: JSON.stringify({ extracted }),
    fallback: { coach: WORKOUT_COACH_FALLBACK },
  });
  return result.data.coach;
}

export type GoogleHealthConnectionRow = {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type SyncUserResult = {
  ok: boolean;
  sleepImported: number;
  workoutsImported: number;
  sleepSkippedManual: number;
  workoutsSkippedManual: number;
  workoutsSkippedDuplicate: number;
  sleepSkippedNap: number;
  error?: string;
};

/** True if the user already has a manually-entered (non-ghealth-) history item of this
 *  type for this date. Manual uploads always set `data.dateKey` when saved (see
 *  cloudHistory.ts's saveHistoryItems), so this only misses the older Samsung Health
 *  CSV import path, which doesn't set that field — an acceptable gap since that path
 *  predates this integration and isn't the case that produced the reported duplicate. */
async function hasManualEntryForDate(
  admin: SupabaseClient,
  userId: string,
  type: "sleep" | "workout",
  dateKey: string,
): Promise<boolean> {
  const { data } = await admin
    .from("history_items")
    .select("id")
    .eq("user_id", userId)
    .eq("type", type)
    .eq("data->>dateKey", dateKey)
    .not("id", "like", "ghealth-%")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

/** All existing workout items for this date (any source — manual, ghealth-,
 *  Samsung import), reduced to the start-time + distance fingerprint
 *  isLikelyDuplicateWorkout compares against. */
async function existingWorkoutFingerprints(
  admin: SupabaseClient,
  userId: string,
  dateKey: string,
): Promise<WorkoutFingerprint[]> {
  const { data } = await admin
    .from("history_items")
    .select("created_at, data")
    .eq("user_id", userId)
    .eq("type", "workout")
    .eq("data->>dateKey", dateKey);

  if (!data) return [];
  return data.map((row) => ({
    startTimeMs: new Date(row.created_at as string).getTime(),
    distanceKm: (row.data as WorkoutAnalysis | null)?.extracted?.distanceKm ?? null,
  }));
}

/** Fetches and imports a user's Google Health sleep + exercise data since `sinceDateKey`,
 *  deduped against history_items via the deterministic ghealth- ids so re-running (e.g. a
 *  daily cron overlapping a manual backfill) is always a no-op skip, never a duplicate or
 *  overwrite. `generateCoach: false` skips the per-item AI coach call and uses a fixed
 *  fallback commentary instead — used by the one-time historical backfill (which may touch
 *  dozens of past days at once) to stay well inside the serverless function time budget;
 *  the daily cron sync (a handful of items at most) keeps `generateCoach: true` for
 *  proper personalized commentary on live data. */
export async function syncGoogleHealthForConnection(
  admin: SupabaseClient,
  connection: GoogleHealthConnectionRow,
  sinceDateKey: string,
  options: { generateCoach: boolean },
): Promise<SyncUserResult> {
  const todayKey = todayBangkokDateKey();
  const userId = connection.user_id;

  let accessToken = connection.access_token;
  const expiresAt = new Date(connection.expires_at).getTime();
  if (expiresAt - Date.now() < 5 * 60 * 1000) {
    const refreshed = await refreshGoogleHealthToken(connection.refresh_token);
    if (!refreshed) {
      await admin.from("google_health_connections").update({ last_sync_error: "token refresh failed" }).eq("user_id", userId);
      return { ok: false, sleepImported: 0, workoutsImported: 0, sleepSkippedManual: 0, workoutsSkippedManual: 0, workoutsSkippedDuplicate: 0, sleepSkippedNap: 0, error: "token refresh failed" };
    }
    accessToken = refreshed.accessToken;
    await admin.from("google_health_connections").update({
      access_token: refreshed.accessToken,
      expires_at: refreshed.expiresAt,
    }).eq("user_id", userId);
  }

  let sleepImported = 0;
  let workoutsImported = 0;
  let sleepSkippedManual = 0;
  let workoutsSkippedManual = 0;
  let workoutsSkippedDuplicate = 0;
  let sleepSkippedNap = 0;

  try {
    const sinceIso = new Date(`${sinceDateKey}T00:00:00+07:00`).toISOString();

    const [sleepPoints, dailyRestingHR, dailyHrv] = await Promise.all([
      fetchGoogleHealthSleep(accessToken, sinceIso),
      fetchGoogleHealthDailyRestingHR(accessToken, sinceDateKey),
      fetchGoogleHealthDailyHRV(accessToken, sinceDateKey),
    ]);

    for (const dp of sleepPoints) {
      const itemId = googleHealthSleepHistoryItemId(dp.name);
      const { data: existing } = await admin.from("history_items").select("id").eq("user_id", userId).eq("id", itemId).maybeSingle();
      if (existing) continue;

      // Naps aren't the night's sleep — the app's sleep model (Recovery System's
      // sleep axis, "latest sleep" readiness display, dedupeSleepItems) has no
      // concept of a nap and would treat one exactly like a full night's sleep.
      // A short daytime nap synced after last night's real sleep could then
      // outrank it as "latest sleep", showing a misleadingly low duration
      // everywhere from the AI context to the Report list. Google's own nap flag
      // is authoritative — simplest correct fix is to not import naps at all,
      // rather than teaching every downstream consumer to filter them out.
      if (dp.sleep.metadata?.nap) {
        sleepSkippedNap += 1;
        continue;
      }

      const dateKey = intervalCivilDateKey(dp.sleep.interval, "end");
      // Prefer a manually-logged entry over auto-importing a second one for the same
      // day — the reported duplicate came from exactly this: a 30-day backfill
      // re-importing days that already had a manual upload.
      if (await hasManualEntryForDate(admin, userId, "sleep", dateKey)) {
        sleepSkippedManual += 1;
        continue;
      }
      const extracted = mapGoogleHealthSleepToExtracted(dp, dailyRestingHR.get(dateKey) ?? null, dailyHrv.get(dateKey) ?? null);
      const coach = options.generateCoach ? await generateSleepCoach(extracted) : SLEEP_COACH_FALLBACK;
      const data: SleepAnalysis = {
        extracted,
        coach,
        confidence: "high",
        unclearFields: ["avgSleepingHeartRate", "avgSleepingHrv", "avgRespiratoryRate", "sleepScore", "energyScore"],
      };

      await admin.from("history_items").insert({
        id: itemId,
        user_id: userId,
        type: "sleep",
        // The Report list's time-of-day display keys off created_at, not recordedAt
        // (which is always a synthetic noon — see formatItemDateTime in logs/page.tsx).
        // Using the sync job's own execution time here would either show the wrong
        // clock time or, for backfilled days, hide the time entirely (its Bangkok date
        // wouldn't match the item's dateKey). Google's own wake-up instant is the real
        // thing to show, and matches the same interval edge dateKey was derived from.
        created_at: dp.sleep.interval.endTime,
        data: { ...data, recordedAt: dateKeyToRecordedAt(dateKey), dateKey },
      });
      sleepImported += 1;
    }

    // Cached per dateKey across this loop so a repeat sync isn't N extra
    // queries, and so two duplicate records returned in the *same* Health
    // Connect fetch (not just across syncs) still catch each other — each
    // accepted insert this run gets pushed into its date's cached list below.
    const fingerprintsByDate = new Map<string, WorkoutFingerprint[]>();

    const exercisePoints = await fetchGoogleHealthExercise(accessToken, sinceDateKey);
    for (const dp of exercisePoints) {
      const itemId = googleHealthExerciseHistoryItemId(dp.name);
      const { data: existing } = await admin.from("history_items").select("id").eq("user_id", userId).eq("id", itemId).maybeSingle();
      if (existing) continue;

      const extracted = mapGoogleHealthExerciseToExtracted(dp);
      const dateKey = extracted.date ?? todayKey;
      if (await hasManualEntryForDate(admin, userId, "workout", dateKey)) {
        workoutsSkippedManual += 1;
        continue;
      }

      let fingerprints = fingerprintsByDate.get(dateKey);
      if (!fingerprints) {
        fingerprints = await existingWorkoutFingerprints(admin, userId, dateKey);
        fingerprintsByDate.set(dateKey, fingerprints);
      }
      const candidate: WorkoutFingerprint = {
        startTimeMs: new Date(dp.exercise.interval.startTime).getTime(),
        distanceKm: extracted.distanceKm,
      };
      // Two different devices/apps (e.g. phone + watch) can both sync the same
      // real run into Health Connect as separate session records — Google's own
      // per-record dedup above can't catch that since the records genuinely
      // differ. This is a second, fuzzier check for "this is probably the same
      // workout", not a duplicate-record check.
      if (fingerprints.some((f) => isLikelyDuplicateWorkout(candidate, f))) {
        workoutsSkippedDuplicate += 1;
        continue;
      }

      const coach = options.generateCoach ? await generateWorkoutCoach(extracted) : WORKOUT_COACH_FALLBACK;
      const data: WorkoutAnalysis = {
        extracted,
        coach,
        confidence: "high",
        unclearFields: ["maxHR", "cadence", "vo2Max", "elevationGain"],
      };

      await admin.from("history_items").insert({
        id: itemId,
        user_id: userId,
        type: "workout",
        // Same reasoning as the sleep insert above — real event time, not sync-job
        // execution time, matching the same interval edge dateKey was derived from.
        created_at: dp.exercise.interval.startTime,
        data: { ...data, recordedAt: dateKeyToRecordedAt(dateKey), dateKey },
      });
      fingerprints.push(candidate);
      workoutsImported += 1;
    }

    await admin.from("google_health_connections").update({
      last_synced_at: new Date().toISOString(),
      last_sync_error: null,
    }).eq("user_id", userId);

    return { ok: true, sleepImported, workoutsImported, sleepSkippedManual, workoutsSkippedManual, workoutsSkippedDuplicate, sleepSkippedNap };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await admin.from("google_health_connections").update({ last_sync_error: message }).eq("user_id", userId);
    return { ok: false, sleepImported, workoutsImported, sleepSkippedManual, workoutsSkippedManual, workoutsSkippedDuplicate, sleepSkippedNap, error: message };
  }
}
