"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { NutritionBalanceCard } from "@/components/NutritionBalanceCard";
import { NextMealCard } from "@/components/NextMealCard";
import type { NextMealRecommendation } from "@/app/api/next-meal/route";
import { buildTodayRecommendationReasons } from "@/lib/todayReasons";
import { formatThaiDate, getHistoryItemDateKey, todayBangkokDateKey } from "@/lib/date";
import { buildCoachContextFromSupabase, type CoachContext, type NutritionDaySummary, type PainSummary, type TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";
import { getTodayReadiness, getTodayPlannedWorkout, getReadinessCategoryLabel, checkPlannedWorkoutMatching } from "@/lib/todayPlanning";
import { buildRunMateRecoverySystem, getAxisTone, formatAxisScore, getRecoveryAxisLabel, getOverallDisplayStatus } from "@/lib/recoverySystem";
import { createHistoryItem, loadHistoryItems, saveHistoryItems } from "@/lib/cloudHistory";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import { loadRoutinesFromSupabase, logCompletedStrength } from "@/lib/strength";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { DailySummary } from "@/types/logs";
import type { PainLog, PainSide } from "@/types/pain";
import type { RaceGoal } from "@/types/race";
import type { AIPrescription, StrengthExercise, StrengthRoutine } from "@/types/strength";
import type { DailyCoachInsight } from "@/types/ai";

const TODAY_INSIGHT_CLIENT_TIMEOUT_MS = 18000;

function getRecommendedSubtype(insight: DailyCoachInsight | null, ctx: CoachContext | null): "run" | "strength" | "walk" | "other" {
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
    ctx && ctx.totalRunKm > 0 ? `วิ่ง ${Math.round(ctx.totalRunKm * 10) / 10} km` : null,
    ctx && ctx.totalSessions > 0 ? `${ctx.totalSessions} sessions` : null,
    ctx?.sleepAvg7dText ? `นอนเฉลี่ย ${ctx.sleepAvg7dText}` : null,
  ].filter(Boolean);

  if (latestWorkout) {
    return {
      todayReadiness: readiness,
      readinessLabel: label,
      readinessNote,
      workoutRec: latestWorkout.kind === "race" ? "Recovery หลัง Race วันนี้" : latestWorkout.kind === "run" ? `ฟื้นตัวหลังวิ่ง${formatKm(latestWorkout.distanceKm) ? ` ${formatKm(latestWorkout.distanceKm)} km` : ""}` : "Recovery หลังซ้อมวันนี้",
      workoutTarget: "ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว",
      weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
      keyObservation: latestWorkout.label,
      coachMessage: "วันนี้มีข้อมูลซ้อมแล้ว ระบบใช้คำแนะนำสำรองให้เน้นฟื้นตัว เติมน้ำ กินโปรตีนกับคาร์บพอประมาณ และนอนให้พอครับ",
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
  const [insight, setInsight] = useState<DailyCoachInsight | null>(null);
  const [coachCtx, setCoachCtx] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightError, setInsightError] = useState(false);
  const [insightErrorMessage, setInsightErrorMessage] = useState("");
  const [hasHistory, setHasHistory] = useState(false);
  const [dailySummaryItem, setDailySummaryItem] = useState<LocalHistoryItem | null>(null);
  const [dailySummaryLoading, setDailySummaryLoading] = useState(false);
  const [dailySummaryError, setDailySummaryError] = useState("");
  const [dailySummaryMessage, setDailySummaryMessage] = useState("");
  const [nextMealRec, setNextMealRec] = useState<NextMealRecommendation | null>(null);
  const [nextMealLoading, setNextMealLoading] = useState(false);
  const [showReasons, setShowReasons] = useState(false);


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

  const loadTodaysSummary = useCallback(async () => {
    const result = await loadHistoryItems(["summary"]);
    if (result.ok) setDailySummaryItem(findTodaysSummary(result.items));
  }, []);

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
    queueMicrotask(() => void generateInsight());
    queueMicrotask(() => void loadTodaysSummary());
  }, [generateInsight, loadTodaysSummary]);

  useEffect(() => {
    const onDataUpdated = () => { setInsight(null); void generateInsight(true); void loadTodaysSummary(); };
    window.addEventListener("runmate:cloud-data-updated", onDataUpdated);
    return () => window.removeEventListener("runmate:cloud-data-updated", onDataUpdated);
  }, [generateInsight, loadTodaysSummary]);

  async function generateDailySummary() {
    setDailySummaryLoading(true);
    setDailySummaryError("");
    setDailySummaryMessage("");
    try {
      const context = await buildCoachContextFromSupabase();
      const existingResult = await loadHistoryItems(["summary"]);
      const existingItem = existingResult.ok ? findTodaysSummary(existingResult.items) : dailySummaryItem;
      const response = await fetch("/api/generate-daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(context),
      });
      if (!response.ok) throw new Error("summary api failed");
      const result = await response.json() as { data?: DailySummary };
      if (!result.data) throw new Error("missing summary data");
      const item = existingItem
        ? { ...existingItem, data: result.data }
        : createHistoryItem("summary", result.data);
      const saveResult = await saveHistoryItems([item]);
      if (!saveResult.ok) throw new Error(saveResult.error ?? "save failed");
      setDailySummaryItem(item);
      setDailySummaryMessage(existingItem ? "อัปเดตสรุปท้ายวันใน Report แล้ว" : "บันทึกสรุปท้ายวันเข้า Report แล้ว");
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.warn("[end-of-day-summary-error]", error);
      setDailySummaryError("สร้างสรุปท้ายวันไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      setDailySummaryLoading(false);
    }
  }

  const hasPace = isMeaningfulWorkoutTarget(insight?.workoutTarget);
  // insight.todayReadiness is the single source of truth for both the chip and the
  // explanation panel so they never disagree. Label is recomputed from the score via
  // getRunMateReadinessLabel — never trust AI-returned label strings.
  const readinessScore = insight?.todayReadiness != null ? Math.round(insight.todayReadiness) : null;
  const readinessCoverage = buildReadinessCoverageSummary(coachCtx);
  const todayChecklist = buildTodayChecklist(coachCtx, dailySummaryItem);
  const hasWorkoutToday = Boolean(coachCtx?.hasWorkoutToday);

  return (
    <AppShell title="โค้ชข้างทาง" subtitle={formatThaiDate()}>

      {/* Section: แผนวันนี้ */}
      <p className="mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-soft)]">แผนวันนี้</p>

      {/* B. Today Focus Card */}
      <section className="card p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {hasWorkoutToday ? (coachCtx?.todayWorkouts.some((w) => w.kind === "strength") ? "หลังเวทวันนี้ควรทำอะไรต่อ" : "หลังซ้อมวันนี้ควรทำอะไรต่อ") : "วันนี้ควรทำอะไร"}
        </p>

        {loading && (
          <div className="flex items-center gap-3 py-2">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#e4d8c8] border-t-[var(--primary)]" />
            <p className="text-sm text-slate-400">กำลังประเมินข้อมูลล่าสุด…</p>
          </div>
        )}

        {insightError && !loading && (
          <div className="space-y-2 rounded-2xl bg-amber-50 px-3 py-2">
            <p className="text-sm font-bold text-[#17201d]">{insight ? "ใช้คำแนะนำสำรองจากข้อมูลล่าสุด" : "ยังประเมินไม่สำเร็จ"}</p>
            <p className="text-xs leading-5 text-amber-700">
              {insightErrorMessage || "ประเมินไม่สำเร็จ ลองใหม่อีกครั้ง"}
            </p>
            <LoadingButton type="button" loading={loading} loadingText="กำลังวิเคราะห์..." onClick={() => void generateInsight(true)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              วิเคราะห์ใหม่
            </LoadingButton>
          </div>
        )}

        {insight && (
          hasWorkoutToday && coachCtx?.todayPrimaryWorkout
            ? <PostWorkoutFocusContent insight={insight} context={coachCtx} />
            : <PreWorkoutFocusContent insight={insight} hasPace={hasPace} context={coachCtx} isFallback={insightError} />
        )}

        {!insight && !loading && !insightError && !hasHistory && (
          <div className="py-1">
            <p className="text-base font-semibold text-[#17201d]">วันนี้ยังไม่มีข้อมูลใหม่</p>
            <p className="mt-1 text-sm text-slate-500">เพิ่มข้อมูลจากหน้า Upload เพื่อให้คำแนะนำแม่นขึ้น</p>
          </div>
        )}

        {!insight && !loading && !insightError && hasHistory && (
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="text-sm text-slate-500">มีข้อมูลพร้อมแล้ว</p>
            <LoadingButton type="button" loading={loading} loadingText="กำลังวิเคราะห์..." onClick={() => void generateInsight(true)} className="shrink-0 rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-bold text-white">
              วิเคราะห์
            </LoadingButton>
          </div>
        )}

        <Link href="/upload" className="btn-primary block w-full py-3 text-center text-sm font-bold">
          {hasWorkoutToday ? "อัปเดตข้อมูลวันนี้" : "บันทึกกิจกรรมวันนี้"}
        </Link>

        {insight && (
          <div>
            <button
              type="button"
              onClick={() => setShowReasons((v) => !v)}
              className="mt-1 flex w-full items-center justify-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              <span>{showReasons ? "ซ่อนเหตุผล" : "ทำไมวันนี้แนะนำแบบนี้?"}</span>
              <span className={`transition-transform duration-200 ${showReasons ? "rotate-180" : ""}`}>▾</span>
            </button>
            {showReasons && (
              <div className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">เหตุผลของคำแนะนำวันนี้</p>
                <ul className="space-y-1 mt-1">
                  {buildTodayRecommendationReasons(coachCtx, insight, coachCtx?.readinessV2 ?? null, readinessCoverage.hasSleepToday).map((r, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600 leading-5">
                      <span className="mt-0.5 shrink-0 text-[var(--primary)]">·</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {insight && coachCtx && shouldShowTodayStrengthCard(insight, coachCtx) ? (
        <TodayStrengthRoutineCard
          insight={insight}
          context={coachCtx}
          onSaved={() => void generateInsight(true)}
        />
      ) : null}

      {/* Section: ภาพรวมวันนี้ */}
      <p className="mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-soft)]">ภาพรวมวันนี้</p>

      {/* C. Today Snapshot: readiness + daily check */}
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
      />

      {/* D. Quick Actions */}
      <section className="card p-4">
        <div className="grid grid-cols-5 gap-1">
          {[
            { href: "/upload?type=sleep", icon: "🌙", label: "นอน" },
            { href: "/upload?type=meal", icon: "🍱", label: "อาหาร" },
            { href: `/upload?type=workout&subtype=${getRecommendedSubtype(insight, coachCtx)}`, icon: "🏃", label: "ซ้อม" },
            { href: "/pain", icon: "🩹", label: "เจ็บ" },
            { href: "#end-of-day-summary", icon: "📋", label: "สรุปวัน" },
          ].map(({ href, icon, label }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-[var(--surface-muted)] active:scale-95">
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-slate-500">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* F. Compact detail sections */}
      {(() => {
        if (!coachCtx?.latestPain) return null;
        const latest = coachCtx.latestPain;
        const hasActivePain = latest.hasActivePain && latest.painLevel > 0;

        if (hasActivePain) {
          return (
            <>
              <p className="mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-soft)]">Recovery / อาการ</p>
              <CompactPainCard pains={coachCtx.latestPain ? [coachCtx.latestPain, ...coachCtx.recentPainLogs.filter((pain) => pain.id !== coachCtx.latestPain?.id)] : coachCtx.recentPainLogs} />
            </>
          );
        } else {
          return (
            <>
              <p className="mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-soft)]">Recovery / อาการ</p>
              <div className="flex items-center justify-between rounded-2xl border border-[var(--border-warm)] bg-[var(--surface)] px-4 py-2.5 shadow-sm text-xs text-[var(--foreground)] card">
                <span className="font-semibold text-slate-700">🩹 อาการเจ็บ{latest.painLocation}ดีขึ้นแล้ว</span>
                <Link href="/pain" className="text-[var(--primary)] font-bold hover:underline">
                  อัปเดตอาการ →
                </Link>
              </div>
            </>
          );
        }
      })()}

      {(() => {
        if (!coachCtx) return null;
        const fuelScore = coachCtx.recoverySystem?.axes?.fuel?.score ?? 65;
        const hasNutrition = coachCtx.nutritionToday || coachCtx.nutritionBalanceToday;
        if (!hasNutrition) return null;

        return (
          <>
            <p className="mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-soft)]">อาหารวันนี้</p>
            <details className="group rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/75 px-4 py-3 shadow-sm cursor-pointer">
              <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--foreground)]">
                <div>
                  <p className="text-sm font-bold text-[var(--foreground)]">อาหารและพลังงานวันนี้</p>
                  <p className="text-xs text-[var(--muted-text)] font-medium mt-0.5">
                    {fuelScore >= 80 ? "พลังงานวันนี้โอเค (คาร์บ/โปรตีนเพียงพอ)" : `พลังงานวันนี้ ${Math.round(fuelScore)}/100 · ควรรองรับเพิ่มเติม`}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-bold shrink-0">
                  <span className="group-open:hidden">ดูรายละเอียด</span>
                  <span className="hidden group-open:inline">ซ่อน</span>
                  <span className="transition-transform group-open:rotate-180">▾</span>
                </div>
              </summary>
              <div className="mt-3 pt-3 border-t border-slate-100/60 space-y-3 cursor-default">
                {coachCtx.nutritionToday && (
                  <CompactNutritionCard nutrition={coachCtx.nutritionToday} profile={coachCtx.profile} />
                )}
                {coachCtx.nutritionBalanceToday && (
                  <NutritionBalanceCard balance={coachCtx.nutritionBalanceToday} />
                )}
              </div>
            </details>
          </>
        );
      })()}

      {coachCtx && (
        <NextMealCard
          recommendation={nextMealRec}
          loading={nextMealLoading}
          onRequest={() => void requestNextMeal()}
          compact
          fuelScore={coachCtx.recoverySystem?.axes?.fuel?.score}
        />
      )}

      <p className="mt-1 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-soft)]">สรุป</p>

      <EndOfDaySummaryCard
        item={dailySummaryItem}
        loading={dailySummaryLoading}
        error={dailySummaryError}
        message={dailySummaryMessage}
        onGenerate={() => void generateDailySummary()}
      />

      {/* Footer: race goal + re-analyze */}
      <div className="flex items-center justify-between gap-3 px-1">
        {!goal ? (
          <Link href="/race-goal" className="text-xs text-slate-400 hover:text-slate-600">
            ยังไม่มี Race Goal · <span className="underline underline-offset-2">ตั้งเป้าหมาย</span>
          </Link>
        ) : <span />}
        {insight && (
          <LoadingButton
            type="button"
            loading={loading}
            loadingText="กำลังวิเคราะห์..."
            onClick={() => void generateInsight(true)}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 disabled:opacity-40"
          >
            วิเคราะห์ใหม่
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

function PreWorkoutFocusContent({
  insight,
  hasPace,
  context,
  isFallback,
}: {
  insight: DailyCoachInsight;
  hasPace: boolean;
  context: CoachContext | null;
  isFallback?: boolean;
}) {
  const decision = getDecisionCard(insight, context);
  const hasSleepToday = context ? context.sleep7d.some((s) => s.date === context.todayDate) : false;
  const hasLatestSleep = context ? context.sleep7d.length > 0 : false;
  const isUsingLatestSleepBecauseTodayMissing = !hasSleepToday && hasLatestSleep;

  // Build a concise reason line
  const reasonParts: string[] = [];
  if (context?.recoverySystem) {
    const { load, sleep, fuel } = context.recoverySystem.axes;
    if (context.activePain) {
      reasonParts.push("มีรายงานอาการเจ็บ");
    } else {
      if (load.score >= 70) reasonParts.push("Load สูง");
      else if (load.score >= 55) reasonParts.push("Load ปานกลาง");
      if (sleep.score < 66) reasonParts.push("Sleep พอใช้");
      if (fuel.score < 66) reasonParts.push("Fuel ยังน้อย");
    }
  }
  const reasonLine = reasonParts.join(" · ") || "ร่างกายอยู่ในเกณฑ์ดี";

  return (
    <div className="space-y-3">
      {/* 1. Headline first */}
      <h2 className="line-clamp-2 text-2xl font-bold text-[#17201d]">{insight.workoutRec}</h2>

      {/* 2. Target plan line */}
      {hasPace && (
        <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {insight.workoutTarget}
        </span>
      )}

      {/* 3. Reason line */}
      <p className="text-xs font-medium text-slate-400 mt-1">{reasonLine}</p>

      {/* 4. Sleep Fallback note (if any) */}
      {isUsingLatestSleepBecauseTodayMissing && (
        <div className="rounded-2xl border border-[var(--color-info-soft)] bg-[var(--color-info-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--color-info)] font-semibold">
          ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้
        </div>
      )}

      {/* 5. Detailed information inside accordion */}
      <details className="mt-3 group border-t border-slate-100/60 pt-3 cursor-pointer">
        <summary className="text-[11px] font-bold text-slate-400 hover:text-slate-500 list-none flex items-center justify-between">
          <span>ดูเหตุผลและข้อแนะนำเพิ่มเติม</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-3 cursor-default">
          {decision && (
            <div className={`rounded-2xl border p-4 space-y-1.5 ${
              isFallback ? "bg-amber-50/80 border-amber-200 text-amber-900" :
              decision.type === "pain" ? "bg-red-50/80 border-red-200 text-red-900" :
              decision.type === "caution" ? "bg-amber-50/80 border-amber-200 text-amber-900" :
              "bg-[#f5faf7] border-[#d9e8df] text-[#1c472a]"
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold uppercase tracking-wider">{decision.title}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                  isFallback ? "bg-amber-100 text-amber-700" :
                  decision.type === "pain" ? "bg-red-100 text-red-700" :
                  decision.type === "caution" ? "bg-amber-100 text-amber-700" :
                  "bg-[#e7efea] text-[#2a5a39]"
                }`}>
                  {isFallback ? "คำแนะนำสำรอง" : (decision.type === "pain" ? "งดวิ่ง" : decision.type === "caution" ? "ปรับลดโหลด" : "ตามแผน")}
                </span>
              </div>
              <p className="text-xs leading-relaxed">{decision.body}</p>
            </div>
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
    if (workout.kind === "run" && distance) parts1.push(`วิ่งแล้ว ${distance} km`);
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

  // Build a concise reason line for post-workout
  const reasonParts = [];
  if (context.recoverySystem) {
    const { recovery, load } = context.recoverySystem.axes;
    if (load.score >= 70) reasonParts.push("Load สูง");
    reasonParts.push(`ฟื้นตัว${getRecoveryAxisLabel("recovery", recovery.score)}`);
    reasonParts.push("วันนี้ไม่ต้องซ้อมเพิ่ม");
  }
  const reasonLine = reasonParts.join(" · ") || "ซ้อมวันนี้แล้ว · เน้นฟื้นตัว";

  return (
    <div className="space-y-3">
      {/* 1. Headline first */}
      <h2 className="text-2xl font-bold text-[#17201d]">{title}</h2>

      {/* 2. Target plan line */}
      <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว
      </span>

      {/* 3. Reason line */}
      <p className="text-xs font-medium text-slate-400 mt-1">{reasonLine}</p>

      {/* Warnings & Notes */}
      {matching.isUncertain && (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 border border-amber-200">
          ⚠️ วันนี้มีบันทึกกิจกรรมแล้ว (อาจแตกต่างจากแผนที่ตั้งไว้) แนะนำเน้นฟื้นตัวและงดซ้อมหนักซ้ำ
        </p>
      )}
      {isUsingLatestSleepBecauseTodayMissing && (
        <div className="rounded-2xl border border-[var(--color-info-soft)] bg-[var(--color-info-soft)] px-3 py-2 text-xs leading-relaxed text-[var(--color-info)] font-semibold">
          ใช้ข้อมูลล่าสุดชั่วคราว — ยังไม่มีการนอนวันนี้
        </div>
      )}

      {/* 4. Detailed list collapsed behind details accordion */}
      <details className="mt-3 group border-t border-slate-100/60 pt-3 cursor-pointer">
        <summary className="text-[11px] font-bold text-slate-400 hover:text-slate-500 list-none flex items-center justify-between">
          <span>ดูสิ่งที่ควรทำต่อ</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-3 space-y-3 cursor-default text-xs">
          {parts1.length > 0 && (
            <p className="text-xs font-semibold text-slate-800 leading-normal">
              {parts1.join(" · ")}
            </p>
          )}
          {parts2.length > 0 && (
            <p className="text-[11px] text-slate-500 leading-normal">
              {parts2.join(" · ")}
            </p>
          )}

          <p className="text-xs leading-relaxed text-slate-500 bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3">
            💡 บันทึกกิจกรรมวันนี้แล้ว ไม่จำเป็นต้องซ้อมหนักซ้ำอีก เน้นการจิบน้ำ เติมโปรตีน ขยับเบา ๆ และนอนหลับให้เพียงพอเพื่อฟื้นฟูกล้ามเนื้อ
          </p>

          {context.recoverySystem?.guardrails && context.recoverySystem.guardrails.filter(g => !g.includes("บันทึกกิจกรรม") && !g.includes("สภาพร่างกายพร้อม")).length > 0 && (
            <div className="rounded-2xl bg-amber-50/60 p-3 text-xs leading-relaxed text-amber-900 border border-amber-100 flex items-start gap-2">
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

          <div className="rounded-2xl bg-emerald-50/60 p-3 text-xs leading-relaxed text-emerald-900 border border-emerald-100 flex items-start gap-2">
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
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2a5a39]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            {injuryNote && (
              <p className="mt-3 border-t border-[#d9e8df] pt-2 text-[11px] font-semibold leading-5 text-[#2a5a39]">
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
  if (context && context.todayWorkouts.length > 1) {
    const kinds = context.todayWorkouts.map(w => w.kind);
    if (kinds.includes("run") && kinds.includes("strength")) {
      return "หลังออกกำลังกายวันนี้";
    }
  }
  if (!workout) return insight.workoutRec || "Recovery หลังซ้อมวันนี้";
  if (workout.kind === "race") return "Recovery หลัง Race วันนี้";
  if (workout.kind === "run") {
    const distance = formatKm(workout.distanceKm);
    return distance
      ? `ฟื้นตัวหลังวิ่ง ${distance} km`
      : "Recovery หลังวิ่งวันนี้";
  }
  if (workout.kind === "strength") return "ฟื้นตัวหลังเวทวันนี้";
  if (workout.kind === "walk") return "ฟื้นตัวหลังเดินวันนี้";
  return "พักฟื้นหลังซ้อมวันนี้";
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
    const loggedDuration = loggedWorkout?.durationMin ? `${loggedWorkout.durationMin} นาที` : durationMin ? `${durationMin} นาที` : "";
    const loggedLabel = loggedWorkout?.label ?? prescription?.routineName ?? selected?.name ?? "เวท";
    const loggedHR = loggedWorkout?.avgHR ? `Avg HR ${Math.round(loggedWorkout.avgHR)} bpm` : "";
    const loggedCalories = loggedWorkout?.calories ? `${loggedWorkout.calories} kcal` : "";

    const summaryParts = [loggedDuration, loggedLabel, "เวท", loggedHR, loggedCalories].filter(Boolean);

    return (
      <section className="card space-y-3 p-5 border-l-4 border-green-500 bg-[#fbfdfb]">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#eef7f0] px-2.5 py-0.5 text-[10px] font-bold text-[var(--status-ready)]">✓ วันนี้บันทึกเวทแล้ว</span>
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-[#17201d]">
            {prescription?.routineName ?? selected?.name ?? "Recovery Strength"} เสร็จแล้ว
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            ต่อจากนี้เน้นฟื้นตัว เดินเบา ๆ ยืดเบา ๆ และนอนให้พอ
          </p>
        </div>

        {summaryParts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {summaryParts.map((part) => (
              <span key={part} className="rounded-full bg-[#eef4ef] px-2.5 py-0.5 text-xs font-bold text-[#2a5a39]">
                {part}
              </span>
            ))}
          </div>
        )}

        <div className="pt-1">
          <button
            type="button"
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 flex items-center gap-1"
          >
            <span>{showDetails ? "ซ่อนรายละเอียด" : "ดูรายละเอียดที่ทำ"}</span>
            <span className={`transition-transform duration-200 ${showDetails ? "rotate-180" : ""}`}>▾</span>
          </button>

          {showDetails && exercises.length > 0 && (
            <div className="mt-2 rounded-2xl bg-slate-50 p-3 space-y-1.5 border border-slate-100">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">รายการท่าที่ทำ</p>
              <div className="space-y-1.5">
                {exercises.map((exercise) => (
                  <div key={`${exercise.name}-${exercise.sets}-${exercise.reps}`} className="flex justify-between gap-3 text-xs">
                    <span className="font-semibold text-slate-700">{exercise.name}</span>
                    <span className="shrink-0 text-slate-500">{formatStrengthExerciseLine(exercise)}</span>
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
    badgeColorClass = "bg-red-50 text-[var(--status-rest)] border-red-200";
  } else if (isFairOrCaution || hasRecentPainHistory) {
    strengthBadge = "ทางเลือกแทนวิ่งวันนี้";
    strengthHelperCopy = "ถ้าขายังล้าหรือไม่อยากวิ่ง ให้ทำชุดนี้แทนได้ ไม่จำเป็นต้องทำทั้งวิ่งและเวทในวันเดียวกัน";
    badgeColorClass = "bg-amber-50 text-[#9b742c] border-amber-200";
  } else {
    strengthBadge = "เสริมได้ถ้ายังไม่ล้า";
    strengthHelperCopy = "ทำเสริมหลังวิ่งได้ถ้ายังสด แต่ไม่จำเป็นถ้ารู้สึกล้า";
    badgeColorClass = "bg-[#eef7f0] text-[var(--status-ready)] border-[#cfe4d5]";
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
      <section className="card p-4 text-sm text-slate-500">
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
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6f8fa6]">เวทวันนี้</p>
            {strengthBadge && (
              <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${badgeColorClass}`}>
                {strengthBadge}
              </span>
            )}
          </div>
          <h2 className="mt-1.5 text-xl font-bold text-[#17201d]">
            {prescription?.recommendedTitle ?? selected.name}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{prescription?.reason ?? reason}</p>
        </div>
        {durationMin ? (
          <span className="shrink-0 rounded-full bg-[#eef4ef] px-3 py-1 text-xs font-bold text-[#2a5a39]">
            {durationMin} นาที
          </span>
        ) : null}
      </div>

      {strengthHelperCopy && (
        <p className="rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600 border border-slate-100">
          💡 {strengthHelperCopy}
        </p>
      )}

      {safety.note ? (
        <p className={`rounded-2xl px-3 py-2 text-xs leading-5 ${safety.blockWorkout ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`}>
          {safety.note}
        </p>
      ) : null}

      {!safety.blockWorkout ? (
        <div className="rounded-2xl bg-slate-50/80 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">ตัวอย่างท่า</p>
          <div className="mt-2 space-y-1.5">
            {exercises.slice(0, 3).map((exercise) => (
              <div key={`${exercise.name}-${exercise.sets}-${exercise.reps}`} className="flex justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700">{exercise.name}</span>
                <span className="shrink-0 text-slate-500">{formatStrengthExerciseLine(exercise)}</span>
              </div>
            ))}
            {exercises.length > 3 ? <p className="text-xs text-slate-400">+ อีก {exercises.length - 3} ท่า</p> : null}
          </div>
        </div>
      ) : null}

      {alreadyCompleted ? (
        <p className="rounded-2xl bg-green-50 px-3 py-2 text-xs font-bold text-green-700">
          วันนี้บันทึกเวทแล้ว
        </p>
      ) : null}
      {error ? <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p> : null}

      {!alreadyCompleted && !safety.blockWorkout ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <LoadingButton
            type="button"
            loading={adjusting}
            loadingText="กำลังปรับ..."
            onClick={() => void adjustForToday()}
            className="btn-secondary py-2.5 text-xs font-bold"
          >
            ปรับเป็นเวอร์ชันวันนี้
          </LoadingButton>
          <LoadingButton
            type="button"
            loading={saving}
            loadingText="กำลังบันทึก..."
            onClick={() => void saveDone()}
            className="btn-primary py-2.5 text-xs font-bold"
          >
            บันทึกว่าเสร็จแล้ว
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

function buildTodayChecklist(ctx: CoachContext | null, summaryItem: LocalHistoryItem | null): TodayChecklistItem[] {
  const today = ctx?.todayDate || bangkokDateKey();
  // Pain counts if there's a log today OR if latestPain (within 7d) is already used in Today context
  const painDone = Boolean(
    ctx?.recentPainLogs?.some((i) => i.date === today) ||
    ctx?.latestPain != null,
  );
  return [
    { label: "บันทึกการนอน", href: "/upload?type=sleep", done: Boolean(ctx?.sleep7d.some((i) => i.date === today)) },
    { label: "บันทึกอาหาร", href: "/upload?type=meal", done: Boolean(ctx?.nutritionToday && ctx.nutritionToday.mealCount > 0) },
    { label: "บันทึกกิจกรรมวันนี้", href: "/upload?type=workout", done: Boolean(ctx?.workouts7d.some((i) => i.date === today)) },
    { label: "เช็กอาการเจ็บ", href: "/pain", done: painDone },
    { label: "สรุปท้ายวัน", href: "#end-of-day-summary", done: Boolean(summaryItem) },
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
    if (w.kind === "run") used.push(`วิ่ง${w.distanceKm ? ` ${Math.round(w.distanceKm * 10) / 10} km` : "วันนี้"}`);
    else if (w.kind === "strength") used.push("เวทวันนี้");
    else if (w.kind === "race") used.push("แข่งวันนี้");
    else used.push("ออกกำลังกายวันนี้");
  } else if (ctx.workouts7d.length > 0) {
    used.push(`โหลดสัปดาห์ ${Math.round(ctx.totalRunKm * 10) / 10} km`);
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
  if (tone === "success") return "bg-[#eef7f0] text-[var(--status-ready)] border border-[#cfe4d5]";
  if (tone === "warning") return "bg-[#fff6df] text-[#9b742c] border border-[#ead9a9]";
  if (tone === "danger") return "bg-[#fff0ee] text-[var(--status-rest)] border border-[#e8c1bd]";
  if (tone === "info") return "bg-[#eef4f8] text-[#42677f] border border-[#ccdce8]";
  return "bg-slate-50 text-slate-600 border border-slate-100";
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
}) {
  const [expanded, setExpanded] = useState(false);
  const completed = todayChecklist.filter((i) => i.done).length;
  const total = todayChecklist.length;
  const allDone = completed === total;
  const missing = todayChecklist.filter((i) => !i.done);
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

  return (
    <section className="card px-4 py-3 space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">ภาพรวมวันนี้</p>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {loading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">รอข้อมูลล่าสุด</span>
        )}
        {!loading && readinessScore != null && insight && (
          <>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${readinessChipClass(readinessScore, displayStatus.displayLabel)}`}>
              {readinessScore} Readiness {hasSleepToday ? displayStatus.displayLabel : `ล่าสุด · ${displayStatus.displayLabel}`}
            </span>
            {isFallback && (
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500 font-semibold">
                ใช้ข้อมูลล่าสุด
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${allDone ? "bg-[#eef7f0] text-[var(--status-ready)]" : "bg-slate-100 text-slate-600"}`}
        >
          Daily check {completed}/{total} {allDone ? "✓" : ""}
        </button>
      </div>

      {/* Caution Note Banner */}
      {!loading && displayStatus?.note && (
        <div className="rounded-2xl border border-amber-100 bg-[#fffbeb] px-3.5 py-2.5 text-xs leading-relaxed text-amber-900 font-semibold my-1 shadow-sm flex items-start gap-2">
          <span className="text-sm mt-0.5">⚠️</span>
          <div>
            <p className="text-[10px] text-amber-700 uppercase tracking-wider font-bold">ข้อแนะนำความพร้อม</p>
            <p className="mt-0.5 text-amber-900 leading-snug">{displayStatus.note}</p>
          </div>
        </div>
      )}

      {/* Compact/Collapsible Recovery System */}
      {!loading && recSys && (
        <details className="text-xs text-slate-500 cursor-pointer group border border-slate-100 bg-white p-3.5 rounded-2xl shadow-sm space-y-3 transition-all duration-300">
          <summary className="text-xs list-none flex items-center justify-between font-semibold text-slate-700">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-slate-700">
              <span>ฟื้นตัว {Math.round(recSys.axes.recovery.score)}</span>
              <span className="text-slate-300">·</span>
              <span>โหลด {Math.round(recSys.axes.load.score)}</span>
              <span className="text-slate-300">·</span>
              <span>นอน {Math.round(recSys.axes.sleep.score)}</span>
              <span className="text-slate-300">·</span>
              <span>พลังงาน {Math.round(recSys.axes.fuel.score)}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-bold shrink-0">
              <span className="group-open:hidden">ดูรายละเอียด Recovery</span>
              <span className="hidden group-open:inline">ซ่อนรายละเอียด</span>
              <span className="transition-transform group-open:rotate-180">▾</span>
            </div>
          </summary>

          <div className="pt-3 border-t border-slate-50 grid grid-cols-2 gap-2.5 cursor-default">
            {/* Recovery Axis */}
            <div className="rounded-2xl p-3 border border-slate-100 bg-slate-50/50 flex flex-col justify-between min-h-[90px]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">ฟื้นตัว</span>
                  <span className="text-sm">⚡</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-slate-800">{formatAxisScore(recSys.axes.recovery.score)}/100</span>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${getAxisBadgeClass("recovery", recSys.axes.recovery.score)}`}>
                    {getRecoveryAxisLabel("recovery", recSys.axes.recovery.score)}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight mt-1">{recSys.axes.recovery.summary}</p>
            </div>

            {/* Load Axis */}
            <div className="rounded-2xl p-3 border border-slate-100 bg-slate-50/50 flex flex-col justify-between min-h-[90px]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">โหลดซ้อม</span>
                  <span className="text-sm">🏃</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-slate-800">{formatAxisScore(recSys.axes.load.score)}/100</span>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${getAxisBadgeClass("load", recSys.axes.load.score)}`}>
                    {getRecoveryAxisLabel("load", recSys.axes.load.score)}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight mt-1">{recSys.axes.load.summary}</p>
            </div>

            {/* Sleep Axis */}
            <div className="rounded-2xl p-3 border border-slate-100 bg-slate-50/50 flex flex-col justify-between min-h-[90px]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">การนอน</span>
                  <span className="text-sm">🌙</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-slate-800">{formatAxisScore(recSys.axes.sleep.score)}/100</span>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${getAxisBadgeClass("sleep", recSys.axes.sleep.score)}`}>
                    {getRecoveryAxisLabel("sleep", recSys.axes.sleep.score)}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight mt-1">{recSys.axes.sleep.summary}</p>
            </div>

            {/* Fuel Axis */}
            <div className="rounded-2xl p-3 border border-slate-100 bg-slate-50/50 flex flex-col justify-between min-h-[90px]">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400">พลังงาน</span>
                  <span className="text-sm">🍱</span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-slate-800">{formatAxisScore(recSys.axes.fuel.score)}/100</span>
                  <span className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold ${getAxisBadgeClass("fuel", recSys.axes.fuel.score)}`}>
                    {getRecoveryAxisLabel("fuel", recSys.axes.fuel.score)}
                  </span>
                </div>
              </div>
              <p className="text-[9px] text-slate-500 leading-tight mt-1">{recSys.axes.fuel.summary}</p>
            </div>
          </div>

          <p className="text-[9.5px] text-slate-400 leading-normal pt-2 border-t border-slate-50 cursor-default">
            * Load สูง = ใช้ร่างกายเยอะ · แกนอื่น 0–100 ยิ่งสูงยิ่งดี
          </p>
        </details>
      )}

      {/* Readiness V2 source coverage */}
      {!loading && readinessCoverage && (readinessCoverage.used.length > 0 || readinessCoverage.missing.length > 0) && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-slate-400 self-center">ข้อมูลที่ใช้ประเมิน:</span>
            {readinessCoverage.used.map((label) => (
              <span key={label} className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-medium text-[var(--primary-strong)]">
                {label}
              </span>
            ))}
            {readinessCoverage.missing.map((label) => (
              <span key={label} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">
                +{label}
              </span>
            ))}
          </div>
          {!hasSleepToday && readinessCoverage.used.some((l) => l.startsWith("ใช้การนอนล่าสุด")) && (
            <p className="text-[11px] text-slate-400 leading-4">
              ยังไม่มีข้อมูลการนอนวันนี้ — คะแนนนี้อิงจากข้อมูลการนอนล่าสุด
            </p>
          )}
        </div>
      )}

      {/* Recovery explanation note */}
      {!loading && readinessScore != null && (
        <details className="text-xs text-slate-500 mt-2 cursor-pointer group">
          <summary className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 list-none flex items-center gap-1">
            <span>ระบบ Recovery วันนี้คืออะไร?</span>
            <span className="transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="mt-1.5 rounded-2xl bg-slate-50 p-3 leading-relaxed text-slate-500 border border-slate-100 space-y-1.5">
            <p>แต่ละแกนให้คะแนน 0–100 เพื่อช่วยดูว่าร่างกายพร้อมแค่ไหน โหลดสะสมเท่าไร นอนพอไหม และกินพอรองรับไหม</p>
            {!hasSleepToday && (
              <p className="text-[10.5px] text-slate-500 font-semibold bg-slate-100/50 p-1.5 rounded-lg border border-slate-200/50">
                วันนี้ยังไม่มีข้อมูลการนอน จึงใช้ข้อมูลล่าสุดเพื่อประเมินชั่วคราว
              </p>
            )}
            {recSys && recSys.axes.load.score >= 55 && (
              <p className="text-[10px] text-amber-700 font-semibold bg-amber-50/50 p-1.5 rounded-lg border border-amber-100/50">
                ⚠️ สำหรับโหลดซ้อม คะแนนสูงหมายถึงโหลดสะสมสูง จึงควรคุมความหนัก ไม่ใช่คะแนนดีเสมอไป
              </p>
            )}
            <p className="text-[10px] text-slate-500 bg-slate-100/50 p-1.5 rounded-lg border border-slate-200/50 font-semibold leading-normal">
              * แม้คะแนนพื้นฐาน (HRV/RHR) จะสูง แต่หากความล้าสะสมสูง นอนน้อย หรือกินไม่พอ ระบบจะคุมระดับคำแนะนำเป็นสีฟ้า/เหลือง (Good/Fair) เพื่อช่วยป้องกันการฝืนซ้อม
            </p>
            <ul className="list-disc pl-4 space-y-1 text-[11px]">
              <li><strong>ฟื้นตัว:</strong> ความพร้อมของหัวใจ/HRV และประวัติความตึงเจ็บ</li>
              <li><strong>โหลดซ้อม:</strong> ปริมาณวิ่งสะสม 7 วัน</li>
              <li><strong>การนอน:</strong> ชั่วโมงนอนเมื่อคืนรวมถึงหนี้การนอนสะสมในช่วงสัปดาห์</li>
              <li><strong>อาหาร:</strong> สารอาหารคาร์บ/โปรตีนวันนี้เพื่อรองรับซ้อมและการฟื้นฟู</li>
            </ul>
            {hasWorkoutToday && (
              <p className="text-[10px] text-slate-400 font-semibold mt-1">
                * บันทึกกิจกรรมซ้อมวันนี้แล้ว โหลดและสารอาหารจะอัปเดตเพื่อปรับคำแนะนำถัดไป
              </p>
            )}
          </div>
        </details>
      )}

      {/* Collapsed state: show daily check missing items */}
      {!expanded && !allDone && missing.length > 0 && (
        <p className="text-xs text-slate-500">
          ยังขาด: <span className="font-semibold">{missing.map((i) => i.label).join(" · ")}</span>
        </p>
      )}

      {/* Low data hint */}
      {!loading && !hasHistory && (
        <p className="rounded-xl bg-[#fff6df] px-3 py-2 text-xs leading-5 text-[#8a6729]">
          ลอง Upload ข้อมูลนอน อาหาร หรือซ้อม เพื่อให้คำแนะนำแม่นขึ้น
        </p>
      )}

      {/* Expanded checklist */}
      {expanded && (
        <div className="space-y-1.5 pt-0.5">
          <div className="grid gap-1.5">
            {todayChecklist.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-semibold text-[#17201d]">{item.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.done ? "bg-[#eef7f0] text-[var(--status-ready)]" : "bg-slate-100 text-slate-500"}`}>
                  {item.done ? "เสร็จ" : "ยัง"}
                </span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-slate-400">ไม่ต้องครบทุกข้อก็ได้ ใช้เป็นตัวช่วยเช็กข้อมูลประจำวัน</p>
        </div>
      )}

      {/* Toggle link */}
      <button type="button" onClick={() => setExpanded((v) => !v)} className="text-xs text-slate-400 hover:text-slate-600">
        {expanded ? "ซ่อน" : allDone ? "ดูรายละเอียด" : "ดูทั้งหมด"}
      </button>
    </section>
  );
}

function readinessChipClass(score: number, label?: string): string {
  if (label) {
    if (label.includes("Excellent")) return "bg-[#eef7f0] text-[var(--status-ready)]";
    if (label.includes("Good")) return "bg-[#e7f0fa] text-[#42677f]";
    if (label.includes("Fair")) return "bg-[#fff6df] text-[#9b742c]";
    if (label.includes("Low")) return "bg-red-50 text-[var(--status-rest)]";
  }
  if (score >= 80) return "bg-[#eef7f0] text-[var(--status-ready)]";
  if (score >= 66) return "bg-[#e7f0fa] text-[#42677f]";
  if (score >= 50) return "bg-[#fff6df] text-[#9b742c]";
  return "bg-red-50 text-[var(--status-rest)]";
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

  const borderClass = isHighRisk ? "border-red-200 bg-red-50"
    : isMediumRisk ? "border-amber-200 bg-amber-50"
    : "border-[#d9e8df] bg-[#f5faf7]";
  const badgeClass = isHighRisk ? "bg-red-100 text-red-700"
    : isMediumRisk ? "bg-amber-100 text-amber-700"
    : "bg-[#e7efea] text-[#2a5a39]";
  const textClass = isHighRisk ? "text-red-700" : isMediumRisk ? "text-amber-700" : "text-[#2a5a39]";
  const btnClass = isHighRisk ? "bg-red-100 text-red-700 hover:bg-red-200"
    : isMediumRisk ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
    : "bg-[#e7efea] text-[#2a5a39] hover:bg-[#d9e8df]";

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
    <section className={`card border px-4 py-3 space-y-2.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${textClass}`}>🩹 {latest.painLocation}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
          {isResolved ? "หายแล้ว" : `${latest.painLevel}/10`}
        </span>
      </div>
      <p className={`text-xs leading-5 ${textClass}`}>{impactNote}</p>
      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/pain/${encodeURIComponent(latest.id)}`}
          className={`rounded-full py-2 text-center text-xs font-bold transition-colors ${btnClass}`}
        >
          รายละเอียด
        </Link>
        <Link
          href={`/pain?from=${encodeURIComponent(latest.id)}`}
          className="rounded-full bg-[#17201d] py-2 text-center text-xs font-bold text-white hover:bg-[#2a3d35] transition-colors"
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
          className="w-full rounded-full bg-white/80 py-2 text-center text-xs font-bold text-[#2a5a39] hover:bg-white"
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
    <section className="card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#17201d]">
          💪 Protein {actual ?? "-"} / {target} g
        </span>
        {status && (
          <span className="shrink-0 rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-orange-700">{status}</span>
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-400">
        {nutrition.carbsG != null && <span>Carbs {nutrition.carbsG} g</span>}
        {nutrition.caloriesKcal != null && <span>{nutrition.caloriesKcal} kcal</span>}
        <span>{nutrition.mealCount} มื้อ</span>
      </div>
    </section>
  );
}

// ─── End-of-day Summary Card ───────────────────────────────────────────────────

function EndOfDaySummaryCard({
  item,
  loading,
  error,
  message,
  onGenerate,
}: {
  item: LocalHistoryItem | null;
  loading: boolean;
  error: string;
  message: string;
  onGenerate: () => void;
}) {
  const summary = item?.data as DailySummary | undefined;
  const hasSummary = Boolean(summary);
  const generatedAt = item ? formatSummaryGeneratedAt(item.createdAt) : "";
  const existingSummaryNote = `สรุปจาก Report ตอนกดล่าสุด${generatedAt ? ` · อัปเดตล่าสุด: ${generatedAt}` : ""}`;
  const newSummaryNote = "ระบบจะสรุปจากข้อมูลใน Report ตอนกดสร้าง";

  const bangkokHour = (() => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Bangkok",
        hour: "2-digit",
        hour12: false,
      });
      return Number(formatter.format(now));
    } catch {
      return new Date().getHours();
    }
  })();
  const isEvening = bangkokHour >= 18;

  // Case 1: summary exists -> show compact done state
  if (hasSummary) {
    return (
      <div id="end-of-day-summary" className="flex items-center justify-between rounded-2xl border border-[var(--border-warm)] bg-[var(--surface)] px-4 py-2.5 shadow-sm text-xs text-[var(--foreground)] card scroll-mt-6">
        <span className="font-semibold text-slate-700">📋 สรุปท้ายวันของวันนี้บันทึกเรียบร้อยแล้ว</span>
        <details className="inline-block cursor-pointer">
          <summary className="list-none text-[var(--primary)] font-bold hover:underline">ดูบันทึก</summary>
          <div className="mt-2 text-left space-y-1 text-slate-500 border-t border-slate-100 pt-2 font-medium cursor-default">
            <p className="font-bold text-slate-800 leading-snug">{summary?.overallSummary}</p>
            {summary?.trainingReview && <p>ความรู้สึก/ซ้อม: {summary.trainingReview}</p>}
            {summary?.tomorrowPlan && <p>แผนพรุ่งนี้: {summary.tomorrowPlan}</p>}
            {summary?.coachMessage && (
              <p className="mt-1 rounded bg-[var(--primary-soft)] px-2 py-1 text-[11px] text-[var(--primary-strong)]">
                {summary.coachMessage}
              </p>
            )}
            <p className="text-[10px] text-slate-400 mt-1">{existingSummaryNote}</p>
            <div className="flex gap-2 mt-2 pt-2 border-t border-slate-50">
              <LoadingButton type="button" loading={loading} loadingText="กำลังอัปเดต..." onClick={onGenerate} className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200">
                อัปเดตสรุปท้ายวัน
              </LoadingButton>
            </div>
          </div>
        </details>
      </div>
    );
  }

  // Case 2: summary missing & before evening -> show collapsed details card
  if (!isEvening) {
    return (
      <details id="end-of-day-summary" className="group rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/75 px-4 py-3 shadow-sm cursor-pointer scroll-mt-6">
        <summary className="flex list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--foreground)]">
          <div>
            <p className="text-sm font-bold text-[var(--foreground)]">สรุปท้ายวัน</p>
            <p className="text-xs text-[var(--muted-text)] font-medium mt-0.5">ช่วยให้โค้ชเข้าใจวันนี้มากขึ้น</p>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-bold shrink-0">
            <span className="group-open:hidden">เขียนสรุป</span>
            <span className="hidden group-open:inline">ปิด</span>
            <span className="transition-transform group-open:rotate-180">▾</span>
          </div>
        </summary>
        <div className="mt-3 pt-3 border-t border-slate-100/60 cursor-default space-y-3">
          <p className="text-xs text-slate-500">กดก่อนนอนเพื่อสรุปวันนี้และวางแผนพรุ่งนี้จากข้อมูลใน Report ({newSummaryNote})</p>
          {message && <p className="text-xs font-semibold text-green-600">{message}</p>}
          {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
          <LoadingButton type="button" loading={loading} loadingText="กำลังสร้างสรุป..." onClick={onGenerate} className="btn-primary w-full py-2.5 text-xs font-bold disabled:opacity-50">
            สร้างสรุปท้ายวัน
          </LoadingButton>
        </div>
      </details>
    );
  }

  // Case 3: summary missing & evening -> show prominent uploader card
  return (
    <section id="end-of-day-summary" className="card scroll-mt-6 px-4 py-3 space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">สรุปท้ายวัน</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">กดก่อนนอนเพื่อสรุปวันนี้และวางแผนพรุ่งนี้จากข้อมูลใน Report</p>
        <p className="mt-1 text-[11px] text-slate-400">{newSummaryNote}</p>
      </div>
      {message && <p className="text-xs font-semibold text-green-600">{message}</p>}
      {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
      <LoadingButton type="button" loading={loading} loadingText="กำลังสร้างสรุป..." onClick={onGenerate} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
        สรุปท้ายวัน
      </LoadingButton>
    </section>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function bangkokDateKey(date = new Date()): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function historyItemBangkokDate(item: LocalHistoryItem): string {
  return getHistoryItemDateKey(item);
}

function formatSummaryGeneratedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function findTodaysSummary(items: LocalHistoryItem[]): LocalHistoryItem | null {
  const today = bangkokDateKey();
  return items.find((item) => item.type === "summary" && historyItemBangkokDate(item) === today) ?? null;
}
