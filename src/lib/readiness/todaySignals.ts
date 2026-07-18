// Pure function — no React, no "use client". Safe on server and client.
import type { CoachContext } from "@/lib/buildCoachContext";
import { getRecoveryAxisLabel, getAxisTone } from "@/lib/recoverySystem";
import type { SignalTone, TodaySignal } from "./readinessTypes";

// The full 4 Recovery axes (recovery/load/sleep/fuel) — matches the "ดูรายละเอียด
// Recovery" breakdown exactly. Pain doesn't get its own slot here: it's
// safety-critical and already gets dedicated, always-visible real estate
// elsewhere on the page (CompactPainCard / the sick hard-stop InsightCard),
// so this row doesn't need to duplicate it — see buildReadinessExplanation
// for where pain status still feeds the recommendation logic.
export function buildTodaySignals(ctx: CoachContext): TodaySignal[] {
  return [
    buildRecoverySignal(ctx),
    buildLoadSignal(ctx),
    buildSleepSignal(ctx),
    buildEnergySignal(ctx),
  ];
}

// getAxisTone's 5-value scale collapses onto SignalTone's 4 — "info" reads as
// "good" here (its recovery/fuel threshold is already >=55, a decent score),
// and "danger" is included for completeness even though none of the axis
// tone functions currently emit it (see getRecoveryAxisCoachingTone for where
// danger is actually gated behind pain / severe combined state).
function toSignalTone(axisTone: ReturnType<typeof getAxisTone>): SignalTone {
  if (axisTone === "success" || axisTone === "info") return "good";
  if (axisTone === "warning") return "warn";
  if (axisTone === "danger") return "bad";
  return "neutral";
}

// Same score + same label/tone functions the "ดูรายละเอียด Recovery" card
// uses — this compact row and that detail breakdown must never disagree on
// what a given score means (e.g. recovery 68 reading "ดี" in one place and
// "ปานกลาง" in the other).
function buildRecoverySignal(ctx: CoachContext): TodaySignal {
  const score = ctx.recoverySystem?.axes?.recovery?.score ?? null;
  const hasSleepData = ctx.sleep7d.length > 0;

  if (!hasSleepData || score === null) {
    return { key: "recovery", label: "ฟื้นตัว", value: "ไม่มีข้อมูล", icon: "💚", tone: "neutral" };
  }

  return {
    key: "recovery",
    label: "ฟื้นตัว",
    value: getRecoveryAxisLabel("recovery", score),
    icon: "💚",
    tone: toSignalTone(getAxisTone("recovery", score)),
  };
}

function buildLoadSignal(ctx: CoachContext): TodaySignal {
  const loadScore = ctx.recoverySystem?.axes?.load?.score ?? null;
  const runKm = ctx.totalRunKm ?? 0;

  if (loadScore === null && runKm === 0) {
    return { key: "load", label: "โหลด", value: "ไม่มีข้อมูล", icon: "🏃", tone: "neutral" };
  }

  const effective = loadScore ?? (runKm > 40 ? 70 : runKm > 20 ? 50 : 30);
  // Distance is more concrete/scannable than a word when we have it — the
  // label is still driven by the shared axis tone/thresholds underneath, just
  // not printed as text when a number can stand in for it.
  const kmText = runKm > 0 ? `${Math.round(runKm * 10) / 10} กม.` : null;
  const value = kmText ?? getRecoveryAxisLabel("load", effective);

  return { key: "load", label: "โหลด", value, icon: "🏃", tone: toSignalTone(getAxisTone("load", effective)) };
}

function buildEnergySignal(ctx: CoachContext): TodaySignal {
  // CRITICAL: null/missing energy score must NEVER be treated as 0 or "bad"
  const energyScore = ctx.latestEnergyScore ?? null;
  const fuelScore = ctx.recoverySystem?.axes?.fuel?.score ?? null;

  if (energyScore === null) {
    // Fuel axis already produces a real score off just 1 logged meal (see
    // recoverySystem.ts's base-meal-count formula) — trust it the same way
    // the Recovery detail card does, rather than second-guessing it here with
    // its own separate meal-count gate and a hardcoded "ยังไม่ชัด".
    if (fuelScore !== null && ctx.mealsToday.length >= 1) {
      return {
        key: "energy",
        label: "พลังงาน",
        value: getRecoveryAxisLabel("fuel", fuelScore),
        icon: "⚡",
        tone: toSignalTone(getAxisTone("fuel", fuelScore)),
      };
    }
    // No meals logged at all — always neutral, never bad
    return { key: "energy", label: "พลังงาน", value: "ไม่มีข้อมูล", icon: "⚡", tone: "neutral" };
  }

  // Watch energy score: qualitative only — no raw numbers. Not a recovery-system
  // axis, so it keeps its own scale rather than borrowing getRecoveryAxisLabel.
  const tone: SignalTone = energyScore >= 70 ? "good" : energyScore >= 50 ? "warn" : "bad";
  const value = energyScore >= 70 ? "ดี" : energyScore >= 50 ? "ปานกลาง" : "ต่ำ";
  return { key: "energy", label: "พลังงาน", value, icon: "⚡", tone };
}

function buildSleepSignal(ctx: CoachContext): TodaySignal {
  const score = ctx.recoverySystem?.axes?.sleep?.score ?? null;
  const hasSleepData = ctx.sleep7d.length > 0;

  if (!hasSleepData || score === null) {
    return { key: "sleep", label: "นอน", value: "ไม่มีข้อมูล", icon: "🌙", tone: "neutral" };
  }

  return {
    key: "sleep",
    label: "นอน",
    value: getRecoveryAxisLabel("sleep", score),
    icon: "🌙",
    tone: toSignalTone(getAxisTone("sleep", score)),
  };
}

// Pain status still feeds the recommendation logic (buildReadinessExplanation,
// buildReasons) even though it no longer has its own signal-row slot — kept
// here as the one shared place that decides "is there a pain warning right now".
export function hasPainWarning(ctx: CoachContext): boolean {
  if (ctx.activePain) return true;
  const prs = ctx.painRecoveryStatus;
  if (prs === "cleared_light" || prs === "improving" || prs === "recent_pain") return true;
  return Boolean((ctx.recentPainHistory || ctx.painResolved) && ctx.latestPain);
}
