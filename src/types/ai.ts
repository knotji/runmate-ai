export type DailyCoachInsight = {
  todayReadiness: number;
  readinessLabel: "Low" | "Fair" | "Good" | "Excellent";
  readinessNote: string;
  workoutRec: string;
  workoutTarget: string;
  weekSummary: string;
  keyObservation: string;
  coachMessage: string;
};

export type ApiResult<T> = {
  data: T;
  source: "gemini" | "openai" | "fallback";
  imageUrl?: string;
};

export type TodayAdaptivePlan = {
  recommendedWorkout: string;
  keepOrAdjust: "keep" | "reduce" | "replace" | "rest";
  reason: string;
  targetDistanceKm: number | null;
  targetPace: string | null;
  targetHR: string | null;
  nutritionFocus: string;
  recoveryFocus: string;
  coachMessage: string;
};
