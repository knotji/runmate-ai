// Pure function — no React. Bridges CoachContext + UserProfile into HR zone guidance.
import type { CoachContext } from "@/lib/buildCoachContext";
import type { UserProfile } from "@/types/profile";
import { parseHrValue } from "@/lib/hrValidation";
import { buildHrZones } from "./hrZones";
import { buildEasyHrCap } from "./easyHrCap";
import type { EasyHrCapGuidance, HrZoneResult } from "./hrZoneTypes";

export type HrGuidance = {
  hrZones: HrZoneResult | null;
  easyCap: EasyHrCapGuidance | null;
};

/**
 * Builds today's HR zone + easy HR cap guidance from a CoachContext.
 * Returns null zones/cap when there isn't enough profile data — never fabricates values.
 */
export function buildHrGuidanceForContext(ctx: CoachContext | null | undefined): HrGuidance {
  const profile = (ctx?.profile ?? null) as UserProfile | null;
  if (!profile) return { hrZones: null, easyCap: null };

  const hrZones = buildHrZones({
    method: profile.hrZoneMethod ?? null,
    maxHr: profile.maxHr ?? null,
    restingHr: profile.normalRestingHr ?? null,
    aerobicThresholdHr: profile.aerobicThresholdHr ?? null,
    anaerobicThresholdHr: profile.anaerobicThresholdHr ?? null,
    manualEasyCapHr: parseHrValue(profile.easyHrCap) ?? null,
  });

  const easyCap = buildEasyHrCap({
    hrZones,
    sickRiskLevel: ctx?.sickRiskLevel ?? null,
    painRecoveryStatus: ctx?.painRecoveryStatus ?? null,
    loadScore: ctx?.recoverySystem?.axes?.load?.score ?? null,
    sleepScore: ctx?.recoverySystem?.axes?.sleep?.score ?? null,
  });

  return { hrZones, easyCap };
}
