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
  const value = runKm > 0
    ? `${Math.round(runKm * 10) / 10} กม.`
    : effective >= 70 ? "หนัก" : effective >= 45 ? "ปกติ" : "เบา";

  return { key: "load", label: "โหลด", value, icon: "🏃", tone };
}

function buildEnergySignal(ctx: CoachContext): TodaySignal {
  // CRITICAL: null/missing energy score must NEVER be treated as 0 or "bad"
  const energyScore = ctx.latestEnergyScore ?? null;
  const fuelScore = ctx.recoverySystem?.axes?.fuel?.score ?? null;
  const hasMeals = ctx.mealsToday.length > 0;

  if (energyScore === null) {
    // Fall back to fuel axis only when we have actual meal data
    if (hasMeals && fuelScore !== null) {
      const tone: SignalTone = fuelScore >= 70 ? "good" : fuelScore >= 50 ? "warn" : "bad";
      const value = fuelScore >= 70 ? "เพียงพอ" : fuelScore >= 50 ? "ปานกลาง" : "ต่ำ";
      return { key: "energy", label: "พลังงาน", value, icon: "⚡", tone };
    }
    // No data — always neutral, never bad
    return { key: "energy", label: "พลังงาน", value: "ไม่มีข้อมูล", icon: "⚡", tone: "neutral" };
  }

  const tone: SignalTone = energyScore >= 70 ? "good" : energyScore >= 50 ? "warn" : "bad";
  return { key: "energy", label: "พลังงาน", value: `${Math.round(energyScore)}`, icon: "⚡", tone };
}

function buildPainSignal(ctx: CoachContext): TodaySignal {
  if (ctx.activePain && ctx.latestPain) {
    const level = ctx.latestPain.painLevel ?? 0;
    const value = level > 0 ? `${level}/10` : "มีอาการ";
    return { key: "pain", label: "เจ็บ", value, icon: "🩹", tone: "bad" };
  }

  if ((ctx.recentPainHistory || ctx.painResolved) && ctx.latestPain) {
    return { key: "pain", label: "เจ็บ", value: "กำลังฟื้น", icon: "🩹", tone: "warn" };
  }

  return { key: "pain", label: "เจ็บ", value: "ไม่มีอาการ", icon: "🩹", tone: "good" };
}
