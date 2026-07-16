import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshGoogleHealthToken } from "@/lib/googleHealth/oauth";
import {
  fetchGoogleHealthSleep,
  fetchGoogleHealthExercise,
  fetchGoogleHealthDailyRestingHR,
  fetchGoogleHealthDailyHRV,
} from "@/lib/googleHealth/api";
import { mapGoogleHealthSleepToExtracted, googleHealthSleepHistoryItemId } from "@/lib/googleHealth/mapSleep";
import { mapGoogleHealthExerciseToExtracted, googleHealthExerciseHistoryItemId } from "@/lib/googleHealth/mapExercise";
import { coachFromStructuredSleepPrompt, coachFromStructuredWorkoutPrompt } from "@/lib/prompts/coachFromStructuredData";
import { jsonFromAI } from "@/lib/ai";
import { todayBangkokDateKey, yesterdayBangkokDateKey, dateKeyToRecordedAt } from "@/lib/date";
import type { SleepAnalysis, WorkoutAnalysis } from "@/types/logs";

export const maxDuration = 60;

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
  const sinceIso = new Date(`${yesterdayKey}T00:00:00+07:00`).toISOString();

  const { data: connections, error: connError } = await admin.from("google_health_connections").select("*");
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
        const refreshed = await refreshGoogleHealthToken(connection.refresh_token as string);
        if (!refreshed) {
          await admin.from("google_health_connections").update({ last_sync_error: "token refresh failed" }).eq("user_id", connection.user_id);
          failed += 1;
          continue;
        }
        accessToken = refreshed.accessToken;
        await admin.from("google_health_connections").update({
          access_token: refreshed.accessToken,
          expires_at: refreshed.expiresAt,
        }).eq("user_id", connection.user_id);
      }

      const userId = connection.user_id as string;

      // ── Sleep (+ daily resting HR / HRV correlated by date) ──────────────────
      const [sleepPoints, dailyRestingHR, dailyHrv] = await Promise.all([
        fetchGoogleHealthSleep(accessToken, sinceIso),
        fetchGoogleHealthDailyRestingHR(accessToken, yesterdayKey),
        fetchGoogleHealthDailyHRV(accessToken, yesterdayKey),
      ]);

      for (const dp of sleepPoints) {
        const itemId = googleHealthSleepHistoryItemId(dp.name);
        const { data: existing } = await admin.from("history_items").select("id").eq("user_id", userId).eq("id", itemId).maybeSingle();
        if (existing) continue;

        const dateKey = dp.sleep.interval.endTime.slice(0, 10);
        const extracted = mapGoogleHealthSleepToExtracted(dp, dailyRestingHR.get(dateKey) ?? null, dailyHrv.get(dateKey) ?? null);
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
          data: { ...data, recordedAt: dateKeyToRecordedAt(dateKey), dateKey },
        });
        sleepImported += 1;
      }

      // ── Exercise ───────────────────────────────────────────────────────────
      const exercisePoints = await fetchGoogleHealthExercise(accessToken, sinceIso);
      for (const dp of exercisePoints) {
        const itemId = googleHealthExerciseHistoryItemId(dp.name);
        const { data: existing } = await admin.from("history_items").select("id").eq("user_id", userId).eq("id", itemId).maybeSingle();
        if (existing) continue;

        const extracted = mapGoogleHealthExerciseToExtracted(dp);
        const coach = await generateWorkoutCoach(extracted);
        const data: WorkoutAnalysis = {
          extracted,
          coach,
          confidence: "high",
          unclearFields: ["maxHR", "cadence", "vo2Max", "elevationGain"],
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

      await admin.from("google_health_connections").update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: null,
      }).eq("user_id", userId);
      usersSynced += 1;
    } catch (error) {
      failed += 1;
      await admin.from("google_health_connections").update({
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
