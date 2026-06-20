export type ReadinessLabel = "Low" | "Fair" | "Good" | "Excellent";

export type SleepAnalysis = {
  extracted: {
    date: string | null;
    sleepDuration: string | null;
    sleepScore: number | null;
    energyScore: number | null;
    restingHR: number | null;
    hrv: number | null;
    sleepQualityLabel: string | null;
    visibleNotes: string | null;
  };
  coach: {
    readinessScore: number;
    readinessLabel: ReadinessLabel;
    aiSummary: string;
    todayRecommendation: string;
    nutritionFocus: string;
    recoveryFocus: string;
    sleepFocus: string;
    warningNotes: string;
  };
};

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "pre-run" | "post-run";

export type MealAnalysis = {
  extracted: {
    detectedFood: string;
    proteinLevel: "low" | "moderate" | "good";
    carbLevel: "low" | "moderate" | "good";
    fatLevel: "low" | "moderate" | "high";
    hydrationSuggestion: string;
    trainingFit: string;
  };
  coach: {
    aiSummary: string;
    suggestion: string;
  };
};

export type RunAnalysis = {
  extracted: {
    date: string | null;
    distanceKm: number | null;
    duration: string | null;
    avgPace: string | null;
    avgHR: number | null;
    maxHR: number | null;
    cadence: number | null;
    calories: number | null;
    elevationGain: number | null;
    trainingEffect: string | null;
  };
  coach: {
    runSummary: string;
    intensityAssessment: string;
    wasTooHard: boolean;
    recoveryAdvice: string;
    nutritionAfterRun: string;
    nextRunSuggestion: string;
    coachNote: string;
  };
};

export type WorkoutAnalysis = {
  extracted: {
    workoutKind: "outdoor_run" | "treadmill" | "strength" | "walk" | "cycling" | "other";
    date: string | null;
    distanceKm: number | null;
    duration: string | null;
    avgPace: string | null;
    avgSpeedKmh: number | null;
    avgHR: number | null;
    maxHR: number | null;
    cadence: number | null;
    calories: number | null;
    elevationGain: number | null;
    vo2Max: number | null;
    sweatLossMl: number | null;
    visibleMetrics: string[];
  };
  coach: {
    workoutSummary: string;
    intensityAssessment: string;
    trainingLoadNote: string;
    wasTooHard: boolean;
    recoveryAdvice: string;
    nutritionAfterWorkout: string;
    nextWorkoutSuggestion: string;
    coachNote: string;
  };
};

export type BodyCompositionAnalysis = {
  extracted: {
    date: string | null;
    weightKg: number | null;
    skeletalMuscleKg: number | null;
    bodyFatPercent: number | null;
    fatMassKg: number | null;
    bodyWaterKg: number | null;
    bmi: number | null;
    bmrCalories: number | null;
    visibleNotes: string | null;
  };
  coach: {
    bodySummary: string;
    runnerInterpretation: string;
    nutritionFocus: string;
    strengthFocus: string;
    cautionNotes: string;
    coachNote: string;
  };
};

export type DailySummary = {
  readinessScore: number | null;
  overallSummary: string;
  trainingReview: string;
  nutritionReview: string;
  recoveryReview: string;
  whatWentWell: string;
  whatToImprove: string;
  tomorrowPlan: string;
  coachMessage: string;
};

export type PostRunAnalysis = {
  sessionTitle: string;
  effortScore: number;
  effortLabel: "Easy" | "Moderate" | "Hard" | "Very hard";
  workoutSummary: string;
  intensityRead: string;
  hrAssessment: string;
  paceCadenceNotes: string;
  trainingLoadImpact: string;
  recoveryPriority: string;
  nutritionHydration: string;
  tomorrowRecommendation: string;
  riskFlags: string[];
  coachMessage: string;
};
