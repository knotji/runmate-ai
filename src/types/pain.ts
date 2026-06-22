export type PainSide = "left" | "right" | "both" | "unknown";
export type PainTriYesNo = "yes" | "no" | "unknown";
export type PainRiskLevel = "low" | "medium" | "high";
export type PainTrainingImpact = "run_ok_easy" | "reduce_load" | "rest" | "seek_professional";
export type PainStatus = "active" | "resolved";

export type PainLog = {
  painLocation: string;
  painSide: PainSide;
  painLevel: number;
  startedWhen: string;
  painType: string[];
  painfulWhen: string[];
  swellingOrRedness: PainTriYesNo;
  canBearWeight: PainTriYesNo;
  notes?: string;
  imageUrl?: string;
  riskLevel: PainRiskLevel;
  trainingImpact: PainTrainingImpact;
  coachAdvice: string;
  redFlags: string[];
  createdAt: string;
  resolved?: boolean;
  status?: PainStatus;
  resolvedAt?: string;
};

export type PainAnalysisResult = {
  riskLevel: PainRiskLevel;
  trainingImpact: PainTrainingImpact;
  coachAdvice: string;
  redFlags: string[];
};
