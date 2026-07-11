// Pure function — no React, no Supabase. Safe to import anywhere.
import type { HrZone, HrZoneMethod, HrZoneResult } from "./hrZoneTypes";

export type BuildHrZonesInput = {
  method?: HrZoneMethod | null;
  maxHr?: number | null;
  restingHr?: number | null;
  aerobicThresholdHr?: number | null;
  anaerobicThresholdHr?: number | null;
  manualEasyCapHr?: number | null;
};

const MAX_HR_HIGH_WARNING = "ค่านี้สูงมาก ถ้าไม่ได้วัดจริง อาจทำให้โซนเพี้ยน";

/**
 * Resolves which HR zone method is actually usable given the available data.
 * Priority: explicit + usable method → HRR → AT/AnT → Max HR% → none.
 */
function resolveUsableMethod(input: BuildHrZonesInput): HrZoneMethod | null {
  const hasHrr = input.maxHr != null && input.restingHr != null;
  const hasAtAnt = input.aerobicThresholdHr != null && input.anaerobicThresholdHr != null;
  const hasMaxHr = input.maxHr != null;
  const hasManual = input.manualEasyCapHr != null;

  const isUsable = (method: HrZoneMethod | null | undefined): boolean => {
    if (method === "hrr") return hasHrr;
    if (method === "at_ant") return hasAtAnt;
    if (method === "max_hr") return hasMaxHr;
    if (method === "manual") return hasManual;
    return false;
  };

  if (input.method && input.method !== "auto" && isUsable(input.method)) {
    return input.method;
  }

  if (hasHrr) return "hrr";
  if (hasAtAnt) return "at_ant";
  if (hasMaxHr) return "max_hr";
  if (hasManual) return "manual";
  return null;
}

function buildHrrZones(maxHr: number, restingHr: number): { zones: HrZone[]; easyCapBpm: number } {
  const targetAt = (pct: number) => Math.round(restingHr + (maxHr - restingHr) * pct);

  const zones: HrZone[] = [
    { key: "z1", labelTh: "Zone 1 · Recovery", minBpm: targetAt(0.5), maxBpm: targetAt(0.6), purposeTh: "ฟื้นตัว/วอร์มอัพ" },
    { key: "z2", labelTh: "Zone 2 · Easy/Aerobic", minBpm: targetAt(0.6), maxBpm: targetAt(0.7), purposeTh: "Easy/Aerobic — ฐานความฟิต" },
    { key: "z3", labelTh: "Zone 3 · Steady", minBpm: targetAt(0.7), maxBpm: targetAt(0.8), purposeTh: "Steady — ปานกลาง" },
    { key: "z4", labelTh: "Zone 4 · Threshold", minBpm: targetAt(0.8), maxBpm: targetAt(0.9), purposeTh: "Threshold — หนัก" },
    { key: "z5", labelTh: "Zone 5 · Hard/Max", minBpm: targetAt(0.9), maxBpm: targetAt(1.0), purposeTh: "Hard/Max — หนักมาก" },
  ];

  return { zones, easyCapBpm: targetAt(0.7) };
}

function buildAtAntZones(at: number, ant: number): { zones: HrZone[]; easyCapBpm: number } {
  const zones: HrZone[] = [
    { key: "easy", labelTh: "Recovery/Easy", minBpm: null, maxBpm: at, purposeTh: "ฟื้นตัว/Easy — คุมไม่เกิน AT" },
    { key: "steady", labelTh: "Steady/Tempo", minBpm: at + 1, maxBpm: ant, purposeTh: "Steady/Tempo — ระหว่าง AT กับ AnT" },
    { key: "hard", labelTh: "Hard/Anaerobic", minBpm: ant + 1, maxBpm: null, purposeTh: "Hard/Anaerobic — เหนือ AnT" },
  ];

  return { zones, easyCapBpm: at };
}

function buildMaxHrZones(maxHr: number): { zones: HrZone[]; easyCapBpm: number } {
  const min = Math.round(maxHr * 0.6);
  const max = Math.round(maxHr * 0.7);
  const zones: HrZone[] = [
    { key: "easy", labelTh: "Easy (%MaxHR)", minBpm: min, maxBpm: max, purposeTh: "Easy โดยประมาณจาก %Max HR" },
  ];

  return { zones, easyCapBpm: max };
}

/**
 * Builds HR zones from whatever profile data is available.
 * Never fabricates zones from missing data — returns null when nothing is usable.
 */
export function buildHrZones(input: BuildHrZonesInput): HrZoneResult | null {
  const method = resolveUsableMethod(input);
  if (!method) return null;

  const notesTh: string[] = [];
  if (input.maxHr != null && input.maxHr >= 205) {
    notesTh.push(MAX_HR_HIGH_WARNING);
  }

  if (method === "hrr" && input.maxHr != null && input.restingHr != null) {
    const { zones, easyCapBpm } = buildHrrZones(input.maxHr, input.restingHr);
    return {
      method,
      zones,
      easyCapBpm,
      sourceSummaryTh: `Heart Rate Reserve · Max HR ${input.maxHr} · Resting HR ${input.restingHr}`,
      notesTh,
    };
  }

  if (method === "at_ant" && input.aerobicThresholdHr != null && input.anaerobicThresholdHr != null) {
    const { zones, easyCapBpm } = buildAtAntZones(input.aerobicThresholdHr, input.anaerobicThresholdHr);
    return {
      method,
      zones,
      easyCapBpm,
      sourceSummaryTh: `AT/AnT HR · AT ${input.aerobicThresholdHr} · AnT ${input.anaerobicThresholdHr}`,
      notesTh,
    };
  }

  if (method === "max_hr" && input.maxHr != null) {
    const { zones, easyCapBpm } = buildMaxHrZones(input.maxHr);
    notesTh.push("ใช้ %Max HR เป็น fallback — ไม่แม่นเท่า HRR หรือ AT/AnT");
    return {
      method,
      zones,
      easyCapBpm,
      sourceSummaryTh: `Max HR % · Max HR ${input.maxHr}`,
      notesTh,
    };
  }

  if (method === "manual" && input.manualEasyCapHr != null) {
    return {
      method,
      zones: [],
      easyCapBpm: input.manualEasyCapHr,
      sourceSummaryTh: `ตั้งเอง · Easy HR cap ${input.manualEasyCapHr} bpm`,
      notesTh,
    };
  }

  return null;
}
