// Pure helper for gauge status — no React, safe everywhere.
import type { CoachContext } from "@/lib/buildCoachContext";

export type GaugeStatus = "good" | "fair" | "caution" | "recovery" | "risk" | "unknown";

export function getGaugeStatus(
  score: number | null,
  ctx: CoachContext | null | undefined
): GaugeStatus {
  if (ctx?.sickRiskLevel === "hard_stop") return "risk";
  if (ctx?.activePain) {
    const latest = ctx.latestPain;
    if (latest?.hasActivePain && latest.painLevel >= 3) return "risk";
  }
  if (score == null) return "unknown";
  if (score >= 75) return "good";
  if (score >= 60) return "fair";
  if (score >= 45) return "caution";
  return "recovery";
}
