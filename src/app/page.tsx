"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { NutritionBalanceCard } from "@/components/NutritionBalanceCard";
import { NextMealCard } from "@/components/NextMealCard";
import type { NextMealRecommendation } from "@/app/api/next-meal/route";
import { buildTodayRecommendationReasons } from "@/lib/todayReasons";
import { formatThaiDate, todayBangkokDateKey } from "@/lib/date";
import { buildCoachContextFromSupabase, type CoachContext, type NutritionDaySummary, type PainSummary, type TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";
import { getTodayReadiness, getTodayPlannedWorkout, getReadinessCategoryLabel, checkPlannedWorkoutMatching } from "@/lib/todayPlanning";
import { buildRunMateRecoverySystem, getAxisTone, getRecoveryAxisCoachingTone, formatAxisScore, getRecoveryAxisLabel, getOverallDisplayStatus } from "@/lib/recoverySystem";
import { buildDailyReadiness } from "@/lib/readiness/dailyReadiness";
import { buildReadinessExplanation } from "@/lib/readiness/readinessExplanation";
import { buildTrainingPaceBands, getAllowedPaceBandsForReadiness, getTodayDisplayPaceKeys, formatPaceRange } from "@/lib/training/trainingPaceBands";
import { buildHrGuidanceForContext } from "@/lib/hr/buildHrGuidance";
import type { PaceBandKey } from "@/lib/training/trainingPaceTypes";
import { ReadinessSignalBars } from "@/components/ReadinessSignalBars";
import { ReadinessGauge, type GaugeStatus } from "@/components/ReadinessGauge";
import { TodaySignalCircles } from "@/components/TodaySignalCircles";
import { DailyBriefingCard } from "@/components/DailyBriefingCard";
import { getGaugeStatus } from "@/lib/readiness/gaugeStatus";
import { getTodayTrainingGuardrail } from "@/lib/trainingGuardrails";
import { StatusHero } from "@/components/ui/StatusHero";
import { DetailAccordion } from "@/components/ui/DetailAccordion";
import { InsightCard } from "@/components/ui/InsightCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { RmTone } from "@/components/ui/tone";
import { cn } from "@/lib/cn";
import { createHistoryItem, saveHistoryItems } from "@/lib/cloudHistory";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import { loadGoalProfileFromSupabase } from "@/lib/goals/goalStorage";
import { GoalAwareTodayStrip } from "@/components/GoalAwareTodayStrip";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";
import { loadRoutinesFromSupabase, logCompletedStrength } from "@/lib/strength";
import { safeStrengthMins } from "@/lib/reportDaySummary";
import type { PainLog, PainSide } from "@/types/pain";
import type { RaceGoal } from "@/types/race";
import type { AIPrescription, StrengthExercise, StrengthRoutine } from "@/types/strength";
import type { DailyCoachInsight } from "@/types/ai";

const TODAY_INSIGHT_CLIENT_TIMEOUT_MS = 18000;

function getRecommendedSubtype(insight: DailyCoachInsight | null, ctx: CoachContext | null): "run" | "strength" | "walk" | "other" {
  if (ctx && (ctx.sickRiskLevel === "hard_stop" || ctx.sickRiskLevel === "caution" || ctx.sickRiskLevel === "mild")) return "walk";
  if (ctx && (ctx.latestPain || ctx.recentPainLogs?.length)) {
    const p = ctx.latestPain ?? ctx.recentPainLogs[0];
    if (p.hasActivePain && (p.riskLevel === "high" || p.riskLevel === "medium")) return "walk";
  }
  if (ctx && ctx.recentRaceResults && ctx.recentRaceResults.length > 0) {
    const lastRace = ctx.recentRaceResults[0];
    if (lastRace.raceDate) {
      const todayStr = ctx.todayDate || todayBangkokDateKey();
      const diffMs = Date.parse(todayStr) - Date.parse(lastRace.raceDate);
      if (diffMs / 86400000 >= 0 && diffMs / 86400000 <= 3) return "walk";
    }
  }
  if (!insight || !insight.workoutRec) return "run";
  const rec = insight.workoutRec.toLowerCase();
  if (rec.includes("เวท") || rec.includes("strength") || rec.includes("ออกกำลังกายแรงต้าน") || rec.includes("บอดี้เวท")) return "strength";
  if (rec.includes("เดิน") || rec.includes("walk") || rec.includes("recovery") || rec.includes("ฟื้นฟู") || rec.includes("พัก") || rec.includes("rest")) return "walk";
  return "run";
}

type TodayInsightResponse = {
  ok?: boolean;
  usedFallback?: boolean;
  data?: DailyCoachInsight;
  errorCode?: string;
  message?: string;
  debugMessage?: string;
};

function buildClientTodayFallback(ctx: CoachContext | null): DailyCoachInsight {
  const v2 = ctx?.readinessV2;
  const readiness = v2?.score ?? ctx?.avgReadiness ?? ctx?.sleep7d?.[0]?.readiness ?? 65;
  const label = (v2?.label ?? getReadinessCategoryLabel(readiness)) as DailyCoachInsight["readinessLabel"];
  const latestPain = ctx?.latestPain ?? null;
  const latestWorkout = ctx?.todayPrimaryWorkout ?? null;
  const readinessNote = v2?.readinessNote ?? (ctx?.latestSleepDurationText ? `นอนล่าสุด ${ctx.latestSleepDurationText}` : "ใช้ข้อมูลล่าสุดจาก Report");
  const weekParts = [
    ctx && ctx.totalRunKm > 0 ? `วิ่ง ${Math.round(ctx.totalRunKm * 10) / 10} กม.` : null,
    ctx && ctx.totalSessions > 0 ? `${ctx.totalSessions} ครั้ง` : null,
    ctx?.sleepAvg7dText ? `นอนเฉลี่ย ${ctx.sleepAvg7dText}` : null,
  ].filter(Boolean);

  if (latestWorkout) {
    return {
      todayReadiness: readiness,
      readinessLabel: label,
      readinessNote,
      workoutRec: latestWorkout.kind === "race" ? "วันนี้แข่งจบแล้ว" : "วันนี้ซ้อมพอแล้ว",
      workoutTarget: "ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว",
      weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
      keyObservation: latestWorkout.label,
      coachMessage: "วันนี้มีข้อมูลซ้อมแล้ว ระบบใช้คำแนะนำสำรองให้เน้นฟื้นตัว เติมน้ำ กินโปรตีนกับคาร์บพอประมาณ และนอนให้พอครับ",
    };
  }

  if (ctx?.activeSick) {
    const sickRisk = ctx.sickRiskLevel;
    return {
      todayReadiness: readiness,
      readinessLabel: label,
      readinessNote,
      workoutRec: sickRisk === "hard_stop" ? "วันนี้พักก่อน ร่างกายกำลังสู้กับอาการป่วย" : "วันนี้ลดความหนักไว้ก่อน",
      workoutTarget: sickRisk === "hard_stop" ? "พักเต็มวัน · ไม่ต้องออกกำลังกาย" : "เดินเบา ๆ หรือ mobility เบา · ฟังร่างกายเป็นหลัก",
      weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
      keyObservation: sickRisk === "hard_stop" ? "ร่างกายป่วย — งดซ้อม" : "มีอาการไม่สบาย",
      coachMessage: sickRisk === "hard_stop"
        ? "ร่างกายกำลังป่วยอยู่ วันนี้งดซ้อมหนักก่อนนะครับ เน้นพัก ดื่มน้ำ และนอนให้พอ"
        : "มีอาการไม่สบาย วันนี้ลดความหนักไว้ก่อน ถ้าจะขยับตัวให้เดินเบา ๆ หรือ mobility แทน",
    };
  }

  if (latestPain && !latestPain.hasResolvedPain && latestPain.painLevel >= 3) {
    return {
      todayReadiness: readiness,
      readinessLabel: label,
      readinessNote,
      workoutRec: latestPain.painLevel >= 5 ? "งดวิ่ง / พักและประเมินอาการ" : "Rest / Recovery",
      workoutTarget: "Recovery Day · ไม่ต้องจับ pace",
      weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
      keyObservation: `ล่าสุดเจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`,
      coachMessage: "ยังวิเคราะห์ไม่สำเร็จ ระบบจึงใช้คำแนะนำสำรองแบบ conservative ก่อน ให้พักจากแรงกระแทกและลองใหม่อีกครั้งครับ",
    };
  }

  // Low recovery or low sleep without active pain — guide toward safe options
  const recSys = ctx?.recoverySystem;
  const recoveryLow = (recSys?.axes?.recovery?.score ?? 100) < 45;
  const sleepLow = (recSys?.axes?.sleep?.score ?? 100) < 40;
  if (recoveryLow || sleepLow) {
    const reason = recoveryLow && sleepLow ? "ฟื้นตัวต่ำและนอนน้อย" : recoveryLow ? "ฟื้นตัวต่ำ" : "นอนน้อย";
    return {
      todayReadiness: readiness,
      readinessLabel: label,
      readinessNote,
      workoutRec: recoveryLow && sleepLow ? "Recovery / Walk + Mobility" : "Easy Recovery หรือเดินเบา ๆ",
      workoutTarget: "ไม่ต้องจับ pace · ฟังร่างกายเป็นหลัก",
      weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
      keyObservation: reason,
      coachMessage: "วันนี้ให้เน้นฟื้นตัวครับ ถ้าจะขยับตัวให้เลือก easy jog สั้น ๆ หรือเดินเบา ๆ แทนซ้อมหนัก",
    };
  }

  return {
    todayReadiness: readiness,
    readinessLabel: label,
    readinessNote,
    workoutRec: "วันนี้เน้นฟื้นตัวเบา ๆ",
    workoutTarget: "เน้นฟื้นตัว · เดินเบา ๆ ถ้าไม่เจ็บ",
    weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
    keyObservation: "ใช้คำแนะนำสำรองจากข้อมูลล่าสุด",
    coachMessage: "ยังวิเคราะห์ไม่สำเร็จ แต่จากข้อมูลล่าสุดให้เน้นอัปเดตข้อมูลวันนี้ก่อน แล้วลองใหม่อีกครั้งครับ",
  };
}

export default function TodayPage() {
  const isMounted = useRef(true);
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [goalProfile, setGoalProfile] = useState<UserGoalProfile | null>(null);
  const [insight, setInsight] = useState<DailyCoachInsight | null>(null);
  const [coachCtx, setCoachCtx] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightError, setInsightError] = useState(false);
  const [insightErrorMessage, setInsightErrorMessage] = useState("");
  const [hasHistory, setHasHistory] = useState(false);
  const [nextMealRec, setNextMealRec] = useState<NextMealRecommendation | null>(null);
  const [nextMealLoading, setNextMealLoading] = useState(false);


  const requestNextMeal = useCallback(async () => {
    if (!coachCtx) return;
    setNextMealLoading(true);
    try {
      const res = await fetch("/api/next-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: coachCtx }),
      });
      const json = await res.json() as { ok: boolean; recommendation: NextMealRecommendation };
      if (json.recommendation) setNextMealRec(json.recommendation);
    } catch {
      // silent — card stays in "request" state
    } finally {
      setNextMealLoading(false);
    }
  }, [coachCtx]);

  const generateInsight = useCallback(async (force = false) => {
    void force;
    let fallbackContext: CoachContext | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let didTimeout = false;
    const controller = new AbortController();

    if (isMounted.current) {
      setLoading(true);
      setInsightError(false);
      setInsightErrorMessage("");
    }

    try {
      const ctx = await buildCoachContextFromSupabase();
      fallbackContext = ctx;
      if (isMounted.current) {
        setCoachCtx(ctx);
        const hasSomeData = ctx.sleep7d.length > 0 || ctx.workouts7d.length > 0 || ctx.nutrition7d.length > 0 || ctx.latestBody != null || !!ctx.raceGoal;
        setHasHistory(hasSomeData);
        if (!hasSomeData) {
          setLoading(false);
          return;
        }

        // Immediately show a local fallback recommendation during loading
        const localFallback = buildClientTodayFallback(ctx);
        setInsight(localFallback);
      }

      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
      }, TODAY_INSIGHT_CLIENT_TIMEOUT_MS);

      try {
        const res = await fetch("/api/coach-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ctx),
          signal: controller.signal,
        });

        const json = await res.json() as TodayInsightResponse;
        if (isMounted.current) {
          if (!res.ok && !json.data) throw new Error(json.message ?? "api error");
          if (!json.data) throw new Error("no data");

          setInsight(json.data);
          if (json.ok === false || json.usedFallback) {
            setInsightError(true);
            setInsightErrorMessage(json.message ?? "ระบบยังประเมินด้วยโค้ชไม่สำเร็จ แต่ใช้ข้อมูลจาก Report เพื่อแนะนำเบื้องต้นให้ก่อน");
          }
        }
      } catch (innerError) {
        const isAbort =
          innerError instanceof DOMException
            ? innerError.name === "AbortError"
            : innerError instanceof Error && innerError.name === "AbortError";

        if (isAbort) {
          if (didTimeout) {
            if (process.env.NODE_ENV === "development") {
              console.warn(`[today-analysis-timeout]`, TODAY_INSIGHT_CLIENT_TIMEOUT_MS);
            }
          } else {
            if (process.env.NODE_ENV === "development") {
              console.warn("[today-analysis-aborted]");
            }
          }
        } else {
          if (process.env.NODE_ENV === "development") {
            console.warn("[today-analysis-fetch-error]", innerError);
          }
        }

        if (isMounted.current) {
          setInsightError(true);
          setInsightErrorMessage("ระบบยังประเมินด้วยโค้ชไม่สำเร็จ แต่ใช้ข้อมูลจาก Report เพื่อแนะนำเบื้องต้นให้ก่อน");
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.warn("[today-analysis-error]", error);
      if (isMounted.current) {
        const fallback = buildClientTodayFallback(fallbackContext);
        setInsight(fallback);
        setInsightError(true);
        setInsightErrorMessage("ระบบยังประเมินด้วยโค้ชไม่สำเร็จ แต่ใช้ข้อมูลจาก Report เพื่อแนะนำเบื้องต้นให้ก่อน");
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (isMounted.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadActiveRaceGoalAndPlan().then((result) => { if (result.ok) setGoal(result.goal); });
    loadGoalProfileFromSupabase().then((res) => { if (res.ok) setGoalProfile(res.goalProfile); });
    queueMicrotask(() => void generateInsight());
  }, [generateInsight]);

  useEffect(() => {
    const onDataUpdated = () => { setInsight(null); void generateInsight(true); };
    window.addEventListener("runmate:cloud-data-updated", onDataUpdated);
    return () => window.removeEventListener("runmate:cloud-data-updated", onDataUpdated);
  }, [generateInsight]);

  const hasPace = isMeaningfulWorkoutTarget(insight?.workoutTarget);
  // insight.todayReadiness is the single source of truth for both the chip and the
  // explanation panel so they never disagree. Label is recomputed from the score via
  // getRunMateReadinessLabel — never trust AI-returned label strings.
  const readinessScore = insight?.todayReadiness != null ? Math.round(insight.todayReadiness) : null;
  const readinessCoverage = buildReadinessCoverageSummary(coachCtx);
  const todayChecklist = buildTodayChecklist(coachCtx);
  const hasWorkoutToday = Boolean(coachCtx?.hasWorkoutToday);

  const heroDecision = insight && coachCtx && !hasWorkoutToday ? getDecisionCard(insight, coachCtx) : null;

  const dailyReadinessForSignals = coachCtx ? buildDailyReadiness(coachCtx) : null;

  // 1b. สัญญาณ 4 มิติ — merged into the Snapshot card so it reads as one surface
  const signalsSlot = coachCtx && !loading && dailyReadinessForSignals ? (
    <details className="group" data-testid="signals-details">
      <summary className="list-none cursor-pointer">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-rm-muted">สัญญาณวันนี้</span>
          <span className="shrink-0 text-[10px] font-semibold text-[var(--color-text-soft)]">
            <span className="group-open:hidden">ดูรายละเอียด ⌄</span>
            <span className="hidden group-open:inline">ซ่อน ⌄</span>
          </span>
        </div>
        <TodaySignalCircles signals={dailyReadinessForSignals.signals} />
      </summary>
      <div className="mt-1.5">
        <ReadinessSignalBars signals={dailyReadinessForSignals.signals} />
      </div>
    </details>
  ) : null;

  return (
    <AppShell title="โค้ชข้างทาง" subtitle={formatThaiDate()}>

      {/* 0. Daily Briefing — plain-language sentences, above the score breakdown.
          Hidden entirely (renders null) until there's enough history to say
          something real, so it never shows an empty/placeholder state. */}
      <DailyBriefingCard coachCtx={coachCtx} />

      {/* 1. Recovery overview first — ภาพรวมวันนี้ (สัญญาณวันนี้ now lives inside this same card) */}
      <TodaySnapshotCard
        insight={insight}
        readinessScore={readinessScore}
        todayChecklist={todayChecklist}
        loading={loading}
        hasHistory={hasHistory}
        isFallback={insightError}
        readinessCoverage={readinessCoverage}
        hasWorkoutToday={hasWorkoutToday}
        coachCtx={coachCtx}
        signalsSlot={signalsSlot}
      />

      {coachCtx && !loading && dailyReadinessForSignals?.sleepAdvice && (
        <p className="px-1 text-[11px] text-[var(--color-warning)] leading-snug">💡 {dailyReadinessForSignals.sleepAdvice}</p>
      )}

      {/* Hard-stop sick card — shown prominently above recommendation when active */}
      {coachCtx?.sickRiskLevel === "hard_stop" && <SickDayEntryCard coachCtx={coachCtx} />}

      {/* 2. วันนี้ควรทำอะไร — coach prescription. The one card on this page that should visually "float" above the rest. */}
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border bg-gradient-to-br from-[var(--surface)] to-[var(--surface-muted)]/30 shadow-sm transition-all duration-300",
          coachCtx?.sickRiskLevel === "hard_stop" ? "border-[var(--color-danger-border)]" : "border-[var(--color-border-soft)]",
        )}
      >
        <div className="flex">
          <div className={cn(
            "w-1.5 shrink-0",
            coachCtx?.sickRiskLevel === "hard_stop" ? "bg-[var(--color-danger)]" : "bg-gradient-to-b from-[var(--primary)] via-[var(--primary-strong)]/70 to-[var(--recovery-blue)]/50",
          )} />
          <div className="flex-1 px-4.5 pt-4 pb-4.5 space-y-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--label-color)]" data-testid="recommendation-section-title">
              {hasWorkoutToday
                ? (coachCtx?.todayWorkouts.some((w) => w.kind === "strength") ? "หลังเวทควรทำอะไรต่อ" : "หลังซ้อมควรทำอะไรต่อ")
                : coachCtx?.sickRiskLevel === "hard_stop"
                ? "ควรพักและฟื้นตัว"
                : "วันนี้ทำอะไรดี?"}
            </p>

            {loading && (
              <div className="flex items-center gap-3 py-2">
                <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--color-border-soft)] border-t-[var(--primary)]" />
                <p className="text-xs font-semibold text-[var(--color-text-muted)]">กำลังประเมินข้อมูลล่าสุด…</p>
              </div>
            )}

            {insightError && !loading && (
              <div className="space-y-2.5 rounded-2xl bg-[var(--color-warning-soft)] border border-[var(--color-warning-border)] px-4 py-3">
                <p className="text-xs font-bold text-[var(--foreground)]">{insight ? "ใช้คำแนะนำสำรองจากข้อมูลล่าสุด" : "ยังประเมินไม่สำเร็จ"}</p>
                <p className="text-xs leading-relaxed text-[var(--color-warning)] font-semibold">
                  {insightErrorMessage || "ประเมินไม่สำเร็จ ลองใหม่อีกครั้ง"}
                </p>
                <LoadingButton type="button" loading={loading} loadingText="กำลังวิเคราะห์..." onClick={() => void generateInsight(true)} className="rounded-full bg-[var(--surface)] border border-[var(--color-border-soft)] px-3 py-1.5 text-xs font-bold text-[var(--color-text-soft)] hover:bg-[var(--surface-muted)] transition">
                  วิเคราะห์ใหม่
                </LoadingButton>
          </div>
        )}

        {insight && (
          hasWorkoutToday && coachCtx?.todayPrimaryWorkout
            ? <PostWorkoutFocusContent insight={insight} context={coachCtx} />
            : <PreWorkoutFocusContent insight={insight} hasPace={hasPace} context={coachCtx} insightError={insightError} hasSleepToday={readinessCoverage.hasSleepToday} />
        )}

        {!insight && !loading && !insightError && !hasHistory && (
          <EmptyState
            className="p-0 py-1 items-start text-left"
            title="ยังไม่มีข้อมูลวันนี้"
            description="เริ่มจากเพิ่มข้อมูลการนอนหรือซ้อมล่าสุด เพื่อให้โค้ชประเมินได้แม่นขึ้น"
          />
        )}

        {!insight && !loading && !insightError && hasHistory && (
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="rm-body text-rm-muted">มีข้อมูลพร้อมแล้ว</p>
            <LoadingButton type="button" loading={loading} loadingText="กำลังวิเคราะห์..." onClick={() => void generateInsight(true)} className="shrink-0 rounded-full border border-rm-primary/40 bg-rm-primary-soft px-4 py-1.5 text-xs font-bold text-rm-primary-strong">
              วิเคราะห์
            </LoadingButton>
          </div>
        )}

        {!hasWorkoutToday && coachCtx?.sickRiskLevel === "hard_stop" ? (
          <Link href="/sick" data-testid="primary-cta" className="block w-full rounded-full bg-gradient-to-b from-rm-primary to-rm-primary-strong py-2.5 text-center text-sm font-bold text-rm-surface shadow-[0_8px_20px_rgba(79,138,120,0.15)]">
            อัปเดตอาการวันนี้
          </Link>
        ) : (
          <Link href="/upload" data-testid="primary-cta" className="block w-full rounded-full bg-gradient-to-b from-rm-primary to-rm-primary-strong py-2.5 text-center text-sm font-bold text-rm-surface shadow-[0_8px_20px_rgba(79,138,120,0.15)]">
            {hasWorkoutToday ? "อัปเดตข้อมูล" : "บันทึกกิจกรรม"}
          </Link>
        )}

          </div>
        </div>
      </section>

      {/* 3. Recovery Loop — collapsed by default to reduce clutter */}
      {coachCtx && (
        <DetailAccordion title="🌙 ฟื้นตัวคืนนี้" data-testid="recovery-loop-details">
          <RecoveryLoopCard coachCtx={coachCtx} />
        </DetailAccordion>
      )}

      {/* Quick Actions Dock — deliberately flat (no border/shadow) so it reads
          as an extension of the primary CTA above, not a competing card. */}
      <div className="px-0.5">
        <div className="flex gap-1 bg-[var(--surface-muted)]/30 border border-[var(--color-border-soft)]/40 rounded-2xl p-1 shadow-sm">
          {[
            { href: "/upload?type=sleep", icon: "🌙", label: "นอน" },
            { href: "/upload?type=meal", icon: "🍱", label: "อาหาร" },
            { href: `/upload?type=workout&subtype=${getRecommendedSubtype(insight, coachCtx)}`, icon: "🏃", label: "ซ้อม" },
            { href: "/pain", icon: "🩹", label: "เจ็บ" },
            { href: "/sick", icon: "🤒", label: "ป่วย" },
          ].map(({ href, icon, label }) => (
            <Link 
              key={href} 
              href={href} 
              className="group flex-1 flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 text-center transition-all duration-200 active:scale-[0.92] hover:bg-[var(--surface)]/80 hover:shadow-xs"
            >
              <span className="text-base leading-none transition-transform duration-200 group-hover:scale-110 select-none">{icon}</span>
              <span className="mt-1 text-[9px] font-bold leading-none text-[var(--color-text-soft)]">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Safety-critical: active pain always stays visible, never tucked behind a toggle */}
      {coachCtx?.latestPain && coachCtx.latestPain.hasActivePain && coachCtx.latestPain.painLevel > 0 && (
        <>
          <p className="mt-1 px-1 rm-eyebrow">Recovery / อาการ</p>
          <CompactPainCard pains={[coachCtx.latestPain, ...coachCtx.recentPainLogs.filter((pain) => pain.id !== coachCtx.latestPain?.id)]} />
        </>
      )}

      {/* Sick Day entry point — non-hard-stop variants stay here; hard-stop shown earlier */}
      {coachCtx && coachCtx.sickRiskLevel !== "hard_stop" && <SickDayEntryCard coachCtx={coachCtx} />}

      {insight && coachCtx && shouldShowTodayStrengthCard(insight, coachCtx) && (
        <TodayStrengthRoutineCard
          insight={insight}
          context={coachCtx}
          onSaved={() => void generateInsight(true)}
        />
      )}

      {/* Low-priority extras — goal strip + resolved-pain notice only; everything else
          people actually interact with daily (nutrition, next meal) stays visible above. */}
      {((goalProfile && dailyReadinessForSignals) ||
        (coachCtx?.latestPain && !(coachCtx.latestPain.hasActivePain && coachCtx.latestPain.painLevel > 0))) && (
        <DetailAccordion title="🎯 ดูเพิ่มเติมวันนี้" data-testid="today-more-details">
          <div className="space-y-3">
            {goalProfile && dailyReadinessForSignals && (
              <GoalAwareTodayStrip
                goalProfile={goalProfile}
                band={dailyReadinessForSignals.band}
                loadTarget={dailyReadinessForSignals.loadTarget}
                hasPain={coachCtx?.activePain ?? false}
              />
            )}

            {coachCtx?.latestPain && !(coachCtx.latestPain.hasActivePain && coachCtx.latestPain.painLevel > 0) && (
              <div className="flex items-center justify-between rounded-2xl border border-rm-border bg-rm-surface px-4 py-2.5 text-xs text-rm-text shadow-[0_6px_18px_rgba(72,82,72,0.035)]">
                <span className="font-semibold text-rm-text">🩹 อาการเจ็บ{coachCtx.latestPain.painLocation}ดีขึ้นแล้ว</span>
                <Link href="/pain" className="text-rm-primary-strong font-bold hover:underline">
                  อัปเดตอาการ →
                </Link>
              </div>
            )}
          </div>
        </DetailAccordion>
      )}

      {(() => {
        if (!coachCtx) return null;
        const fuelScore = coachCtx.recoverySystem?.axes?.fuel?.score ?? 65;
        const hasNutrition = coachCtx.nutritionToday || coachCtx.nutritionBalanceToday;

        // No nutrition data yet — NextMealCard stands alone, nothing to merge it with.
        if (!hasNutrition) {
          return (
            <NextMealCard
              recommendation={nextMealRec}
              loading={nextMealLoading}
              onRequest={() => void requestNextMeal()}
              compact
              fuelScore={coachCtx.recoverySystem?.axes?.fuel?.score}
            />
          );
        }

        // Nutrition data exists — merge "อาหารวันนี้" and "มื้อต่อไปกินอะไรดี?" into one
        // card since they're a continuous question (eaten so far → what's next), separated
        // by a dashed divider instead of two adjacent cards saying similar things.
        return (
          <DetailAccordion
            title={coachCtx.sickRiskLevel === "hard_stop" ? "มื้อถัดไปสำหรับวันที่ไม่สบาย" : "อาหารวันนี้"}
            data-testid="food-section-details"
          >
            <div className="mt-2 space-y-3.5">
              <details className="group cursor-pointer">
                <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--foreground)]">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--foreground)]">อาหารและพลังงานวันนี้</p>
                    <p className="text-[11px] text-[var(--color-text-soft)] font-medium mt-0.5">
                      {coachCtx.sickRiskLevel === "hard_stop"
                        ? "เน้นย่อยง่าย เติมน้ำ และไม่มัน"
                        : fuelScore >= 80 ? "พลังงานวันนี้โอเค (คาร์บ/โปรตีนเพียงพอ)" : `พลังงานวันนี้ ${Math.round(fuelScore)}/100 · ควรรองรับเพิ่มเติม`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-bold shrink-0">
                    <span className="group-open:hidden">ดูรายละเอียด</span>
                    <span className="hidden group-open:inline">ซ่อน</span>
                    <span className="transition-transform group-open:rotate-180">▾</span>
                  </div>
                </summary>
                <div className="mt-3.5 pt-3.5 border-t border-[var(--color-border-soft)] space-y-2.5 cursor-default">
                  {coachCtx.nutritionToday && (
                    <CompactNutritionCard nutrition={coachCtx.nutritionToday} profile={coachCtx.profile} />
                  )}
                  {coachCtx.nutritionBalanceToday && (
                    <NutritionBalanceCard balance={coachCtx.nutritionBalanceToday} />
                  )}
                </div>
              </details>

              <div className="border-t border-dashed border-[var(--color-border-soft)] pt-3.5">
                <NextMealCard
                  recommendation={nextMealRec}
                  loading={nextMealLoading}
                  onRequest={() => void requestNextMeal()}
                  compact
                  fuelScore={coachCtx.recoverySystem?.axes?.fuel?.score}
                  bare
                />
              </div>
            </div>
          </DetailAccordion>
        );
      })()}

      {/* Footer: race goal + re-analyze — two unrelated actions, kept visually
          distinct so the refresh button doesn't read as part of the race-goal
          link next to it. */}
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-rm-surface-soft px-3 py-2">
        {!goal ? (
          <Link href="/race-goal" className="text-xs font-medium text-rm-muted hover:text-rm-text">
            ยังไม่มี Race Goal · <span className="underline underline-offset-2">ตั้งเป้าหมาย</span>
          </Link>
        ) : <span />}
        {/* Hidden when the error banner's own retry button is showing above (same
            action) — otherwise two "refresh" buttons appear on screen at once
            during the fallback-with-error state. */}
        {insight && !(insightError && !loading) && (
          <LoadingButton
            type="button"
            loading={loading}
            loadingText="กำลังวิเคราะห์..."
            onClick={() => void generateInsight(true)}
            className="flex items-center gap-1.5 rounded-full bg-rm-surface px-3 py-1.5 text-xs font-bold text-rm-muted shadow-sm hover:bg-rm-border disabled:opacity-40"
          >
            <span aria-hidden="true">↻</span> รีเฟรชคำแนะนำ
          </LoadingButton>
        )}
      </div>

    </AppShell>
  );
}

