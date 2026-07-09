// Shared CoachContext fixture for unit tests.
// Override only the fields relevant to each test case.
import type { CoachContext } from "@/lib/buildCoachContext";
import type { RunMateRecoverySystem } from "@/lib/recoverySystem";

export function makeRecoverySys(overrides?: Partial<{
  recoveryScore: number;
  loadScore: number;
  sleepScore: number;
  fuelScore: number;
}>): RunMateRecoverySystem {
  const {
    recoveryScore = 75,
    loadScore = 30,
    sleepScore = 75,
    fuelScore = 65,
  } = overrides ?? {};

  return {
    overallScore: 70,
    coachingState: "maintain",
    recommendedIntensity: "moderate",
    axes: {
      recovery: { score: recoveryScore, label: "ดี", tone: "positive" },
      load: { score: loadScore, label: "เบา", tone: "positive" },
      sleep: { score: sleepScore, label: "ดี", tone: "positive" },
      fuel: { score: fuelScore, label: "โอเค", tone: "neutral" },
    },
    guardrails: {
      shortThaiCopy: "",
      fullThaiCopy: "",
      englishKey: "none",
    },
  } as unknown as RunMateRecoverySystem;
}

export function makeCtx(overrides?: Partial<CoachContext>): CoachContext {
  const base: CoachContext = {
    profile: null,
    raceGoal: null,
    racePlan: null,
    activeRaceStatus: "none",
    activeRaceGoal: null,
    raceDate: null,
    raceDistance: null,
    raceName: null,
    daysUntilRace: null,
    isRaceToday: false,
    isRaceTomorrow: false,
    isRaceWeek: false,
    raceGoalType: null,
    targetTime: null,
    sleep7d: [],
    avgReadiness: null,
    sleepAvg7dHours: null,
    sleepAvg7dText: null,
    sleepNightCount7d: 0,
    latestSleepDurationText: null,
    latestSleepScore: null,
    latestEnergyScore: null,
    latestSleepDateKey: null,
    workouts7d: [],
    hasWorkoutToday: false,
    todayWorkouts: [],
    todayPrimaryWorkout: null,
    nutritionToday: null,
    nutrition7d: [],
    mealsToday: [],
    latestCompletedRace: null,
    recentRaceResults: [],
    latestHealthCheck: null,
    totalRunKm: 0,
    totalSessions: 0,
    runDays7d: 0,
    longestRun7dKm: null,
    lastWorkoutDate: null,
    lastRun: null,
    latestBody: null,
    todayDate: "2026-07-04",
    contextNotes: [],
    recentPainLogs: [],
    latestPain: null,
    recentMaxPain: null,
    activePain: false,
    recentPainHistory: false,
    painResolved: false,
    painRecoveryStatus: "cleared_normal",
    nutritionBalanceToday: null,
    readinessV2: null,
    recoverySystem: makeRecoverySys(),
    recoveryLoop: {} as CoachContext["recoveryLoop"],
    latestSick: null,
    activeSick: false,
    sickRiskLevel: "none",
  };
  return { ...base, ...overrides };
}

export function makePainSummary(level = 5) {
  return {
    id: "test-pain",
    date: "2026-07-04",
    painLocation: "เข่า",
    painSide: "right",
    painLevel: level,
    startedWhen: "during_run",
    riskLevel: level >= 5 ? "high" : "medium",
    trainingImpact: "significant",
    coachAdvice: "พัก",
    swellingOrRedness: "no",
    canBearWeight: "yes",
    redFlags: [],
    painType: ["ปวด"],
    painStatus: "active" as const,
    hasActivePain: true,
    hasResolvedPain: false,
    resolved: false,
    resolvedAt: null,
  };
}
