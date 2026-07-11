// Pure function — no React, no Supabase. Safe to import anywhere.
import type { PainRecoveryStatus } from "@/lib/painRecovery";
import type { SickRiskLevel } from "@/types/sick";
import type { EasyHrCapGuidance, HrZoneResult } from "./hrZoneTypes";

export type BuildEasyHrCapInput = {
  hrZones?: HrZoneResult | null;
  sickRiskLevel?: SickRiskLevel | null;
  painRecoveryStatus?: PainRecoveryStatus | null;
  loadScore?: number | null;
  sleepScore?: number | null;
};

const MIN_ADJUSTED_FLOOR = 10;

/**
 * Builds today's easy HR cap guidance from the base HR zones plus readiness signals.
 * Returns null when there is no usable cap, or when sick hard-stop disables HR training targets.
 */
export function buildEasyHrCap(input: BuildEasyHrCapInput): EasyHrCapGuidance | null {
  const normalCapBpm = input.hrZones?.easyCapBpm ?? null;
  if (normalCapBpm == null) return null;

  if (input.sickRiskLevel === "hard_stop") return null;

  const loadScore = input.loadScore ?? 0;
  const sleepScore = input.sleepScore ?? 100;
  const highLoad = loadScore >= 65;
  const lowSleep = sleepScore < 50;

  let reduction = 0;
  let reasonTh = "";
  if (highLoad && lowSleep) {
    reduction = 8;
    reasonTh = "โหลดสูง + นอนน้อย";
  } else if (highLoad) {
    reduction = 5;
    reasonTh = "โหลดสูง";
  } else if (lowSleep) {
    reduction = 4;
    reasonTh = "นอนน้อย";
  } else {
    reasonTh = "ร่างกายพร้อมปกติ";
  }
  reduction = Math.min(reduction, MIN_ADJUSTED_FLOOR);

  const adjustedCapBpm = Math.round(normalCapBpm - reduction);
  const capBpm = adjustedCapBpm;

  const isActivePain = input.painRecoveryStatus === "active_pain";

  let displayTh: string;
  if (reduction > 0) {
    displayTh = `วันนี้${reasonTh} คุม HR ไม่เกิน ${adjustedCapBpm} bpm ดีกว่า`;
  } else {
    displayTh = `คุม HR ไม่เกิน ${adjustedCapBpm} bpm`;
  }

  const cautionTh = isActivePain
    ? "ยังมีอาการเจ็บ — อย่าใช้ HR cap นี้เป็นเป้าซ้อม เน้นฟื้นตัวก่อน"
    : undefined;

  return {
    capBpm,
    normalCapBpm,
    adjustedCapBpm,
    labelTh: "Easy HR cap วันนี้",
    reasonTh,
    displayTh,
    cautionTh,
  };
}