// ─── Today Snapshot ────────────────────────────────────────────────────────────

function getDecisionCard(insight: DailyCoachInsight, context: CoachContext | null) {
  if (!context) return null;

  const todayReadiness = getTodayReadiness(context);
  const readinessScore = todayReadiness.score;

  const latestPain = context.latestPain;
  const hasActivePain = latestPain && latestPain.hasActivePain && latestPain.painLevel > 0;

  // Get planned workout
  const plannedWorkout = getTodayPlannedWorkout(context);
  const hasPlannedWorkout = plannedWorkout && plannedWorkout.workoutType && !/rest|พัก/i.test(plannedWorkout.workoutType);

  // Check if strength card is shown
  const showStrength = shouldShowTodayStrengthCard(insight, context);

  // 1. Active Pain Case
  if (hasActivePain && latestPain.painLevel >= 2) {
    return {
      title: "งดวิ่ง / พักหรือเวทกายภาพเบา ๆ",
      type: "pain",
      body: `มีประวัติเจ็บ${latestPain.painLocation}ล่าสุด ${latestPain.painLevel}/10 ระบบจึงแนะนำให้งดซ้อมวิ่งและเน้นฟื้นฟู/กายภาพหรือทำท่าความแข็งแรงทดแทนเพื่อความปลอดภัย`,
    };
  }

  // 2. Reduced/Adjusted due to Fair/Caution readiness or pain history
  const isFairOrCaution = readinessScore <= 65;
  const hasRecentPainHistory = context.recentPainHistory || (latestPain && latestPain.resolved);

  if (hasPlannedWorkout && (isFairOrCaution || hasRecentPainHistory)) {
    const originalPlanStr = `${plannedWorkout.workoutType}${plannedWorkout.distanceKm != null && plannedWorkout.distanceKm > 0 ? ` ${plannedWorkout.distanceKm} km` : ""}`;
    const adjustedPlanStr = insight.workoutRec || "ซ้อมเบา / พักฟื้น";
    const readinessLabel = getReadinessCategoryLabel(readinessScore);
    
    let bodyText = `แผน Race เดิมคือ ${originalPlanStr} แต่วันนี้ readiness ยัง ${readinessLabel}`;
    if (latestPain && (latestPain.resolved || latestPain.painLevel > 0)) {
      bodyText += ` และมีประวัติเจ็บ${latestPain.painLocation}${latestPain.painLevel > 0 ? `ล่าสุด` : `เพิ่งหาย`}`;
    }
    bodyText += ` ระบบเลยปรับเป็น ${adjustedPlanStr}`;
    if (showStrength) {
      bodyText += ` ถ้าขายังล้า ให้เลือก Recovery Strength แทน`;
    }

    return {
      title: "วันนี้เลือกอย่างใดอย่างหนึ่งก่อน",
      type: "caution",
      body: bodyText,
    };
  }

  // 3. Normal / Good / Excellent readiness
  if (hasPlannedWorkout) {
    const originalPlanStr = `${plannedWorkout.workoutType}${plannedWorkout.distanceKm != null && plannedWorkout.distanceKm > 0 ? ` ${plannedWorkout.distanceKm} km` : ""}`;
    let bodyText = `วันนี้ร่างกายพร้อมและไม่มีอาการเจ็บ แนะนำทำตามแผนหลัก ${originalPlanStr} เป็นหลัก`;
    if (showStrength) {
      bodyText += ` โดยทำเวทเสริมเป็นตัวเลือกเสริมได้หากยังมีแรงเหลือและไม่รู้สึกล้า`;
    }
    return {
      title: "แผนที่ปรับจากสภาพร่างกายวันนี้",
      type: "good",
      body: bodyText,
    };
  }

  return null;
}

