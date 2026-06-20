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
