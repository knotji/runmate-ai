export type StrengthExercise = {
  name: string;
  sets: number;
  reps: string; // e.g. "12", "8-10", "8/ข้าง"
  durationSec?: number | null; // e.g. 30, 45
  restSec: number;
  notes?: string;
  modificationNote?: string;
};

export type StrengthRoutine = {
  id: string;
  name: string;
  description: string;
  warmupMin: number;
  cooldownMin: number;
  exercises: StrengthExercise[];
  notes?: string;
};

export type AIPrescription = {
  routineName: string;
  recommendedTitle: string;
  intensity: "easy" | "moderate" | "hard";
  estimatedDurationMin: number;
  reason: string;
  exercises: StrengthExercise[];
  warnings?: string[];
  shouldAvoid?: string[];
};

export type StrengthLog = {
  type: "strength";
  routineId?: string;
  routineName: string;
  source: "saved_routine" | "ai_prescription" | "custom";
  intensity: "easy" | "moderate" | "hard";
  durationMin: number;
  exercises: StrengthExercise[];
  notes?: string;
  coachReason?: string;
  createdAt: string;
};
