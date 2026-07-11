// Pure type definitions for the HR Zone / Easy HR Cap Engine.
// No React, no Supabase — safe to import anywhere.

export type HrZoneMethod = "auto" | "hrr" | "at_ant" | "max_hr" | "manual";

export type HrZoneKey = "z1" | "z2" | "z3" | "z4" | "z5" | "easy" | "steady" | "hard";

export type HrZone = {
  key: HrZoneKey;
  labelTh: string;
  minBpm?: number | null;
  maxBpm?: number | null;
  purposeTh: string;
};

export type HrZoneResult = {
  method: HrZoneMethod;
  zones: HrZone[];
  easyCapBpm?: number | null;
  sourceSummaryTh: string;
  notesTh: string[];
};

export type EasyHrCapGuidance = {
  capBpm: number;
  normalCapBpm: number;
  adjustedCapBpm: number;
  labelTh: string;
  reasonTh: string;
  displayTh: string;
  cautionTh?: string;
};
