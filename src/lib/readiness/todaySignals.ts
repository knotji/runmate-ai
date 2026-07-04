// Pure function — no React, no "use client". Safe on server and client.
import type { CoachContext } from "@/lib/buildCoachContext";
import type { SignalTone, TodaySignal } from "./readinessTypes";

export function buildTodaySignals(ctx: CoachContext): TodaySignal[] {
  return [
    buildRecoverySignal(ctx),
    buildLoadSignal(ctx),
    buildEnergySignal(ctx),
    buildPainSignal(ctx),
  ];
}

function buildRecoverySignal(ctx: CoachContext): TodaySignal {
  const score = ctx.recoverySystem?.axes?.recovery?.score ?? null;
  const hasSleepData = ctx.sleep7d.length > 0;

  if (!hasSleepData || score === null) {
    return { key: "recovery", label: "ฟื้นตัว", value: "ไม่มีข้อมูล", icon: "💚", tone: "neutral" };
  }

  const tone: SignalTone = score >= 70 ? "good" : score >= 50 ? "warn" : "bad";
  const value = score >= 70 ? "ดี" : score >= 50 ? "ปานกลาง" : "ต่ำ";
  return { key: "recovery", label: "ฟื้นตัว", value, icon: "💚", tone };
}

function buildLoadSignal(ctx: CoachContext): TodaySignal {
  const loadScore = ctx.recoverySystem?.axes?.load?.score ?? null;
  const runKm = ctx.totalRunKm ?? 0;

  if (loadScore === null && runKm === 0) {
    return { key: "load", label: "โหลด", value: "ไม่มีข้อมูล", icon: "🏃", tone: "neutral" };
  }

  const effective = loadScore ?? (runKm > 40 ? 70 : runKm > 20 ? 50 : 30);
  // Higher load score = heavier week = body is more stressed
  const tone: SignalTone = effective >= 70 ? "bad" : effective >= 45 ? "warn" : "good";
  const kmText = runKm > 0 ? `${Math.round(runKm * 10) / 10} กม.` : null;
  const value = effective >= 70
    ? "สัปดาห์หนัก"
    : effective >= 45
    ? (kmText ?? "ปกติ")
    : (kmText ?? "เบา");

  return { key: "load", label: "โหลด", value, icon: "🏃", tone };
}

function buildEnergySignal(ctx: CoachContext): TodaySignal {
  // CRITICAL: null/missing energy score must NEVER be treated as 0 or "bad"
  const energyScore = ctx.latestEnergyScore ?? null;
  const fuelScore = ctx.recoverySystem?.axes?.fuel?.score ?? null;

  if (energyScore === null) {
    // Fall back to fuel axis only when we have enough meal data to be confident
    if (fuelScore !== null && ctx.mealsToday.length >= 2) {
      const tone: SignalTone = fuelScore >= 70 ? "good" : fuelScore >= 50 ? "warn" : "bad";
      const value = fuelScore >= 70 ? "เพียงพอ" : fuelScore >= 50 ? "ปานกลาง" : "ต่ำ";
      return { key: "energy", label: "พลังงาน", value, icon: "⚡", tone };
    }
    // Partial meal data (1 meal logged) — not enough to be confident
    if (ctx.mealsToday.length === 1) {
      return { key: "energy", label: "พลังงาน", value: "ยังไม่ชัด", icon: "⚡", tone: "neutral" };
    }
    // No data — always neutral, never bad
    return { key: "energy", label: "พลังงาน", value: "ไม่มีข้อมูล", icon: "⚡", tone: "neutral" };
  }

  // Watch energy score: qualitative only — no raw numbers
  const tone: SignalTone = energyScore >= 70 ? "good" : energyScore >= 50 ? "warn" : "bad";
  const value = energyScore >= 70 ? "ดี" : energyScore >= 50 ? "ปานกลาง" : "ต่ำ";
  return { key: "energy", label: "พลังงาน", value, icon: "⚡", tone };
}

function buildPainSignal(ctx: CoachContext): TodaySignal {
  if (ctx.activePain && ctx.latestPain) {
    const level = ctx.latestPain.painLevel ?? 0;
    const value = level > 0 ? `${level}/10` : "มีอาการ";
    return { key: "pain", label: "เจ็บ", value, icon: "🩹", tone: "bad" };
  }

  // Use explicit painRecoveryStatus for precise display
  const prs = ctx.painRecoveryStatus;
  if (prs === "cleared_normal") {
    return { key: "pain", label: "เจ็บ", value: "ไม่มีเจ็บ", icon: "🩹", tone: "good" };
  }
  if (prs === "cleared_light") {
    return { key: "pain", label: "เจ็บ", value: "เบา ๆ ได้", icon: "🩹", tone: "warn" };
  }
  if (prs === "improving" || prs === "recent_pain") {
    return { key: "pain", label: "เจ็บ", value: "กำลังฟื้น", icon: "🩹", tone: "warn" };
  }

  if ((ctx.recentPainHistory || ctx.painResolved) && ctx.latestPain) {
    return { key: "pain", label: "เจ็บ", value: "กำลังฟื้น", icon: "🩹", tone: "warn" };
  }

  return { key: "pain", label: "เจ็บ", value: "ไม่มีอาการ", icon: "🩹", tone: "good" };
}
