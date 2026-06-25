import { NextResponse } from "next/server";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { buildRunnerProfileContext } from "@/lib/buildRunnerProfileContext";
import type { CoachContext } from "@/lib/buildCoachContext";
import type { UserProfile } from "@/types/profile";

// Dev-only endpoint — returns a structured summary of the coach context
// so developers can verify what data is being sent to the AI.
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  try {
    const ctx: CoachContext = await buildCoachContextFromSupabase();
    const profile = ctx.profile as UserProfile | null;
    const profileText = buildRunnerProfileContext(profile);

    const summary = {
      todayDate: ctx.todayDate,

      profile: {
        displayName: profile?.displayName ?? null,
        age: profile?.age ?? null,
        mainGoal: profile?.mainGoal ?? null,
        currentLevel: profile?.currentLevel ?? null,
        nutritionGoal: profile?.nutritionGoal ?? null,
        allergiesOrRestrictions: profile?.allergiesOrRestrictions ?? null,
        foodPreferences: profile?.foodPreferences ?? null,
        coachingTone: profile?.coachingTone ?? null,
        language: profile?.language ?? null,
        profileText,
      },

      race: {
        activeRaceStatus: ctx.activeRaceStatus,
        raceName: ctx.raceName,
        raceDistance: ctx.raceDistance,
        raceDate: ctx.raceDate,
        daysUntilRace: ctx.daysUntilRace,
        isRaceToday: ctx.isRaceToday,
        isRaceTomorrow: ctx.isRaceTomorrow,
        isRaceWeek: ctx.isRaceWeek,
        latestCompletedRace: ctx.latestCompletedRace
          ? {
              raceName: ctx.latestCompletedRace.raceName,
              raceDate: ctx.latestCompletedRace.raceDate,
              raceDistance: ctx.latestCompletedRace.raceDistance,
            }
          : null,
      },

      sleep: {
        sleepNightCount7d: ctx.sleepNightCount7d,
        sleepAvg7dText: ctx.sleepAvg7dText,
        sleepAvg7dHours: ctx.sleepAvg7dHours,
        avgReadiness: ctx.avgReadiness,
        latestSleepDateKey: ctx.latestSleepDateKey,
        latestSleepScore: ctx.latestSleepScore,
        latestEnergyScore: ctx.latestEnergyScore,
        latestSleepDurationText: ctx.latestSleepDurationText,
        sleep7d: ctx.sleep7d,
      },

      workouts: {
        totalRunKm: ctx.totalRunKm,
        totalSessions: ctx.totalSessions,
        runDays7d: ctx.runDays7d,
        longestRun7dKm: ctx.longestRun7dKm,
        lastWorkoutDate: ctx.lastWorkoutDate,
        lastRun: ctx.lastRun,
        hasWorkoutToday: ctx.hasWorkoutToday,
        todayWorkouts: ctx.todayWorkouts,
        workouts7d: ctx.workouts7d,
      },

      meals: {
        nutritionToday: ctx.nutritionToday,
        mealsToday: ctx.mealsToday,
        nutrition7d: ctx.nutrition7d,
        nutritionBalanceSummary: ctx.nutritionBalanceToday
          ? {
              veggieFiberStatus: ctx.nutritionBalanceToday.veggieFiberStatus,
              friedFatStatus: ctx.nutritionBalanceToday.friedFatStatus,
              proteinStatus: ctx.nutritionBalanceToday.proteinStatus,
              carbStatus: ctx.nutritionBalanceToday.carbStatus,
              sugarStatus: ctx.nutritionBalanceToday.sugarStatus,
              varietyStatus: ctx.nutritionBalanceToday.varietyStatus,
              mealCount: ctx.nutritionBalanceToday.mealCount,
            }
          : null,
      },

      pain: {
        activePain: ctx.activePain,
        recentPainHistory: ctx.recentPainHistory,
        painResolved: ctx.painResolved,
        latestPain: ctx.latestPain
          ? {
              date: ctx.latestPain.date,
              painLocation: ctx.latestPain.painLocation,
              painLevel: ctx.latestPain.painLevel,
              riskLevel: ctx.latestPain.riskLevel,
              hasActivePain: ctx.latestPain.hasActivePain,
              resolved: ctx.latestPain.resolved,
            }
          : null,
        recentPainLogsCount: ctx.recentPainLogs.length,
      },

      healthCheck: ctx.latestHealthCheck
        ? {
            checkupDate: ctx.latestHealthCheck.checkupDate,
            coachSummary: ctx.latestHealthCheck.coachSummary,
            confidence: ctx.latestHealthCheck.confidence,
            nutritionFlags: ctx.latestHealthCheck.nutritionFlags,
            activeFlagsCount: ctx.latestHealthCheck.nutritionFlags
              ? Object.values(ctx.latestHealthCheck.nutritionFlags).filter(Boolean).length
              : 0,
            keyLabsCount: ctx.latestHealthCheck.keyLabs?.length ?? 0,
          }
        : null,

      latestBody: ctx.latestBody,

      contextNotes: ctx.contextNotes,
    };

    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