function buildHeroCoachInsight(insight: DailyCoachInsight, context: CoachContext): string {
  if (context.activePain) return "เลี่ยงกดหนักก่อน";
  const rec = insight.workoutRec.toLowerCase();
  const load = context.recoverySystem?.axes?.load?.score ?? 0;
  const sleep = context.recoverySystem?.axes?.sleep?.score ?? 80;
  const score = context.readinessV2?.score ?? insight.todayReadiness;
  if (rec.includes("recovery") || rec.includes("ฟื้นตัว") || rec.includes("พัก") || rec.includes("rest")) {
    return "วันนี้เหมาะกับ Recovery";
  }
  if (score <= 50) return "วันนี้เน้นฟื้นตัวก่อน";
  if (load >= 75 || sleep < 45) return "ขยับได้ แต่ไม่ต้องกด pace";
  if (score >= 80) return "พร้อมขยับตามแผน";
  if (score >= 66) return "ขยับได้ ไม่ต้องจับ pace";
  return "เน้นฟื้นตัวมากกว่าทำเวลา";
}

function PreWorkoutFocusContent({
  insight,
  hasPace,
  context,
  insightError,
  hasSleepToday,
}: {
  insight: DailyCoachInsight;
  hasPace: boolean;
  context: CoachContext | null;
  insightError: boolean;
  hasSleepToday: boolean;
}) {
  const hasLatestSleep = context ? context.sleep7d.length > 0 : false;
  const hasSleepTodayLocal = context ? context.sleep7d.some((s) => s.date === context.todayDate) : hasSleepToday;
  const isUsingLatestSleepBecauseTodayMissing = !hasSleepTodayLocal && hasLatestSleep;

  const heroDecision = context ? getDecisionCard(insight, context) : null;

  const recommendationType = getRecommendedSubtype(insight, context);
  const isRest = context?.sickRiskLevel === "hard_stop" || 
                 (insight.workoutRec && (
                   insight.workoutRec.includes("พัก") || 
                   insight.workoutRec.toLowerCase().includes("rest")
                 ));

  const badgeInfo = (() => {
    if (context?.sickRiskLevel === "hard_stop") {
      return { icon: "🛑", eyebrow: "งดซ้อมเด็ดขาด", headline: "วันนี้ร่างกายป่วย ไม่ซ้อมวันนี้ เน้นพักผ่อนฟื้นตัวก่อน", tone: "danger" };
    }
    if (isRest) {
      return { icon: "🧘", eyebrow: "เน้นพักผ่อน", headline: insight.workoutRec || "ไม่มีเป้าซ้อมหนัก เน้นยืดเหยียดและฟื้นตัว", tone: "rest" };
    }
    if (recommendationType === "run") {
      return { icon: "🏃", eyebrow: "วิ่งซ้อม", headline: insight.workoutRec || "ตามระดับความเหนื่อยที่แนะนำ", tone: "run" };
    }
    if (recommendationType === "strength") {
      return { icon: "🏋️", eyebrow: "เวทเทรนนิ่ง", headline: insight.workoutRec || "เสริมสร้างกล้ามเนื้อและแกนกลาง", tone: "strength" };
    }
    if (recommendationType === "walk") {
      return { icon: "🚶", eyebrow: "เดิน/ขยับเบา ๆ", headline: insight.workoutRec || "Active Recovery ไม่ให้ร่างกายตึง", tone: "walk" };
    }
    return { icon: "✨", eyebrow: "เป้าหมายซ้อมวันนี้", headline: insight.workoutRec || "ฟื้นฟูร่างกายตามคำแนะนำ", tone: "other" };
  })();

  const isSickHardStop = context?.sickRiskLevel === "hard_stop";

  return (
    <div className="space-y-4">
      {/* Visual Action Ticket */}
      <div className={cn(
        "rounded-2xl p-4 flex items-center gap-3 border shadow-xs transition-all",
        badgeInfo.tone === "danger" ? "bg-red-50/60 border-red-100 text-red-900" :
        badgeInfo.tone === "rest" ? "bg-slate-50/60 border-slate-200 text-slate-900" :
        badgeInfo.tone === "run" ? "bg-emerald-50/60 border-emerald-100 text-emerald-900" :
        badgeInfo.tone === "strength" ? "bg-purple-50/60 border-purple-100 text-purple-900" :
        badgeInfo.tone === "walk" ? "bg-amber-50/60 border-amber-100 text-amber-900" :
        "bg-sky-50/60 border-sky-100 text-sky-900"
      )}>
        <span className="text-3xl shrink-0 select-none">{badgeInfo.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">{badgeInfo.eyebrow}</p>
          {isSickHardStop ? (
            <div data-testid="sick-rest-bullets">
              <h3 className="text-sm font-black tracking-tight mt-0.5 leading-snug text-red-700">{badgeInfo.headline}</h3>
            </div>
          ) : (
            <h3 className="text-sm font-black tracking-tight mt-0.5 leading-snug">
              {badgeInfo.headline}
            </h3>
          )}
          {hasPace && !isSickHardStop && !isRest && (
            <span className="inline-block mt-1.5 rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--primary-strong)]" data-testid="pace-target-pill">
              เป้าหมาย: {insight.workoutTarget}
            </span>
          )}
        </div>
      </div>

      {/* 3. Collapsed reasons — "ดูเหตุผล" / "ซ่อนเหตุผล" toggle via <details> */}
      <details className="group border-t border-[var(--color-border-soft)] pt-2.5" data-testid="hero-details">
        <summary className="list-none cursor-pointer mt-1 flex w-full items-center justify-between text-xs font-bold text-[var(--primary)] select-none">
          <span className="group-open:hidden">ดูเหตุผลประกอบ</span>
          <span className="hidden group-open:inline">ซ่อนเหตุผลประกอบ</span>
          <span className="transition-transform duration-200 group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-3 rounded-2xl bg-[var(--surface-muted)]/75 border border-[var(--color-border-soft)] px-4 py-3.5 space-y-3 cursor-default">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เหตุผลของคำแนะนำวันนี้</p>

          {/* Decision card */}
          {heroDecision && (
            <div className={`rounded-2xl border p-3.5 space-y-1.5 ${
              insightError ? "bg-[var(--color-warning-soft)] border-[var(--color-warning-border)] text-[var(--foreground)]" :
              heroDecision.type === "pain" ? "bg-[var(--color-danger-soft)] border-red-200 text-[var(--foreground)]" :
              heroDecision.type === "caution" ? "bg-[var(--color-warning-soft)] border-[var(--color-warning-border)] text-[var(--foreground)]" :
              "bg-[var(--primary-soft)] border-[var(--primary-soft)]/40 text-[var(--foreground)]"
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider">{heroDecision.title}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  insightError ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" :
                  heroDecision.type === "pain" ? "bg-[var(--color-danger-soft)] text-[var(--status-rest)]" :
                  heroDecision.type === "caution" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" :
                  "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                }`}>
                  {insightError ? "คำแนะนำสำรอง" : (heroDecision.type === "pain" ? "งดวิ่ง" : heroDecision.type === "caution" ? "ปรับลดโหลด" : "ตามแผน")}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-[var(--color-text-soft)]">{heroDecision.body}</p>
            </div>
          )}

          {/* Reason bullets */}
          <ul className="space-y-1.5">
            {buildTodayRecommendationReasons(context, insight, context?.readinessV2 ?? null, hasSleepToday).map((r, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-[var(--color-text-soft)] leading-relaxed">
                <span className="mt-1 shrink-0 h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
                <span>{r}</span>
              </li>
            ))}
          </ul>

          {/* Sleep fallback note */}
          {isUsingLatestSleepBecauseTodayMissing && (
            <div className="rounded-xl border border-[var(--color-info-border)] bg-[var(--recovery-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--recovery-blue)] font-bold">
              ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้
            </div>
          )}

          {/* Sick details copy */}
          {context?.sickRiskLevel === "hard_stop" && (
            <p className="text-xs text-[var(--color-text-soft)] leading-relaxed font-semibold">วันนี้ช่วยเป้าหมายด้วยการฟื้น ไม่ใช่การฝืน</p>
          )}
        </div>
      </details>
    </div>
  );
}

function PostWorkoutFocusContent({ insight, context }: { insight: DailyCoachInsight; context: CoachContext }) {
  const workout = context.todayPrimaryWorkout;
  const title = buildPostWorkoutTitle(workout, insight, context);
  const items = buildPostWorkoutChecklist(context, workout);
  const injuryNote = buildPostWorkoutInjuryNote(context);
  const matching = checkPlannedWorkoutMatching(context);

  const parts1: string[] = [];
  if (workout) {
    const distance = formatKm(workout.distanceKm);
    if (workout.kind === "run" && distance) parts1.push(`วิ่งแล้ว ${distance} กม.`);
    else parts1.push(`${workout.label}วันนี้แล้ว`);
    const avgHR = toFiniteNumber(workout.avgHR);
    if (avgHR != null) parts1.push(`Avg HR ${Math.round(avgHR)}`);
  }

  const parts2: string[] = [];
  if (context.recoverySystem) {
    parts2.push(`ฟื้นตัว ${formatAxisScore(context.recoverySystem.axes.recovery.score)} ${getRecoveryAxisLabel("recovery", context.recoverySystem.axes.recovery.score)}`);
    parts2.push(`โหลด ${formatAxisScore(context.recoverySystem.axes.load.score)} ${getRecoveryAxisLabel("load", context.recoverySystem.axes.load.score)}`);
  }
  const latestPain = context.latestPain;
  if (latestPain) {
    parts2.push(latestPain.hasResolvedPain
      ? `${latestPain.painLocation}หายแล้ว`
      : `เจ็บ${latestPain.painLocation}ล่าสุด ${latestPain.painLevel}/10`);
  }

  const protein = context.nutritionToday?.proteinG;
  const target = todayProteinTarget(context.profile);
  const isProteinNearTarget = protein != null && target > 0 && (protein / target >= 0.7);

  const hasSleepToday = context.sleep7d.some((s) => s.date === context.todayDate);
  const hasLatestSleep = context.sleep7d.length > 0;
  const isUsingLatestSleepBecauseTodayMissing = !hasSleepToday && hasLatestSleep;

  // Build a clear subtext: what was completed + don't train more
  const workoutCompletedText = (() => {
    if (!workout) return "ซ้อมวันนี้จบแล้ว";
    if (workout.kind === "race") return "วิ่งแข่งวันนี้จบแล้ว";
    if (workout.kind === "run") {
      const distance = formatKm(workout.distanceKm);
      return distance ? `วิ่งไปแล้ว ${distance} กม.` : "วิ่งวันนี้จบแล้ว";
    }
    if (workout.kind === "strength") return "เวทวันนี้จบแล้ว";
    return "ซ้อมวันนี้จบแล้ว";
  })();
  const reasonLine = `${workoutCompletedText} — ไม่ต้องซ้อมเพิ่ม เน้นฟื้นตัว เติมน้ำ/โปรตีน และนอนให้ดี`;

  return (
    <div className="space-y-4">
      {/* Visual Action Ticket */}
      <div className="rounded-2xl p-4 flex items-center gap-3 border border-emerald-100 bg-emerald-50/60 text-emerald-900 shadow-xs">
        <span className="text-3xl shrink-0 select-none">✅</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-black tracking-tight">{title}</h3>
          <p className="text-[11px] font-semibold text-[var(--color-text-soft)] mt-0.5 leading-snug">
            ไม่ต้องซ้อมเพิ่ม · เน้นการฟื้นฟูร่างกาย
          </p>
        </div>
      </div>

      {/* Coach sentence */}
      <div className="border-l-2 border-[var(--color-border-soft)] pl-3 py-0.5">
        <p className="text-xs font-semibold text-[var(--color-text-soft)] leading-relaxed">{reasonLine}</p>
      </div>

      {/* Informational note, not a safety caution — kept visually neutral so it
          doesn't compete with a real amber warning (e.g. active pain) shown
          in the Snapshot card just above. */}
      {matching.isUncertain && (
        <p className="rounded-xl bg-[var(--surface-muted)] border border-[var(--color-border-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
          💡 วันนี้มีบันทึกกิจกรรมแล้ว (อาจแตกต่างจากแผนที่ตั้งไว้) แนะนำเน้นฟื้นตัวและงดซ้อมหนักซ้ำ
        </p>
      )}
      {isUsingLatestSleepBecauseTodayMissing && (
        <div className="rounded-xl border border-[var(--color-info-border)] bg-[var(--recovery-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--recovery-blue)] font-bold">
          ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้
        </div>
      )}

      {/* 4. Detailed list collapsed behind details accordion */}
      <details className="mt-3 group border-t border-[var(--color-border-soft)] pt-2.5 cursor-pointer" data-testid="post-workout-details">
        <summary className="text-xs font-bold text-[var(--primary)] select-none list-none flex items-center justify-between">
          <span className="group-open:hidden">ดูสิ่งที่ควรทำต่อ</span>
          <span className="hidden group-open:inline">ซ่อนสิ่งที่ควรทำต่อ</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-3 cursor-default text-xs">
          {parts1.length > 0 && (
            <p className="text-xs font-semibold text-[var(--foreground)] leading-normal">
              {parts1.join(" · ")}
            </p>
          )}
          {parts2.length > 0 && (
            <p className="text-[11px] text-[var(--color-text-muted)] leading-normal">
              {parts2.join(" · ")}
            </p>
          )}

          <p className="text-xs leading-relaxed text-[var(--color-text-muted)] bg-[var(--surface-muted)] border border-[var(--border-warm)] rounded-2xl px-4 py-3">
            💡 บันทึกกิจกรรมวันนี้แล้ว ไม่จำเป็นต้องซ้อมหนักซ้ำอีก เน้นการจิบน้ำ เติมโปรตีน ขยับเบา ๆ และนอนหลับให้เพียงพอเพื่อฟื้นฟูกล้ามเนื้อ
          </p>

          {context.recoverySystem?.guardrails && context.recoverySystem.guardrails.filter(g => !g.includes("บันทึกกิจกรรม") && !g.includes("สภาพร่างกายพร้อม")).length > 0 && (
            <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs leading-relaxed text-[var(--color-warning)] border border-amber-100 flex items-start gap-2">
              <span className="text-sm">⚠️</span>
              <div>
                <p className="font-bold">ข้อควรระวังฟื้นตัววันนี้</p>
                <ul className="list-disc pl-4 mt-1 font-semibold space-y-0.5">
                  {context.recoverySystem.guardrails
                    .filter(g => !g.includes("บันทึกกิจกรรม") && !g.includes("สภาพร่างกายพร้อม"))
                    .map((g, idx) => (
                      <li key={idx}>{g}</li>
                    ))
                  }
                </ul>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-xs leading-relaxed text-[var(--color-success)] border border-emerald-100 flex items-start gap-2">
            <span className="text-sm">🍳</span>
            <div>
              <p className="font-bold">โภชนาการฟื้นฟูหลังซ้อม</p>
              <p className="mt-0.5">
                {isProteinNearTarget
                  ? "โปรตีนใกล้ถึงเป้าแล้ว เติมคาร์บ/น้ำให้พอ"
                  : "เติมโปรตีนอีกนิด พร้อมคาร์บเพื่อฟื้นตัว"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[var(--primary-soft)] px-4 py-3 text-xs font-medium leading-relaxed text-[var(--foreground)]">
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {injuryNote && (
              <p className="mt-3 border-t border-[var(--color-success-border)] pt-2 text-[11px] font-semibold leading-5 text-[var(--color-success)]">
                {injuryNote}
              </p>
            )}
          </div>
        </div>
      </details>
    </div>
  );
}

function buildPostWorkoutTitle(workout: TodayCompletedWorkoutSummary | null, insight: DailyCoachInsight, context?: CoachContext | null): string {
  if (!workout) return insight.workoutRec || "วันนี้ซ้อมพอแล้ว";
  if (workout.kind === "race") return "วันนี้แข่งจบแล้ว";
  // All completed workout types get the same clear "done for the day" headline
  if (context && context.todayWorkouts.length > 1) return "วันนี้ซ้อมพอแล้ว";
  return "วันนี้ซ้อมพอแล้ว";
}


function buildPostWorkoutChecklist(context: CoachContext, workout: TodayCompletedWorkoutSummary | null): string[] {
  const items = [
    buildHydrationRecoveryItem(workout),
    buildNutritionRecoveryItem(context),
    "ยืด/foam roll เบา ๆ 10–15 นาที ไม่กดจุดที่เจ็บแรง",
    buildSleepRecoveryItem(context),
  ];
  return items.filter((item): item is string => Boolean(item));
}

function buildHydrationRecoveryItem(workout: TodayCompletedWorkoutSummary | null): string {
  const distance = toFiniteNumber(workout?.distanceKm) ?? 0;
  const calories = toFiniteNumber(workout?.calories) ?? 0;
  if (workout?.kind === "race" || distance >= 8 || calories >= 500) return "ดื่มน้ำเพิ่ม 600–900 ml แบ่งจิบ ไม่ต้องรีบอัดทีเดียว";
  if (distance >= 5 || calories >= 250) return "ดื่มน้ำเพิ่ม 500–700 ml และสังเกตสีปัสสาวะ";
  return "ดื่มน้ำเพิ่ม 400–600 ml ให้ร่างกายค่อย ๆ กลับมาสมดุล";
}

function buildNutritionRecoveryItem(context: CoachContext): string {
  const protein = context.nutritionToday?.proteinG;
  const target = todayProteinTarget(context.profile);
  if (protein != null && target > 0) {
    const remaining = Math.max(0, Math.round(target - protein));
    if (remaining >= 15) return `เติมโปรตีนอีกประมาณ ${remaining} g ในมื้อต่อไป`;
    return "โปรตีนวันนี้ใกล้ถึงเป้าแล้ว เติมคาร์บพอประมาณเพื่อฟื้นตัว";
  }
  if (protein != null) return `โปรตีนวันนี้ประมาณ ${Math.round(protein)} g เติมคาร์บพอประมาณ`;
  return "ถ้ายังไม่ได้กินหลังซ้อม ให้เน้นโปรตีน 25–35 g + คาร์บย่อยง่าย";
}

function buildSleepRecoveryItem(context: CoachContext): string {
  if (context.avgReadiness != null && context.avgReadiness < 55) return "คืนนี้นอนให้เร็วที่สุด ลดจอ 20–30 นาทีก่อนนอน";
  return "คืนนี้เน้นนอน 7–8 ชม. เพื่อให้ขาซ่อมตัว";
}

function buildPostWorkoutInjuryNote(context: CoachContext): string {
  const latest = context.latestPain;
  if (!latest) return "";
  const recentMax = context.recentMaxPain;
  const hasRecentHigher = recentMax && recentMax.painLevel > latest.painLevel;
  if (latest.hasResolvedPain) {
    if (hasRecentHigher) {
      return `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว แต่ช่วงล่าสุดเคยมีอาการถึง ${recentMax.painLevel}/10 วันนี้ค่อย ๆ เพิ่มโหลดและหลีกเลี่ยงซ้อมหนัก`;
    }
    return `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว วันนี้ค่อย ๆ กลับเข้าโหลดเบา ๆ และหยุดถ้าอาการกลับมา`;
  }
  if (latest.painLevel >= 3) {
    return `ล่าสุดเจ็บ${latest.painLocation} ${latest.painLevel}/10 วันนี้งดซ้อมเพิ่ม เน้นพักและประคบเย็นถ้ายังระบม`;
  }
  if (hasRecentHigher) {
    return `ล่าสุดเจ็บ${latest.painLocation} ${latest.painLevel}/10 แต่เคยขึ้นถึง ${recentMax.painLevel}/10 ช่วงล่าสุด วันนี้ยังลดโหลดไว้ก่อน`;
  }
  return `ล่าสุดเจ็บ${latest.painLocation} ${latest.painLevel}/10 ถ้าเดินแล้วไม่เจ็บเพิ่ม ค่อยทำ mobility เบา ๆ ได้`;
}

function TodayStrengthRoutineCard({
  insight,
  context,
  onSaved,
}: {
  insight: DailyCoachInsight;
  context: CoachContext;
  onSaved: () => void;
}) {
  const [routines, setRoutines] = useState<StrengthRoutine[]>([]);
  const [loading, setLoading] = useState(true);
  const [prescription, setPrescription] = useState<AIPrescription | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    let active = true;
    loadRoutinesFromSupabase()
      .then((data) => {
        if (active) setRoutines(data);
      })
      .catch((err) => {
        if (process.env.NODE_ENV === "development") console.warn("[today-strength-debug] load routines failed", err);
        if (active) setError("โหลดรูทีนเวทไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const alreadyCompleted = saved || context.todayWorkouts.some((workout) => workout.kind === "strength");
  const safety = buildTodayStrengthSafety(context);
  const selected = selectTodayStrengthRoutine(routines, insight, context);
  const reason = selected ? buildTodayStrengthReason(selected, insight, context) : "";
  const durationMin = prescription?.estimatedDurationMin ?? (selected ? estimateRoutineDuration(selected) : null);
  const exercises = prescription?.exercises ?? selected?.exercises ?? [];

  if (alreadyCompleted) {
    const loggedWorkout = context.todayWorkouts.find((workout) => workout.kind === "strength");
    const loggedDuration = loggedWorkout?.durationMin ? `${safeStrengthMins(loggedWorkout.durationMin)} นาที` : durationMin ? `${durationMin} นาที` : "";
    const loggedLabel = loggedWorkout?.label ?? prescription?.routineName ?? selected?.name ?? "เวท";
    const loggedHR = loggedWorkout?.avgHR ? `Avg HR ${Math.round(loggedWorkout.avgHR)} bpm` : "";
    const loggedCalories = loggedWorkout?.calories ? `${loggedWorkout.calories} kcal` : "";

    const summaryParts = [loggedDuration, loggedLabel, "เวท", loggedHR, loggedCalories].filter(Boolean);

    return (
      <section className="card space-y-3 p-5 border-l-4 border-[var(--color-success)] bg-[var(--color-success-soft)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[var(--color-success-soft)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--status-ready)]">✓ วันนี้บันทึกเวทแล้ว</span>
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-[var(--foreground)]">
            {prescription?.routineName ?? selected?.name ?? "Recovery Strength"} เสร็จแล้ว
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-muted)]">
            ต่อจากนี้เน้นฟื้นตัว เดินเบา ๆ ยืดเบา ๆ และนอนให้พอ
          </p>
        </div>

        {summaryParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {summaryParts.map((part) => (
              <span key={part} className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-success)]">
                {part}
              </span>
            ))}
          </div>
        )}

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs font-semibold text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)] flex items-center gap-1"
          >
            <span>{showDetails ? "ซ่อนรายละเอียด" : "ดูรายละเอียดที่ทำ"}</span>
            <span className={`transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}>▾</span>
          </button>

          {showDetails && exercises.length > 0 && (
            <div className="mt-2 rounded-2xl bg-[var(--surface-muted)] p-3 space-y-1.5 border border-[var(--border-warm)]">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-soft)]">รายการท่าที่ทำ</p>
              <div className="space-y-1.5">
                {exercises.map((exercise) => (
                  <div key={`${exercise.name}-${exercise.sets}-${exercise.reps}`} className="flex justify-between gap-3 text-xs">
                    <span className="font-semibold text-[var(--foreground)]">{exercise.name}</span>
                    <span className="shrink-0 text-[var(--color-text-muted)]">{formatStrengthExerciseLine(exercise)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pt-2">
          <Link href="/logs" className="btn-secondary block w-full py-2.5 text-center text-xs font-bold">
            ดูใน Report
          </Link>
        </div>
      </section>
    );
  }

  const todayReadiness = getTodayReadiness(context);
  const readinessScore = todayReadiness.score;
  const isFairOrCaution = readinessScore <= 65;
  const latestPain = context.latestPain;
  const hasActivePain = latestPain && latestPain.hasActivePain && latestPain.painLevel > 0;
  const hasRecentPainHistory = context.recentPainHistory || (latestPain && latestPain.resolved);

  let strengthBadge = "";
  let strengthHelperCopy = "";
  let badgeColorClass = "";

  if (hasActivePain) {
    strengthBadge = "เน้นฟื้นตัว";
    strengthHelperCopy = "เลือกเฉพาะท่าที่ไม่กระตุ้นอาการเจ็บ และหยุดถ้าอาการกลับมา";
    badgeColorClass = "bg-[var(--color-danger-soft)] text-[var(--status-rest)] border-red-200";
  } else if (isFairOrCaution || hasRecentPainHistory) {
    strengthBadge = "ทางเลือกแทนวิ่งวันนี้";
    strengthHelperCopy = "ถ้าขายังล้าหรือไม่อยากวิ่ง ให้ทำชุดนี้แทนได้ ไม่จำเป็นต้องทำทั้งวิ่งและเวทในวันเดียวกัน";
    badgeColorClass = "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border-[var(--color-warning-border)]";
  } else {
    strengthBadge = "เสริมได้ถ้ายังไม่ล้า";
    strengthHelperCopy = "ทำเสริมหลังวิ่งได้ถ้ายังสด แต่ไม่จำเป็นถ้ารู้สึกล้า";
    badgeColorClass = "bg-[var(--color-success-soft)] text-[var(--status-ready)] border-[var(--color-success-border)]";
  }

  async function adjustForToday() {
    if (!selected || safety.blockWorkout) return;
    setAdjusting(true);
    setError("");
    try {
      const response = await fetch("/api/analyze-strength", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routine: selected, context }),
      });
      if (!response.ok) throw new Error("api error");
      const payload = await response.json() as { ok?: boolean; data?: AIPrescription };
      if (!payload.data) throw new Error("missing prescription");
      setPrescription(payload.data);
    } catch (err) {
      if (process.env.NODE_ENV === "development") console.warn("[today-strength-debug] ai adjust failed", err);
      setError("ปรับรูทีนไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setAdjusting(false);
    }
  }

  async function saveDone() {
    if (!selected || alreadyCompleted || safety.blockWorkout) return;
    setSaving(true);
    setError("");
    const source = prescription ? "ai_prescription" : "saved_routine";
    const result = await logCompletedStrength({
      type: "strength",
      routineId: selected.id,
      routineName: prescription?.routineName ?? selected.name,
      source,
      intensity: prescription?.intensity ?? (selected.id === "fullbody" ? "moderate" : "easy"),
      durationMin: durationMin ?? estimateRoutineDuration(selected),
      exercises,
      notes: selected.notes,
      coachReason: prescription?.reason ?? reason,
      createdAt: new Date().toISOString(),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error ?? "บันทึกเวทไม่สำเร็จ");
      return;
    }
    setSaved(true);
    onSaved();
  }

  if (loading) {
    return (
      <section className="card p-4 text-sm text-[var(--color-text-muted)]">
        กำลังโหลดรูทีนเวทวันนี้...
      </section>
    );
  }

  if (!selected) return null;

  return (
    <section className="card space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--label-color)]">เวทวันนี้</p>
            {strengthBadge && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeColorClass}`}>
                {strengthBadge}
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-[var(--foreground)]">
            {prescription?.recommendedTitle ?? selected.name}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{prescription?.reason ?? reason}</p>
        </div>
        {durationMin ? (
          <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--color-success)]">
            {durationMin} นาที
          </span>
        ) : null}
      </div>

      {/* Show only the most important note: blocking safety note takes priority, else helper copy */}
      {safety.blockWorkout && safety.note ? (
        <p className="rounded-2xl bg-[var(--color-warning-soft)] px-3 py-2 text-xs leading-5 text-[var(--color-warning)]">
          {safety.note}
        </p>
      ) : strengthHelperCopy ? (
        <p className="rounded-2xl border border-[var(--border-warm)] bg-[var(--surface-muted)] px-3 py-2.5 text-xs leading-relaxed text-[var(--color-text-muted)]">
          💡 {strengthHelperCopy}
        </p>
      ) : null}

      {!safety.blockWorkout && exercises.length > 0 ? (
        <div className="border-t border-[var(--border-warm)]/60 pt-1">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 text-xs font-semibold text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)] py-1"
          >
            <span>{showDetails ? "ซ่อนท่า" : "ดูท่า"}</span>
            <span className={`transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}>▾</span>
          </button>
          {showDetails && (
            <div className="mt-1.5 space-y-2">
              <div className="rounded-2xl bg-[var(--surface-muted)]/80 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-soft)]">ตัวอย่างท่า</p>
                <div className="mt-2 space-y-1.5">
                  {exercises.slice(0, 3).map((exercise) => (
                    <div key={`${exercise.name}-${exercise.sets}-${exercise.reps}`} className="flex justify-between gap-3 text-xs">
                      <span className="font-semibold text-[var(--foreground)]">{exercise.name}</span>
                      <span className="shrink-0 text-[var(--color-text-muted)]">{formatStrengthExerciseLine(exercise)}</span>
                    </div>
                  ))}
                  {exercises.length > 3 ? <p className="text-xs text-[var(--color-text-soft)]">+ อีก {exercises.length - 3} ท่า</p> : null}
                </div>
              </div>
              {safety.note && (
                <p className="rounded-2xl bg-[var(--surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
                  {safety.note}
                </p>
              )}
            </div>
          )}
        </div>
      ) : null}

      {alreadyCompleted ? (
        <p className="rounded-2xl bg-[var(--color-success-soft)] px-3 py-2 text-xs font-bold text-[var(--color-success)]">
          วันนี้บันทึกเวทแล้ว
        </p>
      ) : null}
      {error ? <p className="rounded-2xl bg-[var(--color-danger-soft)] px-3 py-2 text-xs font-semibold text-[var(--color-danger)]">{error}</p> : null}

      {!alreadyCompleted && !safety.blockWorkout ? (
        <div className="space-y-2">
          <LoadingButton
            type="button"
            loading={saving}
            loadingText="กำลังบันทึก..."
            onClick={() => void saveDone()}
            className="btn-primary w-full py-2.5 text-xs font-bold"
          >
            บันทึกว่าเสร็จแล้ว
          </LoadingButton>
          <LoadingButton
            type="button"
            loading={adjusting}
            loadingText="กำลังปรับ..."
            onClick={() => void adjustForToday()}
            className="w-full rounded-full border border-[var(--border-warm)] bg-[var(--surface)]/80 py-2 text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--surface-muted)]"
          >
            ปรับเป็นเวอร์ชันวันนี้
          </LoadingButton>
        </div>
      ) : null}
    </section>
  );
}

function shouldShowTodayStrengthCard(insight: DailyCoachInsight, context: CoachContext): boolean {
  const completedStrengthToday = context.todayWorkouts.some((workout) => workout.kind === "strength");
  if (completedStrengthToday) return true;
  if (context.todayWorkouts.some((workout) => workout.kind !== "strength")) return false;
  return containsStrengthSignal(strengthSignalText(insight));
}

function selectTodayStrengthRoutine(routines: StrengthRoutine[], insight: DailyCoachInsight, context: CoachContext): StrengthRoutine | null {
  if (!routines.length) return null;
  const text = strengthSignalText(insight);
  const latestPain = context.latestPain;
  const painRisk = latestPain && latestPain.hasActivePain && (latestPain.painLevel >= 3 || latestPain.riskLevel === "medium" || latestPain.riskLevel === "high");

  if (painRisk || /recovery|active recovery|mobility|easy|walk|rest|พัก|ฟื้น|เดิน|ยืด|เบา/i.test(text)) {
    return findRoutine(routines, "recovery") ?? routines[0];
  }
  if (/core|abs|แกนกลาง|หน้าท้อง/i.test(text)) {
    return findRoutine(routines, "core") ?? findRoutine(routines, "recovery") ?? routines[0];
  }
  if (/strength|gym|full body|bodyweight|เวท|แรงต้าน/i.test(text)) {
    return findRoutine(routines, "fullbody") ?? findRoutine(routines, "recovery") ?? routines[0];
  }
  return findRoutine(routines, "recovery") ?? routines[0];
}

function buildTodayStrengthReason(routine: StrengthRoutine, insight: DailyCoachInsight, context: CoachContext): string {
  const latestPain = context.latestPain;
  if (latestPain && latestPain.hasActivePain && latestPain.painLevel >= 3) {
    return `เลือก ${routine.name} แบบลดโหลด เพราะล่าสุดเจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`;
  }
  if (routine.id === "recovery") return "เหมาะกับวัน recovery / easy หรือวันที่ร่างกายยังล้า";
  if (routine.id === "core") return "เสริมแกนกลางแบบไม่รบกวนขามาก";
  if (routine.id === "fullbody") return "เหมาะกับวันที่ร่างกายพร้อมและไม่มีอาการเจ็บเด่น";
  return insight.keyObservation || "ใช้เป็นรูทีนเวทสั้น ๆ สำหรับวันนี้";
}

function buildTodayStrengthSafety(context: CoachContext): { blockWorkout: boolean; note: string } {
  const latest = context.latestPain;
  if (!latest) return { blockWorkout: false, note: "" };
  if (latest.hasResolvedPain) {
    return {
      blockWorkout: false,
      note: `ล่าสุดบันทึกว่าอาการเจ็บ${latest.painLocation}หายแล้ว ถ้าทำเบา ๆ ได้ ให้เพิ่มโหลดอย่างค่อยเป็นค่อยไปและหยุดถ้าอาการกลับมา`,
    };
  }
  const cannotBearWeight = /no|cannot|can't|ไม่ได้|ไม่ไหว|ลงน้ำหนักไม่ได้/i.test(latest.canBearWeight);
  const hasRedFlag = latest.redFlags.length > 0 || cannotBearWeight;
  if (latest.painLevel >= 7 || latest.riskLevel === "high" || hasRedFlag) {
    return {
      blockWorkout: true,
      note: "วันนี้ยังไม่ควรเวทหนัก ถ้ามีอาการผิดปกติควรพักและประเมินอาการก่อน",
    };
  }
  if (latest.painLevel >= 3) {
    return {
      blockWorkout: false,
      note: "วันนี้ให้ทำแบบเบาและหยุดทันทีถ้าเจ็บเพิ่ม หลีกเลี่ยงท่าที่ลงน้ำหนักจุดเจ็บเยอะ",
    };
  }
  return {
    blockWorkout: false,
    note: `ล่าสุดเจ็บ${latest.painLocation} ${latest.painLevel}/10 ทำได้เฉพาะช่วงที่ไม่เจ็บเพิ่ม`,
  };
}

function strengthSignalText(insight: DailyCoachInsight): string {
  return [
    insight.workoutRec,
    insight.workoutTarget,
  ].filter(Boolean).join(" ").toLowerCase();
}

function containsStrengthSignal(text: string): boolean {
  return /เวท|strength|gym|core|abs|bodyweight|แรงต้าน|mobility|active recovery|cross training|recovery strength|ฟื้น|ยืด|เดินเบา/.test(text);
}

function findRoutine(routines: StrengthRoutine[], id: "recovery" | "core" | "fullbody") {
  return routines.find((routine) => routine.id === id) ?? null;
}

function estimateRoutineDuration(routine: StrengthRoutine): number {
  return routine.warmupMin + routine.cooldownMin + 15;
}

function formatStrengthExerciseLine(exercise: StrengthExercise): string {
  if (exercise.durationSec) return `${exercise.sets} x ${exercise.durationSec} วิ`;
  return `${exercise.sets} x ${exercise.reps}`;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const match = value.trim().replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKm(value: unknown): string | null {
  const number = toFiniteNumber(value);
  if (number == null) return null;
  return number.toFixed(2).replace(/\.?0+$/, "");
}

type TodayChecklistItem = { label: string; href: string; done: boolean };

function buildTodayChecklist(ctx: CoachContext | null): TodayChecklistItem[] {
  const today = ctx?.todayDate || bangkokDateKey();
  // Pain counts if there's a log today OR if latestPain (within 7d) is already used in Today context
  const painDone = Boolean(
    ctx?.recentPainLogs?.some((i) => i.date === today) ||
    ctx?.latestPain != null,
  );
  return [
    { label: "บันทึกการนอน", href: "/upload?type=sleep", done: Boolean(ctx?.sleep7d.some((i) => i.date === today)) },
    { label: "บันทึกอาหาร", href: "/upload?type=meal", done: Boolean(ctx?.nutritionToday && ctx.nutritionToday.mealCount > 0) },
    { label: "บันทึกกิจกรรม", href: "/upload?type=workout", done: Boolean(ctx?.workouts7d.some((i) => i.date === today)) },
    { label: "เช็กอาการเจ็บ", href: "/pain", done: painDone },
  ];
}

function buildReadinessCoverageSummary(ctx: CoachContext | null): { used: string[]; missing: string[]; hasSleepToday: boolean } {
  const used: string[] = [];
  const missing: string[] = [];
  if (!ctx) return { used, missing, hasSleepToday: false };
  const today = ctx.todayDate;

  // Sleep — distinguish today vs latest fallback
  let hasSleepToday = false;
  if (ctx.sleep7d.some((s) => s.date === today)) {
    used.push("การนอนวันนี้");
    hasSleepToday = true;
  } else if (ctx.sleep7d.length > 0) {
    used.push("ใช้การนอนล่าสุด");
    missing.push("บันทึกการนอน"); // both used (fallback) and missing (today not yet uploaded)
  } else {
    missing.push("บันทึกการนอน");
  }

  // Nutrition
  if (ctx.mealsToday.length > 0) {
    used.push(`อาหาร ${ctx.mealsToday.length} มื้อ`);
  } else {
    missing.push("อาหารวันนี้");
  }

  // Training load
  if (ctx.hasWorkoutToday && ctx.todayPrimaryWorkout) {
    const w = ctx.todayPrimaryWorkout;
    if (w.kind === "run") used.push(`วิ่ง${w.distanceKm ? ` ${Math.round(w.distanceKm * 10) / 10} กม.` : "วันนี้"}`);
    else if (w.kind === "strength") used.push("เวทวันนี้");
    else if (w.kind === "race") used.push("แข่งวันนี้");
    else used.push("ออกกำลังกายวันนี้");
  } else if (ctx.workouts7d.length > 0) {
    used.push(`โหลดสัปดาห์ ${Math.round(ctx.totalRunKm * 10) / 10} กม.`);
  } else {
    missing.push("กิจกรรมวันนี้");
  }

  // Pain
  if (ctx.latestPain) {
    used.push(ctx.latestPain.hasResolvedPain ? "เจ็บหายแล้ว" : `ยังเจ็บอยู่ ${ctx.latestPain.painLevel}/10`);
  }

  return { used, missing, hasSleepToday };
}

function getAxisBadgeClass(axisKey: "recovery" | "load" | "sleep" | "fuel", score: number): string {
  const tone = getAxisTone(axisKey, score);
  if (tone === "success") return "bg-[var(--color-success-soft)] text-[var(--status-ready)] border border-[var(--color-success-border)]";
  if (tone === "warning") return "bg-[var(--color-warning-soft)] text-[var(--color-warning)] border border-[var(--color-warning-border)]";
  if (tone === "danger") return "bg-[var(--color-danger-soft)] text-[var(--status-rest)] border border-[var(--color-danger-border)]";
  if (tone === "info") return "bg-[var(--recovery-soft)] text-[var(--recovery-blue)] border border-[var(--color-info-border)]";
  return "bg-[var(--surface-muted)] text-[var(--color-text-muted)] border border-[var(--border-warm)]";
}

function RecoveryLoopCard({ coachCtx }: { coachCtx: CoachContext }) {
  const [showDetail, setShowDetail] = useState(false);
  const loop = coachCtx.recoveryLoop;
  if (!loop) return null;

  const { dayLoad, sleepNeed, tomorrowPreview } = loop;

  const previewIcon: Record<string, string> = {
    ready: "✅",
    easy: "🟡",
    recovery: "🩹",
    watch: "⚠️",
  };
  const icon = previewIcon[tomorrowPreview.state] ?? "💤";

  // Day load context line using human coaching copy
  const activitySuffix = dayLoad.primaryActivity?.distanceKm != null
    ? ` · วิ่ง ${Math.round(dayLoad.primaryActivity.distanceKm * 10) / 10} กม.`
    : dayLoad.primaryActivity?.durationMin != null && dayLoad.primaryActivity.type === "strength"
    ? ` · เวท ${safeStrengthMins(dayLoad.primaryActivity.durationMin)} นาที`
    : "";
  const dayLoadContextLine = `${dayLoad.summary}${activitySuffix}`;

  return (
    <section className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface-muted)]/80 px-3 py-2.5 space-y-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)]" data-testid="recovery-loop-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--label-color)]">คืนนี้ควรฟื้นตัวยังไง</p>

      {/* 2-column strip: sleep | tomorrow */}
      <div className="grid grid-cols-2 gap-x-3 divide-x divide-[var(--color-border-soft)]/80">
        <div className="pr-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-rm-muted mb-1">คืนนี้</p>
          <div className="flex items-center gap-1 text-xs">
            <span className="leading-none">🌙</span>
            <span className="font-bold text-[var(--foreground)] leading-snug">{sleepNeed.label}</span>
          </div>
        </div>
        <div className="pl-3">
          <p className="text-[9px] font-bold uppercase tracking-wide text-rm-muted mb-1">ถัดไป</p>
          <div className="flex items-start gap-1 text-xs">
            <span className="leading-none shrink-0">{icon}</span>
            <span className="font-bold text-[var(--foreground)] leading-snug">{tomorrowPreview.headline}</span>
          </div>
        </div>
      </div>

      {/* Day load context — full width, below sleep so Y ordering is preserved */}
      <p className="text-[11px] text-rm-muted leading-snug" data-testid="day-load-context">{dayLoadContextLine}</p>

      {/* Expandable detail */}
      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-soft)] transition-colors hover:text-[var(--foreground)] py-0.5"
      >
        <span>{showDetail ? "ซ่อนเหตุผล" : "ดูเหตุผล"}</span>
        <span className={`transition-transform duration-200 ${showDetail ? "rotate-180" : ""}`}>⌄</span>
      </button>
      {showDetail && (
        <div className="rounded-2xl bg-[var(--surface-muted)]/80 px-3 py-2.5 space-y-2">
          {/* Day load activity reasons */}
          {dayLoad.reasons.length > 0 ? (
            <ul className="space-y-0.5">
              {dayLoad.reasons.map((r, i) => (
                <li key={i} className="text-[11px] text-[var(--color-text-muted)] leading-5">· {r}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-[var(--color-text-muted)] leading-5">· {dayLoad.summary}</p>
          )}
          {/* Sleep need reasons */}
          {sleepNeed.reasons.length > 0 && (
            <div className="pt-1 border-t border-[var(--border-warm)]/60 space-y-0.5">
              {sleepNeed.reasons.map((r, i) => (
                <p key={i} className="text-[11px] text-[var(--color-text-muted)] leading-5">· {r}</p>
              ))}
            </div>
          )}
          {/* Tomorrow conditions */}
          {tomorrowPreview.conditions.length > 0 && (
            <div className="pt-1 border-t border-[var(--border-warm)]/60 space-y-1">
              {tomorrowPreview.conditions.map((c, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--color-text-muted)] leading-5">
                  <span className="shrink-0 text-[var(--primary)]">·</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

const FACTOR_BAR_COLOR: Record<string, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",  // reserved for active pain / true high-risk
  info: "var(--recovery-blue)",
  neutral: "var(--rm-neutral)",
};

const FACTOR_BAR_TEXT_COLOR: Record<string, string> = {
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
  info: "var(--recovery-blue)",
  neutral: "var(--color-text-muted)",
};

function FactorBar({ title, score, tone, label }: { title: string; score: number; tone: string; label: string }) {
  const color = FACTOR_BAR_COLOR[tone] ?? FACTOR_BAR_COLOR.neutral;
  const tColor = FACTOR_BAR_TEXT_COLOR[tone] ?? FACTOR_BAR_TEXT_COLOR.neutral;
  const pct = Math.min(100, Math.max(0, score));
  return (
    <div className="grid grid-cols-[4.55rem_minmax(0,1fr)_2rem_2.65rem] items-center gap-2" data-tone={tone} data-testid="today-factor-bar">
      <span className="text-[10px] font-semibold text-[var(--color-text-muted)]/80 shrink-0 leading-tight">{title}</span>
      <div className="h-1.5 rounded-full bg-[var(--border-warm)]/75 overflow-hidden shadow-[inset_0_1px_1px_rgba(47,51,47,0.04)]">
        <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-right text-[11px] font-black tabular-nums tracking-[-0.01em]" style={{ color: tColor }}>{Math.round(score)}</span>
      <span className="text-[9px] font-semibold text-[var(--color-text-soft)] text-right leading-tight truncate">{label}</span>
    </div>
  );
}

function buildTodayOverviewReasonLine(
  recSys: ReturnType<typeof buildRunMateRecoverySystem>,
  coachCtx?: CoachContext | null
): string {
  const parts: string[] = [];
  const latestPain = coachCtx?.latestPain ?? null;

  if (latestPain?.hasActivePain && latestPain.painLevel > 0) {
    parts.push(`เจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`);
  } else if (coachCtx?.recentPainHistory || coachCtx?.painResolved) {
    const recentMaxPain = coachCtx.recentMaxPain;
    if (recentMaxPain?.painLevel && recentMaxPain.painLevel >= 3) {
      parts.push(`เคยเจ็บ ${recentMaxPain.painLevel}/10 ล่าสุด`);
    } else if (coachCtx?.painResolved) {
      parts.push("อาการเจ็บเพิ่งดีขึ้น");
    } else {
      parts.push("เพิ่งมีอาการเจ็บ คุมไว้ก่อน");
    }
  }

  const factorCandidates = [
    {
      active: recSys.axes.load.score >= 55,
      label: `Load ${getRecoveryAxisLabel("load", recSys.axes.load.score)}`,
    },
    {
      active: recSys.axes.sleep.score < 66,
      label: `นอน${getRecoveryAxisLabel("sleep", recSys.axes.sleep.score)}`,
    },
    {
      active: recSys.axes.fuel.score < 66,
      label: `พลังงาน${getRecoveryAxisLabel("fuel", recSys.axes.fuel.score)}`,
    },
    {
      active: recSys.axes.recovery.score < 66,
      label: `ฟื้นตัว${getRecoveryAxisLabel("recovery", recSys.axes.recovery.score)}`,
    },
  ];

  for (const factor of factorCandidates) {
    if (factor.active && parts.length < 3) parts.push(factor.label);
  }

  return parts.slice(0, 3).join(" · ") || "พร้อมทำตามแผนวันนี้";
}

function buildTodaySnapshotCoachHeadline(
  score: number,
  coachCtx?: CoachContext | null
): string {
  if (coachCtx?.activePain) return "เลี่ยงกดหนักก่อน";
  const load = coachCtx?.recoverySystem?.axes?.load?.score ?? 0;
  const sleep = coachCtx?.recoverySystem?.axes?.sleep?.score ?? 80;
  if (score <= 50) return "วันนี้เน้นพักฟื้นตัว";
  if (load >= 75) return "คุมเบาไว้ก่อน";
  if (sleep < 50) return "ควรพักและเน้นนอน";
  if (score >= 80 && load < 55) return "พร้อมขยับตามแผน";
  if (score >= 66) return "ขยับได้ ไม่ต้องกด pace";
  return "ฟื้นตัวพอใช้ คุมเบาไว้ก่อน";
}

function getGaugeHeadline(
  score: number | null,
  ctx: CoachContext | null | undefined,
  hasWorkoutToday: boolean
): string {
  if (hasWorkoutToday) return "ซ้อมวันนี้เสร็จแล้ว";
  if (ctx?.sickRiskLevel === "hard_stop") return "วันนี้ควรพักก่อน";
  if (score == null) return "กำลังประเมิน…";
  return buildTodaySnapshotCoachHeadline(score, ctx);
}

function buildGaugeSubline(ctx: CoachContext | null | undefined, status: GaugeStatus): string | undefined {
  if (ctx?.sickRiskLevel === "hard_stop") return "ป่วย · ควรพัก";
  if (ctx?.activePain) return "เจ็บ · ลดโหลด";
  const load = ctx?.recoverySystem?.axes?.load?.score ?? 0;
  if (load >= 75) return "โหลดสูง";
  if (status === "recovery") return "ฟื้นตัวก่อน";
  if (status === "caution") return "คุมระดับไว้";
  if (status === "fair") return "ระวังสะสมล้า";
  return undefined;
}

/** Maps the existing readiness gauge status onto the v0.2 design system's tone palette (presentation only). */
function mapGaugeStatusToTone(status: GaugeStatus): RmTone {
  switch (status) {
    case "good":
    case "fair":
      return "ready";
    case "caution":
      return "caution";
    case "recovery":
      return "recovery";
    case "risk":
      return "stop";
    default:
      return "neutral";
  }
}

function TodaySnapshotCard({
  insight,
  readinessScore,
  todayChecklist,
  loading,
  hasHistory,
  isFallback,
  readinessCoverage,
  hasWorkoutToday,
  coachCtx,
  signalsSlot,
}: {
  insight: DailyCoachInsight | null;
  readinessScore: number | null;
  todayChecklist: TodayChecklistItem[];
  loading: boolean;
  hasHistory: boolean;
  isFallback?: boolean;
  readinessCoverage?: { used: string[]; missing: string[]; hasSleepToday: boolean };
  hasWorkoutToday?: boolean;
  coachCtx?: CoachContext | null;
  signalsSlot?: ReactNode;
}) {
  const missingChecklist = todayChecklist.filter((i) => !i.done);
  const hasSleepToday = readinessCoverage?.hasSleepToday ?? true;

  const recSys = coachCtx ? coachCtx.recoverySystem : buildRunMateRecoverySystem(null);

  const displayStatus = getOverallDisplayStatus(
    readinessScore ?? recSys.overallScore,
    recSys.axes.recovery.score,
    recSys.axes.load.score,
    recSys.axes.sleep.score,
    recSys.axes.fuel.score,
    !!(coachCtx?.activePain),
    !!(coachCtx?.painResolved || coachCtx?.recentPainHistory)
  );

  const axisSummaryLine = buildTodayOverviewReasonLine(recSys, coachCtx);

  const dailyReadiness = coachCtx ? buildDailyReadiness(coachCtx) : null;
  const readinessExplanation = dailyReadiness ? buildReadinessExplanation(dailyReadiness) : null;

  const gaugeStatus: GaugeStatus = getGaugeStatus(readinessScore, coachCtx);
  const gaugeHeadline = getGaugeHeadline(readinessScore, coachCtx, hasWorkoutToday ?? false);
  const chipLabel = hasSleepToday ? displayStatus.label : `ล่าสุด · ${displayStatus.label}`;

  const hasGaugeData = !loading && readinessScore != null && !!insight;
  // The gauge (when shown) already renders its own headline/subline text, so StatusHero's
  // own title/subtitle only fill in when there's no gauge yet — using copy distinct from
  // SickDayEntryCard's own heading below, so the two never duplicate the same text.
  const heroTone: RmTone = loading ? "neutral" : mapGaugeStatusToTone(gaugeStatus);
  const isSickHardStop = coachCtx?.sickRiskLevel === "hard_stop";
  const heroTitle: string | undefined =
    !loading && !hasGaugeData ? (isSickHardStop ? "งดหนักไว้ก่อน" : "วันนี้มีข้อมูลบางส่วน") : undefined;
  const heroSubtitle: string | undefined =
    !loading && !hasGaugeData
      ? (isSickHardStop ? "บันทึกอาการแล้ว รอข้อมูลเพิ่มเพื่อประเมินภาพรวม" : "เพิ่มข้อมูลนอน/ซ้อม เพื่อให้คำแนะนำแม่นขึ้น")
      : undefined;
  const heroMetric = loading ? (
    <ReadinessGauge score={null} label="" status="unknown" headlineTh="กำลังประเมิน…" loading />
  ) : hasGaugeData ? (
    <ReadinessGauge
      score={readinessScore}
      label={chipLabel}
      status={gaugeStatus}
      headlineTh={gaugeHeadline}
      sublineTh={buildGaugeSubline(coachCtx, gaugeStatus)}
      chipClassName={readinessChipClass(readinessScore as number, displayStatus.label)}
    />
  ) : undefined;
  const heroBadge = !loading && isFallback ? (
    <span className="inline-block rounded-full bg-rm-neutral-soft px-3 py-1 text-xs font-semibold text-rm-muted">
      ใช้ข้อมูลล่าสุด
    </span>
  ) : undefined;

  return (
    <StatusHero
      tone={heroTone}
      eyebrow="ภาพรวมวันนี้"
      title={heroTitle}
      subtitle={heroSubtitle}
      badge={heroBadge}
      metric={heroMetric}
    >
      {/* One-line axis summary — kept as separate element for today-overview-reason testid */}
      {!loading && (
        <p className="text-[11px] font-medium text-rm-muted leading-tight" data-testid="today-overview-reason">{axisSummaryLine}</p>
      )}

      {/* สัญญาณวันนี้ — merged into the same card surface instead of a separate block */}
      {signalsSlot}

      {/* Caution note */}
      {!loading && displayStatus?.note && (
        <p className="text-[11px] text-rm-muted leading-relaxed">
          {displayStatus.cautionLevel === "high" ? "⚠️" : "💡"} {displayStatus.note}
        </p>
      )}

      {/* Readiness explanation — why this recommendation */}
      {!loading && readinessExplanation && (
        <p className="text-[11px] text-rm-muted leading-snug" data-testid="readiness-explanation">
          {readinessExplanation}
        </p>
      )}


      {/* Coaching interpretation line — driven by shared guardrail */}
      {!loading && recSys && (() => {
        const guardrail = getTodayTrainingGuardrail(recSys, !!(coachCtx?.activePain), coachCtx?.painRecoveryStatus, coachCtx?.sickRiskLevel);
        if (guardrail.tone === "neutral" || guardrail.tone === "success") return null;

        const bgColor = guardrail.tone === "danger" ? "" : "rounded-2xl bg-rm-caution-soft px-3 py-2 space-y-1.5";
        const textColor = guardrail.tone === "danger" ? "text-rm-stop" : "text-rm-caution";

        if (guardrail.tone === "danger") {
          return (
            <p className={`text-[11px] font-semibold leading-snug ${textColor}`} data-testid="coaching-interpretation-line">
              {guardrail.shortThaiCopy}
            </p>
          );
        }
        return (
          <div className={bgColor} data-testid="coaching-interpretation-line">
            <p className={`text-[11px] font-semibold leading-snug ${textColor}`}>
              {guardrail.shortThaiCopy}
            </p>
            {(guardrail.tone === "warning" || guardrail.recommendedIntensity === "recovery") && (
              <p className="text-[10px] text-rm-caution/80 leading-snug">
                เลือกได้: พักเต็มวัน · เดินเบา ๆ 20–40 นาที · mobility
                {recSys.axes.load.score >= 70 ? " · หลีกเลี่ยงวิ่งหนัก" : ""}
              </p>
            )}
          </div>
        );
      })()}

      {/* Compact today pace card — only when race goal with target time exists and no workout completed yet */}
      {!loading && coachCtx?.raceGoal && dailyReadiness && !hasWorkoutToday && (() => {
        const rg = coachCtx.raceGoal as Record<string, unknown>;
        const paceBands = buildTrainingPaceBands({
          raceDistance: (rg.raceDistance as string) ?? "",
          targetTime: rg.targetTime as string | undefined,
        });
        if (!paceBands) return null;
        const allowedKeys = getAllowedPaceBandsForReadiness({ bands: paceBands, dailyReadiness });
        const { hrZones, easyCap } = buildHrGuidanceForContext(coachCtx);
        const sickHardStop = coachCtx.sickRiskLevel === "hard_stop";
        const hrCapLine = (() => {
          if (!hrZones) return null;
          if (sickHardStop) return "วันนี้ไม่ใช้ HR เป็นเป้าซ้อม — พักก่อน";
          if (easyCap) return easyCap.displayTh;
          return null;
        })();
        // Rest/pain/walk day: no pace chasing — show context-aware message
        if (allowedKeys.length === 0) {
          const isPainRisk = dailyReadiness.band === "pain_risk";
          return (
            <div className="rounded-2xl border border-rm-border bg-rm-surface-soft px-3 py-2" data-testid="today-pace-card">
              <p className="rm-eyebrow">ช่วงเพซวันนี้</p>
              <p className="mt-1 text-sm font-semibold text-rm-stop">
                {isPainRisk ? "วันนี้ยังไม่ควรใช้ pace เป็นเป้า" : "วันนี้ไม่ต้องไล่ pace"}
              </p>
              <p className="mt-0.5 text-[10px] text-rm-muted leading-snug">
                {isPainRisk
                  ? "ให้ใช้อาการเจ็บและความรู้สึกนำก่อน"
                  : `ถ้าจะขยับ: เดินเร็ว · mobility · Easy เบา ๆ ${formatPaceRange(paceBands.easy)}`}
              </p>
              {hrCapLine && (
                <p className="mt-1 text-[10px] font-semibold text-rm-text leading-snug" data-testid="today-hr-cap-line">
                  {hrCapLine}
                </p>
              )}
            </div>
          );
        }
        // Filter to only what's appropriate for Today (full set only on green+build/moderate)
        const displayKeys = getTodayDisplayPaceKeys(allowedKeys, dailyReadiness.band, dailyReadiness.loadTarget);
        if (displayKeys.length === 0) return null;
        const isFullTrainingDay =
          dailyReadiness.band === "green" &&
          (dailyReadiness.loadTarget === "build" || dailyReadiness.loadTarget === "moderate");
        const LABELS: Record<PaceBandKey, string> = { easy: "Easy", long: "Long", tempo: "Tempo", interval: "Interval" };
        return (
          <div className="rounded-2xl border border-rm-border bg-rm-surface-soft px-3 py-2" data-testid="today-pace-card">
            <p className="rm-eyebrow">ช่วงเพซวันนี้</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
              {displayKeys.map((key) => (
                <span key={key} className="text-[10px] text-rm-text">
                  <span className="font-semibold">{LABELS[key]}</span>{" "}
                  <span className="tabular-nums text-rm-primary-strong">{formatPaceRange(paceBands[key])}</span>
                </span>
              ))}
            </div>
            {hrCapLine && (
              <p className="mt-1 text-[10px] font-semibold text-rm-text leading-snug" data-testid="today-hr-cap-line">
                {hrCapLine}
              </p>
            )}
            {!isFullTrainingDay && (
              <p className="mt-1 text-[10px] text-rm-muted leading-snug">
                วันนี้ไม่ต้องไล่ pace ให้ HR/RPE นำ ถ้ารู้สึกหนักให้ช้าลงได้
              </p>
            )}
          </div>
        );
      })()}

      {/* Details: full /100 values, coverage, missing, explanation */}
      {!loading && recSys && (
        <DetailAccordion title="💚 ดูรายละเอียด Recovery" data-testid="recovery-details">
          <div className="space-y-3 cursor-default text-xs">
            {/* Factor bars — compact visual summary */}
            <div className="space-y-1.5 rounded-2xl bg-[var(--surface)]/35 px-2.5 py-2" data-testid="factor-bars">
              {([
                { key: "recovery" as const, title: "ฟื้นตัว" },
                { key: "load" as const, title: "โหลดซ้อม" },
                { key: "sleep" as const, title: "การนอน" },
                { key: "fuel" as const, title: "พลังงาน" },
              ] as const).map(({ key, title }) => (
                <FactorBar
                  key={key}
                  title={title}
                  score={recSys.axes[key].score}
                  label={getRecoveryAxisLabel(key, recSys.axes[key].score)}
                  tone={getRecoveryAxisCoachingTone(key, recSys.axes[key].score, {
                    hasActivePain: !!(coachCtx?.activePain),
                    recoveryScore: recSys.axes.recovery.score,
                    sleepScore: recSys.axes.sleep.score,
                    loadScore: recSys.axes.load.score,
                  })}
                />
              ))}
            </div>

            {/* Axis rows with /100 */}
            <div className="space-y-1.5">
              {([
                { key: "recovery" as const, title: "ฟื้นตัว" },
                { key: "load" as const, title: "โหลดซ้อม" },
                { key: "sleep" as const, title: "การนอน" },
                { key: "fuel" as const, title: "พลังงาน" },
              ] as const).map(({ key, title }) => {
                const axis = recSys.axes[key];
                return (
                  <div key={key} className="flex items-start gap-2">
                    <span className="w-14 shrink-0 text-[10px] font-semibold text-[var(--color-text-muted)]">{title}</span>
                    <span className="font-black text-[var(--foreground)] shrink-0">{formatAxisScore(axis.score)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold shrink-0 ${getAxisBadgeClass(key, axis.score)}`}>
                      {getRecoveryAxisLabel(key, axis.score)}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-soft)] leading-tight min-w-0">{axis.summary}</span>
                  </div>
                );
              })}
            </div>

            <p className="text-[9.5px] text-[var(--color-text-soft)]">* Load สูง = ใช้ร่างกายเยอะ · แกนอื่น 0–100 ยิ่งสูงยิ่งดี</p>

            {/* Coverage chips */}
            {readinessCoverage && (readinessCoverage.used.length > 0 || readinessCoverage.missing.length > 0) && (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  <span className="text-[var(--color-text-soft)] self-center">ข้อมูลที่ใช้ประเมิน:</span>
                  {readinessCoverage.used.map((label) => (
                    <span key={label} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 font-medium text-[var(--primary-strong)]">
                      {label}
                    </span>
                  ))}
                  {readinessCoverage.missing.map((label) => (
                    <span key={label} className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[var(--color-text-soft)]">
                      +{label}
                    </span>
                  ))}
                </div>
                {!hasSleepToday && readinessCoverage.used.some((l) => l.startsWith("ใช้การนอนล่าสุด")) && (
                  <p className="text-[11px] text-[var(--color-text-soft)] leading-4">
                    ยังไม่มีข้อมูลการนอนวันนี้ — คะแนนนี้อิงจากข้อมูลการนอนล่าสุด
                  </p>
                )}
              </div>
            )}

            {/* Missing checklist items */}
            {missingChecklist.length > 0 && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-[var(--color-text-soft)]">ยังขาด:</p>
                <div className="flex flex-wrap gap-1">
                  {missingChecklist.map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="rounded-full bg-[var(--surface-muted)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)] hover:bg-[var(--surface-muted)]"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Recovery explanation */}
            {readinessScore != null && (
              <details className="group/recexp cursor-pointer border-t border-[var(--border-warm)] pt-1.5">
                <summary className="text-[10px] font-semibold text-[var(--color-text-soft)] hover:text-[var(--color-text-muted)] list-none flex items-center gap-1">
                  <span>ระบบ Recovery วันนี้คืออะไร?</span>
                  <span className="transition-transform group-open/recexp:rotate-180">▾</span>
                </summary>
                <div className="mt-1.5 rounded-2xl bg-[var(--surface-muted)] p-3 leading-relaxed text-[var(--color-text-muted)] border border-[var(--border-warm)] space-y-1.5">
                  <p>แต่ละแกนให้คะแนน 0–100 เพื่อช่วยดูว่าร่างกายพร้อมแค่ไหน โหลดสะสมเท่าไร นอนพอไหม และกินพอรองรับไหม</p>
                  {!hasSleepToday && (
                    <p className="text-[10.5px] text-[var(--color-text-muted)] font-semibold bg-[var(--surface-muted)]/50 p-1.5 rounded-lg border border-[var(--border-warm)]/50">
                      วันนี้ยังไม่มีข้อมูลการนอน จึงใช้ข้อมูลล่าสุดเพื่อประเมินชั่วคราว
                    </p>
                  )}
                  {recSys.axes.load.score >= 55 && (
                    <p className="text-[10px] text-[var(--color-warning)] font-semibold bg-[var(--color-warning-soft)] p-1.5 rounded-lg border border-amber-100/50">
                      ⚠️ สำหรับโหลดซ้อม คะแนนสูงหมายถึงโหลดสะสมสูง จึงควรคุมความหนัก ไม่ใช่คะแนนดีเสมอไป
                    </p>
                  )}
                  <ul className="list-disc pl-4 space-y-1 text-[11px]">
                    <li><strong>ฟื้นตัว:</strong> ความพร้อมของหัวใจ/HRV และประวัติความตึงเจ็บ</li>
                    <li><strong>โหลดซ้อม:</strong> ปริมาณวิ่งสะสม 7 วัน</li>
                    <li><strong>การนอน:</strong> ชั่วโมงนอนเมื่อคืนรวมถึงหนี้การนอนสะสมในช่วงสัปดาห์</li>
                    <li><strong>อาหาร:</strong> สารอาหารคาร์บ/โปรตีนวันนี้เพื่อรองรับซ้อมและการฟื้นฟู</li>
                  </ul>
                  {hasWorkoutToday && (
                    <p className="text-[10px] text-[var(--color-text-soft)] font-semibold mt-1">
                      * บันทึกกิจกรรมซ้อมวันนี้แล้ว โหลดและสารอาหารจะอัปเดตเพื่อปรับคำแนะนำถัดไป
                    </p>
                  )}
                </div>
              </details>
            )}
          </div>
        </DetailAccordion>
      )}

      {/* Low data hint */}
      {!loading && !hasHistory && (
        <p className="rounded-xl bg-rm-caution-soft px-3 py-2 text-xs leading-5 text-rm-caution">
          ลอง Upload ข้อมูลนอน อาหาร หรือซ้อม เพื่อให้คำแนะนำแม่นขึ้น
        </p>
      )}
    </StatusHero>
  );
}

