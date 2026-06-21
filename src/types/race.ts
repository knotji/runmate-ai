export type RaceDistance = "5K" | "10K" | "Half Marathon" | "Full Marathon" | "Custom";

export type RaceGoal = {
  id?: string;
  raceName: string;
  raceDate: string;
  raceDistance: RaceDistance;
  goalType: string;
  targetTime?: string;
  currentLongestRunKm?: number;
  trainingDaysPerWeek?: number;
  preferredLongRunDay?: string;
  injuryNotes?: string;
  planPreference?: string;
};

export type TrainingPhase = {
  name: string;
  weekRange: string;
  focus: string;
  notes: string;
};

export type WeekWorkout = {
  day: string;
  workoutType: string;
  distanceKm: number | null;
  targetPace: string | null;
  targetHR: string | null;
  description: string;
};

export type TrainingWeek = {
  weekNumber: number;
  phase: string;
  weeklyFocus: string;
  targetWeeklyDistanceKm: number | null;
  longRunDistanceKm: number | null;
  workouts: WeekWorkout[];
};

export type RacePlan = {
  raceCountdownText: string;
  totalWeeks: number;
  currentPhase: string;
  planSummary: string;
  phases: TrainingPhase[];
  weeks: TrainingWeek[];
  safetyNotes: string;
};

export type GoalResult = "completed" | "achieved" | "missed" | "unknown";

export type RaceResult = {
  id?: string;
  raceGoalId?: string | null;
  linkedHistoryItemId?: string | null;
  raceName: string | null;
  raceDate: string | null;
  raceDistance: string | null;
  goalType: string | null;
  targetTime?: string | null;
  actualDistanceKm?: number | null;
  actualTime?: string | null;
  actualPace?: string | null;
  avgHr?: number | null;
  maxHr?: number | null;
  cadence?: number | null;
  calories?: number | null;
  elevationM?: number | null;
  resultStatus?: string | null;
  goalResult?: GoalResult | null;
  coachSummary?: string | null;
  reflection?: string | null;
  rawWorkoutData?: unknown;
  createdAt?: string;
  updatedAt?: string;
};
