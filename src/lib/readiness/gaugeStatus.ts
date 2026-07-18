// Pure helper for gauge status — no React, safe everywhere.
import type { CoachContext } from "@/lib/buildCoachContext";

export type GaugeStatus = "good" | "fair" | "recovery" | "risk" | "unknown";

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
  // Aligned with getRunMateReadinessLabel's canonical buckets (80/66/50) so the
  // ring color never disagrees with the "N Readiness Label" chip shown right next
  // to it — a score of 70 must not render an amber ring under a blue "Good" chip.
  if (score >= 66) return "good";
  if (score >= 50) return "fair";
  return "recovery";
}
