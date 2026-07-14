export type ReadinessLabel = "Low" | "Fair" | "Good" | "Excellent";
export type AIConfidence = "low" | "medium" | "high";

export type AIReadQuality = {
  confidence?: AIConfidence;
  unclearFields?: string[];
};

export type SleepAnalysis = {
  extracted: {
    date: string | null;
    sleepDuration: string | null;
    actualSleepDurationMinutes?: number | null;
    actualSleepDurationText?: string | null;
    timeInBedMinutes?: number | null;
    timeInBedText?: string | null;
    sleepStartTime?: string | null;
    sleepEndTime?: string | null;
    avgSleepingHeartRate?: number | null;
    avgSleepingHrv?: number | null;
    avgRespiratoryRate?: number | null;
    sleepStageAwakeMinutes?: number | null;
    sleepStageRemMinutes?: number | null;
    sleepStageLightMinutes?: number | null;
    sleepStageDeepMinutes?: number | null;
    sleepStageMinutes?: {
      awake?: number | null;
      rem?: number | null;
      light?: number | null;
      deep?: number | null;
    } | null;
    sleepDurationSource?: "actual" | "time_in_bed_fallback" | "unknown";
    mergedFromMultipleImages?: boolean;
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
} & AIReadQuality;

export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "pre-run" | "post-run";

export type MealEntry = {
  detectedFoods: { name: string; portionEstimate?: string; confidence?: "low" | "medium" | "high" }[];
  nutrition: { caloriesKcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null };
  imageUrl?: string | null;
  createdAt?: string;
};

export type MealAnalysis = {
  mealType: string;
  inputMode?: "image" | "text";
  originalMealText?: string;
  note?: string;
  detectedFoods: {
    name: string;
    portionEstimate?: string;
    confidence?: "low" | "medium" | "high";
    /** Discrete count of this food item (e.g. 2 boiled eggs = 2). Defaults to 1 when the AI/user doesn't specify a count. */
    quantity?: number;
    /** Thai unit for quantity, e.g. "ฟอง", "ไม้", "จาน". Empty when not applicable. */
    unit?: string;
  }[];
  nutrition: {
    caloriesKcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
  };
  nutritionRange?: {
    caloriesKcal?: { min: number; max: number } | null;
    proteinG?: { min: number; max: number } | null;
    carbsG?: { min: number; max: number } | null;
    fatG?: { min: number; max: number } | null;
  };
  trainingFit?: {
    bestFor: string[];
    carbAdequacy: "low" | "ok" | "good" | "high" | "unknown";
    proteinAdequacy: "low" | "ok" | "good" | "high" | "unknown";
    fatLoad: "low" | "moderate" | "high" | "unknown";
    hydrationNote: string;
    coachNote: string;
  };
  confidence: "low" | "medium" | "high";
  unclearFields?: string[];
  needsReview: boolean;
  errorLikeMessage?: string | null;
  imageUrl?: string | null;
  createdAt?: string;
  mealSlot?: "breakfast" | "lunch" | "dinner" | "snack" | "other";
  sourceType?: "image" | "manual";
  itemCount?: number;
  extracted?: {
    detectedFood?: string;
    proteinLevel?: "low" | "moderate" | "good";
    carbLevel?: "low" | "moderate" | "good";
    fatLevel?: "low" | "moderate" | "high";
    hydrationSuggestion?: string;
    trainingFit?: string;
  };
  coach?: {
    aiSummary?: string;
    suggestion?: string;
  };
  entries?: MealEntry[];
  imageCount?: number;
  entriesMerged?: number;
  updatedAt?: string;
  localDate?: string;
  mealGroupKey?: string;
  coachNote?: string;
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
    mergedFromMultipleImages?: boolean;
    // Strength-specific fields (optional — null/undefined for running)
    exercises?: { name: string; sets?: number | null; reps?: string | null; weightKg?: number | null }[] | null;
    muscleGroups?: string[] | null;
    intensity?: "easy" | "moderate" | "hard" | null;
    rpe?: number | null;
    // Swim-specific fields (optional — null/undefined for non-swim)
    swimKind?: "pool" | "open_water" | null;
    distanceM?: number | null;
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
} & AIReadQuality;

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
} & AIReadQuality;

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

export type LabValue = {
  value: number | string | null;
  unit?: string | null;
  ref?: string | null;
  label: string;
  status?: "low" | "normal" | "borderline" | "high" | "unknown";
};

export type HealthCheckAnalysis = {
  checkupDate: string | null;
  sourceLabel: string | null;
  labs: {
    fbs?: LabValue;
    hba1c?: LabValue;
    totalCholesterol?: LabValue;
    triglyceride?: LabValue;
    ldl?: LabValue;
    hdl?: LabValue;
    uricAcid?: LabValue;
    bun?: LabValue;
    creatinine?: LabValue;
    egfr?: LabValue;
    sgotAst?: LabValue;
    sgptAlt?: LabValue;
    alp?: LabValue;
    hemoglobin?: LabValue;
    hematocrit?: LabValue;
    wbc?: LabValue;
    platelet?: LabValue;
    urineProtein?: LabValue;
    urineSugar?: LabValue;
    urineBlood?: LabValue;
    hbsAg?: LabValue;
    antiHbs?: LabValue;
  };
  nutritionFlags: {
    watchLDL: boolean;
    watchTotalCholesterol: boolean;
    watchTriglyceride: boolean;
    watchBloodSugar: boolean;
    watchUricAcid: boolean;
    watchLiverEnzymes: boolean;
    watchKidney: boolean;
  };
  coachSummary: string;
  foodGuidance: {
    prefer: string[];
    limit: string[];
    notes: string[];
  };
  disclaimer: string;
  confidence: "low" | "medium" | "high";
  unclearFields: string[];
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