function readinessChipClass(score: number, label?: string): string {
  if (label) {
    if (label.includes("Excellent")) return "bg-[var(--color-success-soft)] text-[var(--status-ready)]";
    if (label.includes("Good")) return "bg-[var(--color-info-soft)] text-[var(--recovery-blue)]";
    if (label.includes("Fair")) return "bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
    if (label.includes("Low")) return "bg-[var(--color-danger-soft)] text-[var(--status-rest)]";
  }
  if (score >= 80) return "bg-[var(--color-success-soft)] text-[var(--status-ready)]";
  if (score >= 66) return "bg-[var(--color-info-soft)] text-[var(--recovery-blue)]";
  if (score >= 50) return "bg-[var(--color-warning-soft)] text-[var(--color-warning)]";
  return "bg-[var(--color-danger-soft)] text-[var(--status-rest)]";
}

function isMeaningfulWorkoutTarget(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized || normalized === "-") return false;
  return !/\b(HR|Pace)\s*N\/A\b/i.test(normalized);
}

// ─── Compact Pain Card ─────────────────────────────────────────────────────────

function CompactPainCard({ pains }: { pains: PainSummary[] }) {
  const latest = pains[0];
  const [savingResolved, setSavingResolved] = useState(false);
  const [resolvedSaved, setResolvedSaved] = useState(false);
  const [error, setError] = useState("");
  const isResolved = latest.hasResolvedPain || resolvedSaved;
  const isHighRisk = latest.hasActivePain && latest.riskLevel === "high";
  const isMediumRisk = latest.hasActivePain && latest.riskLevel === "medium";

  const borderClass = isHighRisk ? "border-rm-stop/30 bg-rm-stop-soft"
    : isMediumRisk ? "border-rm-caution/30 bg-rm-caution-soft"
    : "border-rm-primary/25 bg-rm-primary-soft";
  const badgeClass = isHighRisk ? "bg-rm-stop-soft text-rm-stop"
    : isMediumRisk ? "bg-rm-caution-soft text-rm-caution"
    : "bg-rm-primary-soft text-rm-primary-strong";
  const textClass = isHighRisk ? "text-rm-stop" : isMediumRisk ? "text-rm-caution" : "text-rm-primary-strong";
  const btnClass = isHighRisk ? "bg-rm-stop-soft text-rm-stop hover:bg-rm-stop-soft/70"
    : isMediumRisk ? "bg-rm-caution-soft text-rm-caution hover:bg-rm-caution-soft/70"
    : "bg-rm-primary-soft text-rm-primary-strong hover:bg-rm-primary-soft/70";

  async function markPainResolved() {
    if (savingResolved || isResolved) return;
    setSavingResolved(true);
    setError("");
    const now = new Date().toISOString();
    const painLog: PainLog = {
      painLocation: latest.painLocation,
      painSide: (["left", "right", "both", "unknown"].includes(latest.painSide) ? latest.painSide : "unknown") as PainSide,
      painLevel: 0,
      startedWhen: "unknown",
      painType: [],
      painfulWhen: [],
      swellingOrRedness: "no",
      canBearWeight: "yes",
      notes: "ผู้ใช้บันทึกว่าอาการหายแล้วจากหน้า Today",
      riskLevel: "low",
      trainingImpact: "run_ok_easy",
      coachAdvice: "ล่าสุดบันทึกว่าอาการหายแล้ว ค่อย ๆ เพิ่มโหลดกลับ และหยุดทันทีถ้าอาการกลับมา",
      redFlags: [],
      createdAt: now,
      resolved: true,
      status: "resolved",
      resolvedAt: now,
    };
    const result = await saveHistoryItems([createHistoryItem("pain", painLog, now)]);
    setSavingResolved(false);
    if (!result.ok) {
      setError(result.error ?? "บันทึกสถานะหายแล้วไม่สำเร็จ");
      return;
    }
    setResolvedSaved(true);
  }

  const impactNote =
    isResolved ? "ล่าสุดบันทึกว่าอาการหายแล้ว ค่อย ๆ เพิ่มโหลดกลับและสังเกตอาการ"
    : latest.trainingImpact === "seek_professional" ? "ควรพักและพบผู้เชี่ยวชาญหากบวม/ลงน้ำหนักไม่ได้"
    : latest.trainingImpact === "rest" ? "ควรพักจากการวิ่งก่อน"
    : latest.trainingImpact === "reduce_load" ? "ควรลดโหลดซ้อม 24–48 ชม."
    : "ซ้อมเบา ๆ ได้ถ้าไม่เจ็บเพิ่ม";

  return (
    <section className={`rm-card border px-4 py-3 space-y-2.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${textClass}`}>🩹 {latest.painLocation}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
          {isResolved ? "หายแล้ว" : `${latest.painLevel}/10`}
        </span>
      </div>
      <p className={`text-xs leading-5 ${textClass}`}>{impactNote}</p>
      {error ? <p className="rounded-xl bg-rm-stop-soft px-3 py-2 text-xs font-semibold text-rm-stop">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/pain/${encodeURIComponent(latest.id)}`}
          className={`rounded-full py-2 text-center text-xs font-bold transition-colors ${btnClass}`}
        >
          รายละเอียด
        </Link>
        <Link
          href={`/pain?from=${encodeURIComponent(latest.id)}`}
          className="rounded-full bg-rm-primary-strong py-2 text-center text-xs font-bold text-rm-surface hover:bg-rm-primary transition-colors"
        >
          อัปเดต
        </Link>
      </div>
      {!isResolved && latest.painLevel === 0 && (
        <LoadingButton
          type="button"
          loading={savingResolved}
          loadingText="กำลังบันทึก..."
          onClick={() => void markPainResolved()}
          className="w-full rounded-full bg-[var(--surface)]/80 py-2 text-center text-xs font-bold text-[var(--color-success)] hover:bg-[var(--surface)]"
        >
          หายแล้ว
        </LoadingButton>
      )}
    </section>
  );
}

// ─── Compact Nutrition Card ────────────────────────────────────────────────────

function todayProteinTarget(profile: Record<string, unknown> | null): number {
  const pt = Number(profile?.proteinTargetG);
  if (Number.isFinite(pt) && pt > 0) return Math.round(pt);
  const wt = Number(profile?.weightKg);
  if (Number.isFinite(wt) && wt > 0) return Math.round(wt * 1.6);
  return 90;
}

function CompactNutritionCard({ nutrition, profile }: { nutrition: NutritionDaySummary; profile: Record<string, unknown> | null }) {
  const target = todayProteinTarget(profile);
  const actual = nutrition.proteinG;
  const status =
    actual == null ? null
    : actual / target < 0.7 ? "น้อยไป"
    : actual / target < 0.9 ? "ใกล้ถึง"
    : actual / target <= 1.2 ? "ดี"
    : "เกินเป้า";

  return (
    <section className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)]/45 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[var(--foreground)]">
          💪 Protein {actual ?? "-"} / {target} g
        </span>
        {status && (
          <span className="shrink-0 rounded-full bg-[var(--color-warning-soft)] px-2.5 py-0.5 text-xs font-bold text-[var(--color-warning)]">{status}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-[var(--color-text-soft)]">
        {nutrition.carbsG != null && <span>Carbs {nutrition.carbsG} g</span>}
        {nutrition.caloriesKcal != null && <span>{nutrition.caloriesKcal} kcal</span>}
        <span>{nutrition.mealCount} มื้อ</span>
      </div>
    </section>
  );
}

// ─── Sick Day Entry Card ───────────────────────────────────────────────────────

function SickDayEntryCard({ coachCtx }: { coachCtx: CoachContext }) {
  const hasSickToday = coachCtx.activeSick;
  const isHardStop = hasSickToday && coachCtx.sickRiskLevel === "hard_stop";

  if (isHardStop) {
    return (
      <InsightCard
        data-testid="sick-day-entry-card"
        tone="stop"
        title="🔴 วันนี้ควรพักก่อน"
        body="มีอาการที่ไม่เหมาะกับการซ้อม เช่น ไข้ หนาวสั่น หายใจลำบาก หรืออาเจียน"
        action={
          <Link
            href="/sick"
            className="inline-block rounded-xl border border-rm-stop/30 bg-rm-surface px-3 py-1.5 text-xs font-bold text-rm-stop"
          >
            ดู/อัปเดตอาการ
          </Link>
        }
      />
    );
  }

  if (hasSickToday) {
    return (
      <InsightCard
        data-testid="sick-day-entry-card"
        tone="caution"
        title="🟡 วันนี้มีอาการป่วย"
        body="RunMate จะใช้ข้อมูลนี้เพื่อปรับคำแนะนำซ้อมวันนี้"
        action={
          <Link
            href="/sick"
            className="inline-block rounded-xl border border-rm-caution/30 bg-rm-surface px-3 py-1.5 text-xs font-bold text-rm-caution"
          >
            อัปเดตอาการ
          </Link>
        }
      />
    );
  }

  // No data, one line, one action — kept flat (no card border/background) so
  // it reads as a quiet prompt, not another card competing with the
  // content-bearing sections around it (pain, food, end-of-day summary).
  return (
    <div
      data-testid="sick-day-entry-card"
      className="flex items-center justify-between gap-3 px-1 py-1"
    >
      <span className="text-xs font-semibold text-rm-muted">วันนี้ไม่สบาย?</span>
      <Link
        href="/sick"
        className="shrink-0 rounded-xl border border-rm-border bg-rm-surface px-3 py-1.5 text-xs font-bold text-rm-muted"
      >
        แจ้งว่าป่วย
      </Link>
    </div>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function bangkokDateKey(date = new Date()): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

