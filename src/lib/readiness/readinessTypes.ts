// Pure type definitions for the v0.1.1 Daily Readiness Engine.
// No React, no Supabase — safe to import anywhere.

export type ReadinessBand = "green" | "yellow" | "red" | "pain_risk";

export type LoadTarget = "rest" | "walk" | "easy" | "moderate" | "build" | "race";

export type ReadinessReasonKey =
  | "pain_active"
  | "pain_recent"
  | "sleep_short"
  | "sleep_missing"
  | "hrv_drop"
  | "load_high"
  | "load_fresh"
  | "energy_low"
  | "fuel_low"
  | "race_today"
  | "race_tomorrow";

export type ReadinessReason = {
  key: ReadinessReasonKey;
  label: string;
  detail?: string;
};

export type TodaySignalKey = "recovery" | "load" | "energy" | "sleep";

export type SignalTone = "good" | "warn" | "bad" | "neutral";

export type TodaySignal = {
  key: TodaySignalKey;
  label: string;
  value: string;
  icon: string;
  tone: SignalTone;
};

export type DailyReadiness = {
  band: ReadinessBand;
  loadTarget: LoadTarget;
  coachSummary: string;
  reasons: ReadinessReason[];
  avoid: string[];
  allow: string[];
  signals: TodaySignal[];
  sleepAdvice?: string;
  hasSleepData: boolean;
  hasFuelData: boolean;
  // Pain no longer has its own signal-row slot (see todaySignals.ts), but the
  // explanation logic still needs to know whether there's a current pain
  // warning — computed once here from the same source todaySignals.ts uses.
  hasPainWarning: boolean;
};
