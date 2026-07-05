// Pure type definitions for training pace bands.
// No React, no Supabase — safe to import anywhere.

export type PaceRange = {
  minSecPerKm: number;
  maxSecPerKm: number;
};

export type TrainingPaceBands = {
  racePaceSec: number;
  easy: PaceRange;
  long: PaceRange;
  tempo: PaceRange;
  interval: PaceRange;
};

export type PaceBandKey = keyof Omit<TrainingPaceBands, "racePaceSec">;
