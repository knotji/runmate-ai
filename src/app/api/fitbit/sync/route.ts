import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshFitbitToken } from "@/lib/fitbit/oauth";
import { fetchFitbitSleepForDate, fetchFitbitActivitiesAfterDate } from "@/lib/fitbit/api";
import { mapFitbitSleepToExtracted, fitbitSleepHistoryItemId, type FitbitSleepLogEntry } from "@/lib/fitbit/mapSleep";
import { mapFitbitActivityToExtracted, fitbitActivityHistoryItemId, type FitbitActivityLogEntry } from "@/lib/fitbit/mapActivity";
import { coachFromStructuredSleepPrompt, coachFromStructuredWorkoutPrompt } from "@/lib/prompts/coachFromStructuredData";
import { jsonFromAI } from "@/lib/ai";
import { todayBangkokDateKey, yesterdayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";
import type { SleepAnalysis, WorkoutAnalysis } from "@/types/logs";

export const maxDuration = 60;

const SLEEP_COACH_FALLBACK: SleepAnalysis["coach"] = {
  readinessScore: 65,
  readinessLabel: "Fair",
  aiSummary: "ข้อมูลนอนนำเข้าจาก Fitbit แล้ว ระบบยังสรุปความเห็นเพิ่มเติมไม่สำเร็จ",
  todayRecommendation: "ลองเช็คร่างกายตัวเองก่อนซ้อมตามปกติ",
  nutritionFocus: "เติมคาร์บและน้ำให้พอตามปกติ",
  recoveryFocus: "ฟังร่างกายเป็นหลัก พักถ้ารู้สึกล้า",
  sleepFocus: "รักษาเวลานอนให้สม่ำเสมอ",
  warningNotes: "ถ้ามีอาการผิดปกติควรปรึกษาผู้เชี่ยวชาญ",
};

const WORKOUT_COACH_FALLBACK: WorkoutAnalysis["coach"] = {
  workoutSummary: "ข้อมูลซ้อมนำเข้าจาก Fitbit แล้ว ระบบยังสรุปความเห็นเพิ่มเติมไม่สำเร็จ",
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

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "admin client not configured" }, { status: 500 });
  }

  const todayKey = todayBangkokDateKey();
  const yesterdayKey = yesterdayBangkokDateKey();

  const { data: connections, error: connError } = await admin.from("fitbit_connections").select("*");
  if (connError || !connections) {
    return NextResponse.json({ error: "failed to load connections" }, { status: 500 });
  }

  let usersSynced = 0;
  let sleepImported = 0;
  let workoutsImported = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      let accessToken = connection.access_token as string;

      // Refresh if the token is expired or expiring within the next 5 minutes.
      const expiresAt = new Date(connection.expires_at as string).getTime();
      if (expiresAt - Date.now() < 5 * 60 * 1000) {
        const refreshed = await refreshFitbitToken(connection.refresh_token as string);
        if (!refreshed) {
          await admin.from("fitbit_connections").update({ last_sync_error: "token refresh failed" }).eq("user_id", connection.user_id);
          failed += 1;
          continue;
        }
        accessToken = refreshed.accessToken;
        await admin.from("fitbit_connections").update({
          access_token: refreshed.accessToken,
          refresh_token: refreshed.refreshToken,
          expires_at: refreshed.expiresAt,
        }).eq("user_id", connection.user_id);
      }

      const userId = connection.user_id as string;

      // ── Sleep ──────────────────────────────────────────────────────────────
      const sleepEntries: FitbitSleepLogEntry[] = [
        ...(await fetchFitbitSleepForDate(accessToken, yesterdayKey)),
        ...(await fetchFitbitSleepForDate(accessToken, todayKey)),
      ];
      for (const entry of sleepEntries) {
        const itemId = fitbitSleepHistoryItemId(entry.logId);
        const { data: existing } = await admin.from("history_items").select("id").eq("user_id", userId).eq("id", itemId).maybeSingle();
        if (existing) continue;

        const extracted = mapFitbitSleepToExtracted(entry);
        const coach = await generateSleepCoach(extracted);
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
          created_at: new Date().toISOString(),
          data: { ...data, recordedAt: dateKeyToRecordedAt(entry.dateOfSleep), dateKey: entry.dateOfSleep },
        });
        sleepImported += 1;
      }

      // ── Workouts ───────────────────────────────────────────────────────────
      const activityEntries: FitbitActivityLogEntry[] = await fetchFitbitActivitiesAfterDate(accessToken, yesterdayKey);
      for (const entry of activityEntries) {
        const itemId = fitbitActivityHistoryItemId(entry.logId);
        const { data: existing } = await admin.from("history_items").select("id").eq("user_id", userId).eq("id", itemId).maybeSingle();
        if (existing) continue;

        const extracted = mapFitbitActivityToExtracted(entry);
        const coach = await generateWorkoutCoach(extracted);
        const data: WorkoutAnalysis = {
          extracted,
          coach,
          confidence: "high",
          unclearFields: ["maxHR", "cadence", "vo2Max"],
        };
        const dateKey = extracted.date ?? todayKey;

        await admin.from("history_items").insert({
          id: itemId,
          user_id: userId,
          type: "workout",
          created_at: new Date().toISOString(),
          data: { ...data, recordedAt: dateKeyToRecordedAt(dateKey), dateKey },
        });
        workoutsImported += 1;
      }

      await admin.from("fitbit_connections").update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      }).eq("user_id", userId);
      usersSynced += 1;
    } catch (error) {
      failed += 1;
      await admin.from("fitbit_connections").update({
        last_sync_error: error instanceof Error ? error.message : "unknown error",
      }).eq("user_id", connection.user_id);
    }
  }

  return NextResponse.json({
    ok: true,
    totalConnections: connections.length,
    usersSynced,
    sleepImported,
    workoutsImported,
    failed,
  });
}
