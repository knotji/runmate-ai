"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { LoadingButton } from "@/components/LoadingButton";
import { formatThaiDate } from "@/lib/date";
import { buildCoachContextFromSupabase, type CoachContext, type NutritionDaySummary, type PainSummary, type TodayCompletedWorkoutSummary } from "@/lib/buildCoachContext";
import { createHistoryItem, loadHistoryItems, saveHistoryItems } from "@/lib/cloudHistory";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import { loadRoutinesFromSupabase, logCompletedStrength } from "@/lib/strength";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { DailySummary } from "@/types/logs";
import type { PainLog, PainSide } from "@/types/pain";
import type { RaceGoal } from "@/types/race";
import type { AIPrescription, StrengthExercise, StrengthRoutine } from "@/types/strength";
import type { DailyCoachInsight } from "@/types/ai";

function getRecommendedSubtype(insight: DailyCoachInsight | null, ctx: CoachContext | null): "run" | "strength" | "walk" | "other" {
  if (ctx && (ctx.latestPain || ctx.recentPainLogs?.length)) {
    const p = ctx.latestPain ?? ctx.recentPainLogs[0];
    if (p.hasActivePain && (p.riskLevel === "high" || p.riskLevel === "medium")) return "walk";
  }
  if (ctx && ctx.recentRaceResults && ctx.recentRaceResults.length > 0) {
    const lastRace = ctx.recentRaceResults[0];
    if (lastRace.raceDate) {
      const todayStr = ctx.todayDate || new Date().toISOString().slice(0, 10);
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
  data?: DailyCoachInsight;
  errorCode?: string;
  message?: string;
  debugMessage?: string;
};

function buildClientTodayFallback(ctx: CoachContext | null): DailyCoachInsight {
  const readiness = ctx?.avgReadiness ?? ctx?.sleep7d?.[0]?.readiness ?? 65;
  const label: DailyCoachInsight["readinessLabel"] =
    readiness < 50 ? "Low" : readiness < 65 ? "Fair" : readiness < 80 ? "Good" : "Excellent";
  const latestPain = ctx?.latestPain ?? null;
  const latestWorkout = ctx?.todayPrimaryWorkout ?? null;
  const weekParts = [
    ctx && ctx.totalRunKm > 0 ? `วิ่ง ${Math.round(ctx.totalRunKm * 10) / 10} km` : null,
    ctx && ctx.totalSessions > 0 ? `${ctx.totalSessions} sessions` : null,
    ctx?.sleepAvg7dText ? `นอนเฉลี่ย ${ctx.sleepAvg7dText}` : null,
  ].filter(Boolean);

  if (latestWorkout) {
    return {
      todayReadiness: readiness,
      readinessLabel: label,
      readinessNote: ctx?.latestSleepDurationText ? `นอนล่าสุด ${ctx.latestSleepDurationText}` : "ใช้ข้อมูลล่าสุดจาก Report",
      workoutRec: latestWorkout.kind === "race" ? "Recovery หลัง Race วันนี้" : latestWorkout.kind === "run" ? `ฟื้นตัวหลังวิ่ง${latestWorkout.distanceKm != null ? ` ${formatKm(latestWorkout.distanceKm)} km` : ""}` : "Recovery หลังซ้อมวันนี้",
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
      readinessNote: ctx?.latestSleepDurationText ? `นอนล่าสุด ${ctx.latestSleepDurationText}` : "ใช้ข้อมูลล่าสุดจาก Report",
      workoutRec: latestPain.painLevel >= 5 ? "งดวิ่ง / พักและประเมินอาการ" : "Rest / Recovery",
      workoutTarget: "Recovery Day · ไม่ต้องจับ pace",
      weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
      keyObservation: `ล่าสุดเจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`,
      coachMessage: "AI วิเคราะห์ไม่สำเร็จ ระบบจึงใช้คำแนะนำสำรองแบบ conservative ก่อน ให้พักจากแรงกระแทกและลองใหม่อีกครั้งครับ",
    };
  }

  return {
    todayReadiness: readiness,
    readinessLabel: label,
    readinessNote: ctx?.latestSleepDurationText ? `นอนล่าสุด ${ctx.latestSleepDurationText}` : "ใช้ข้อมูลล่าสุดจาก Report",
    workoutRec: "วันนี้เน้นฟื้นตัวเบา ๆ",
    workoutTarget: "เน้นฟื้นตัว · เดินเบา ๆ ถ้าไม่เจ็บ",
    weekSummary: weekParts.length ? weekParts.join(" / ") : "ยังมีข้อมูลสัปดาห์นี้ไม่มาก",
    keyObservation: "ใช้คำแนะนำสำรองจากข้อมูลล่าสุด",
    coachMessage: "ยังวิเคราะห์ด้วย AI ไม่สำเร็จ แต่จากข้อมูลล่าสุดให้เน้นอัปเดตข้อมูลวันนี้ก่อน แล้วลองใหม่อีกครั้งครับ",
  };
}

export default function TodayPage() {
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

  const loadTodaysSummary = useCallback(async () => {
    const result = await loadHistoryItems(["summary"]);
    if (result.ok) setDailySummaryItem(findTodaysSummary(result.items));
  }, []);

  const generateInsight = useCallback(async (force = false) => {
    void force;
    let fallbackContext: CoachContext | null = null;
    setLoading(true);
    setInsightError(false);
    setInsightErrorMessage("");
    try {
      const ctx = await buildCoachContextFromSupabase();
      fallbackContext = ctx;
      setCoachCtx(ctx);
      const hasSomeData = ctx.sleep7d.length > 0 || ctx.workouts7d.length > 0 || ctx.nutrition7d.length > 0 || ctx.latestBody != null || !!ctx.raceGoal;
      setHasHistory(hasSomeData);
      if (!hasSomeData) return;
      const res = await fetch("/api/coach-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      const json = await res.json() as TodayInsightResponse;
      if (!res.ok && !json.data) throw new Error(json.message ?? "api error");
      if (!json.data) throw new Error("no data");
      setInsight(json.data);
      if (json.ok === false) {
        setInsightError(true);
        setInsightErrorMessage(json.message ?? "ใช้คำแนะนำสำรองจากข้อมูลล่าสุด");
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.warn("[today-analysis-error]", error);
      const fallback = buildClientTodayFallback(fallbackContext);
      setInsight(fallback);
      setInsightError(true);
      setInsightErrorMessage("วิเคราะห์ไม่สำเร็จ ระบบแสดงคำแนะนำสำรองจากข้อมูลล่าสุด");
    } finally {
      setLoading(false);
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
  const readinessScore = insight?.todayReadiness != null ? Math.round(insight.todayReadiness) : null;
  const todayChecklist = buildTodayChecklist(coachCtx, dailySummaryItem);
  const hasWorkoutToday = Boolean(coachCtx?.hasWorkoutToday);

  return (
    <AppShell title="โค้ชข้างทาง" subtitle={formatThaiDate()}>

      {/* B. Today Focus Card */}
      <section className="card p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
          {hasWorkoutToday ? "หลังซ้อมวันนี้ควรทำอะไร" : "วันนี้ควรทำอะไร"}
        </p>

        {loading && (
          <div className="flex items-center gap-3 py-2">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#e4d8c8] border-t-[var(--primary)]" />
            <p className="text-sm text-slate-400">กำลังวิเคราะห์ข้อมูล…</p>
          </div>
        )}

        {insightError && !loading && (
          <div className="space-y-2 rounded-2xl bg-amber-50 px-3 py-2">
            <p className="text-sm font-bold text-[#17201d]">{insight ? "ใช้คำแนะนำสำรองอยู่" : "วิเคราะห์ด้วย AI ไม่สำเร็จ"}</p>
            <p className="text-xs leading-5 text-amber-700">
              {insightErrorMessage || "วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง"}
            </p>
            <LoadingButton type="button" loading={loading} loadingText="กำลังวิเคราะห์..." onClick={() => void generateInsight(true)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              ลองใหม่
            </LoadingButton>
          </div>
        )}

        {insight && !loading && (
          hasWorkoutToday && coachCtx?.todayPrimaryWorkout
            ? <PostWorkoutFocusContent insight={insight} context={coachCtx} />
            : <PreWorkoutFocusContent insight={insight} hasPace={hasPace} />
        )}

        {!insight && !loading && !insightError && !hasHistory && (
          <div className="py-1">
            <p className="text-base font-semibold text-[#17201d]">ยังไม่มีข้อมูลการซ้อม</p>
            <p className="mt-1 text-sm text-slate-500">Import ข้อมูลจาก Samsung Health หรืออัปโหลดสกรีนช็อตเพื่อเริ่มต้น</p>
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
          {hasWorkoutToday ? "อัปเดตข้อมูลวันนี้" : "อัปโหลดผลวันนี้"}
        </Link>
      </section>

      {insight && coachCtx && shouldShowTodayStrengthCard(insight, coachCtx) ? (
        <TodayStrengthRoutineCard
          insight={insight}
          context={coachCtx}
          onSaved={() => void generateInsight(true)}
        />
      ) : null}

      {/* C. Today Snapshot: readiness + daily check */}
      <TodaySnapshotCard
        insight={insight}
        readinessScore={readinessScore}
        todayChecklist={todayChecklist}
        loading={loading}
        hasHistory={hasHistory}
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
            <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-slate-50 active:scale-95">
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-slate-500">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* E. Compact detail sections */}
      {(coachCtx?.latestPain || (coachCtx?.recentPainLogs && coachCtx.recentPainLogs.length > 0)) && (
        <CompactPainCard pains={coachCtx.latestPain ? [coachCtx.latestPain, ...coachCtx.recentPainLogs.filter((pain) => pain.id !== coachCtx.latestPain?.id)] : coachCtx.recentPainLogs} />
      )}

      {coachCtx?.nutritionToday && (
        <CompactNutritionCard nutrition={coachCtx.nutritionToday} profile={coachCtx.profile} />
      )}

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

function PreWorkoutFocusContent({ insight, hasPace }: { insight: DailyCoachInsight; hasPace: boolean }) {
  return (
    <div>
      <h2 className="line-clamp-2 text-2xl font-bold text-[#17201d]">{insight.workoutRec}</h2>
      {hasPace && (
        <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {insight.workoutTarget}
        </span>
      )}
      {insight.keyObservation && insight.keyObservation !== "-" && (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">{insight.keyObservation}</p>
      )}
      {insight.coachMessage && (
        <p className="mt-3 rounded-2xl bg-[var(--primary-soft)] px-4 py-3 text-sm font-medium leading-relaxed text-[var(--foreground)]">
          {insight.coachMessage}
        </p>
      )}
    </div>
  );
}

function PostWorkoutFocusContent({ insight, context }: { insight: DailyCoachInsight; context: CoachContext }) {
  const workout = context.todayPrimaryWorkout;
  const title = buildPostWorkoutTitle(workout, insight);
  const subtitle = buildPostWorkoutSubtitle(context, workout);
  const items = buildPostWorkoutChecklist(context, workout);
  const injuryNote = buildPostWorkoutInjuryNote(context);

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#17201d]">{title}</h2>
      <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
        ไม่ต้องซ้อมเพิ่ม · เน้นฟื้นตัว
      </span>
      <p className="mt-2 text-sm leading-relaxed text-slate-500">{subtitle}</p>
      <div className="mt-3 rounded-2xl bg-[var(--primary-soft)] px-4 py-3 text-sm font-medium leading-relaxed text-[var(--foreground)]">
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2a5a39]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
        {injuryNote && (
          <p className="mt-3 border-t border-[#d9e8df] pt-2 text-xs font-semibold leading-5 text-[#2a5a39]">
            {injuryNote}
          </p>
        )}
      </div>
    </div>
  );
}

function buildPostWorkoutTitle(workout: TodayCompletedWorkoutSummary | null, insight: DailyCoachInsight): string {
  if (!workout) return insight.workoutRec || "Recovery หลังซ้อมวันนี้";
  if (workout.kind === "race") return "Recovery หลัง Race วันนี้";
  if (workout.kind === "run") {
    return workout.distanceKm != null
      ? `ฟื้นตัวหลังวิ่ง ${formatKm(workout.distanceKm)} km`
      : "Recovery หลังวิ่งวันนี้";
  }
  if (workout.kind === "strength") return "ฟื้นตัวหลังเวทวันนี้";
  if (workout.kind === "walk") return "ฟื้นตัวหลังเดินวันนี้";
  return "พักฟื้นหลังซ้อมวันนี้";
}

function buildPostWorkoutSubtitle(context: CoachContext, workout: TodayCompletedWorkoutSummary | null): string {
  const parts: string[] = [];
  if (workout) {
    if (workout.kind === "run" && workout.distanceKm != null) parts.push(`วิ่งแล้ว ${formatKm(workout.distanceKm)} km`);
    else parts.push(`${workout.label}วันนี้แล้ว`);
    if (workout.avgHR != null) parts.push(`Avg HR ${Math.round(workout.avgHR)}`);
  }
  const latestPain = context.latestPain;
  if (latestPain) {
    parts.push(latestPain.hasResolvedPain
      ? `${latestPain.painLocation}หายแล้ว`
      : `เจ็บ${latestPain.painLocation}ล่าสุด ${latestPain.painLevel}/10`);
  }
  if (context.avgReadiness != null) parts.push(`Readiness ${Math.round(context.avgReadiness)}`);
  return parts.length > 0
    ? `${parts.join(" · ")} · วันนี้ให้เก็บแรงไว้ฟื้นตัว`
    : "วันนี้มีข้อมูลซ้อมแล้ว ให้ปิดงานด้วย recovery สั้น ๆ และพักให้พอ";
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
  const distance = workout?.distanceKm ?? 0;
  const calories = workout?.calories ?? 0;
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
      return `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว แต่ช่วงล่าสุดเคยขึ้นถึง ${recentMax.painLevel}/10 วันนี้ค่อย ๆ เพิ่มโหลดและหลีกเลี่ยงซ้อมหนัก`;
    }
    return `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว วันนี้ค่อย ๆ กลับเข้าโหลดเบา ๆ และหยุดถ้าอาการกลับมา`;
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
      setError("AI ปรับรูทีนไม่สำเร็จ ลองใหม่อีกครั้ง");
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#6f8fa6]">เวทวันนี้</p>
          <h2 className="mt-1 text-xl font-bold text-[#17201d]">
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
            loadingText="AI กำลังปรับ..."
            onClick={() => void adjustForToday()}
            className="btn-secondary py-2.5 text-xs font-bold"
          >
            AI ปรับเป็นเวอร์ชันวันนี้
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
      note: `ล่าสุด${latest.painLocation}ทำเครื่องหมายว่าหายแล้ว ทำเวทเบา ๆ ได้ แต่ค่อย ๆ เพิ่มโหลดและหยุดถ้าอาการกลับมา`,
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

function formatKm(value: number): string {
  if (!Number.isFinite(value)) return "-";
  return value.toFixed(2).replace(/\.?0+$/, "");
}

type TodayChecklistItem = { label: string; href: string; done: boolean };

function buildTodayChecklist(ctx: CoachContext | null, summaryItem: LocalHistoryItem | null): TodayChecklistItem[] {
  const today = ctx?.todayDate || bangkokDateKey();
  return [
    { label: "อัปโหลดการนอน", href: "/upload?type=sleep", done: Boolean(ctx?.sleep7d.some((i) => i.date === today)) },
    { label: "บันทึกอาหาร", href: "/upload?type=meal", done: Boolean(ctx?.nutritionToday && ctx.nutritionToday.mealCount > 0) },
    { label: "บันทึกซ้อม/พัก", href: "/upload?type=workout", done: Boolean(ctx?.workouts7d.some((i) => i.date === today)) },
    { label: "เช็กอาการเจ็บ", href: "/pain", done: Boolean(ctx?.recentPainLogs?.some((i) => i.date === today)) },
    { label: "สรุปท้ายวัน", href: "#end-of-day-summary", done: Boolean(summaryItem) },
  ];
}

function TodaySnapshotCard({
  insight,
  readinessScore,
  todayChecklist,
  loading,
  hasHistory,
}: {
  insight: DailyCoachInsight | null;
  readinessScore: number | null;
  todayChecklist: TodayChecklistItem[];
  loading: boolean;
  hasHistory: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const completed = todayChecklist.filter((i) => i.done).length;
  const total = todayChecklist.length;
  const allDone = completed === total;
  const missing = todayChecklist.filter((i) => !i.done);

  return (
    <section className="card px-4 py-3 space-y-2.5">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">ภาพรวมวันนี้</p>

      {/* Status chips */}
      <div className="flex flex-wrap gap-2">
        {loading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">กำลังวิเคราะห์...</span>
        )}
        {!loading && readinessScore != null && insight && (
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${readinessChipClass(readinessScore)}`}>
            {readinessScore} Readiness {insight.readinessLabel}
          </span>
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${allDone ? "bg-[#eef7f0] text-[var(--status-ready)]" : "bg-slate-100 text-slate-600"}`}
        >
          Daily check {completed}/{total} {allDone ? "✓" : ""}
        </button>
      </div>

      {/* Collapsed state: show missing items */}
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

function readinessChipClass(score: number): string {
  if (score >= 80) return "bg-[#eef7f0] text-[var(--status-ready)]";
  if (score >= 65) return "bg-[#e7f0fa] text-[#42677f]";
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
      notes: "ผู้ใช้ทำเครื่องหมายว่าอาการหายแล้วจากหน้า Today",
      riskLevel: "low",
      trainingImpact: "run_ok_easy",
      coachAdvice: "อาการนี้ถูกทำเครื่องหมายว่าหายแล้ว ค่อย ๆ เพิ่มโหลดกลับ และหยุดทันทีถ้าอาการกลับมา",
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
    isResolved ? "อาการล่าสุดถูกทำเครื่องหมายว่าหายแล้ว ค่อย ๆ เพิ่มโหลดกลับและสังเกตอาการ"
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
  const [expanded, setExpanded] = useState(false);
  const generatedAt = item ? formatSummaryGeneratedAt(item.createdAt) : "";
  const existingSummaryNote = `AI สรุปจาก Report ตอนกดล่าสุด${generatedAt ? ` · อัปเดตล่าสุด: ${generatedAt}` : ""} หากเพิ่งเพิ่ม/ลบข้อมูล แนะนำกดอัปเดตอีกครั้ง`;
  const newSummaryNote = "AI จะสรุปจากข้อมูลใน Report ตอนกดสร้าง อาจคลาดเคลื่อนได้ถ้าข้อมูลยังไม่ครบ";

  if (hasSummary && !expanded) {
    return (
      <section id="end-of-day-summary" className="card scroll-mt-6 px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">สรุปท้ายวัน</p>
          <span className="rounded-full bg-[#eef7f0] px-2 py-0.5 text-[10px] font-bold text-[var(--status-ready)]">พร้อมแล้ว</span>
        </div>
        {summary?.overallSummary && (
          <p className="line-clamp-2 text-sm leading-6 text-slate-700">{summary.overallSummary}</p>
        )}
        <p className="text-[11px] leading-5 text-slate-400">{existingSummaryNote}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setExpanded(true)} className="flex-1 rounded-full bg-slate-100 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
            ดูสรุป
          </button>
          <LoadingButton type="button" loading={loading} loadingText="กำลังอัปเดต..." onClick={onGenerate} className="flex-1 rounded-full bg-slate-100 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">
            อัปเดต
          </LoadingButton>
        </div>
      </section>
    );
  }

  if (hasSummary && expanded) {
    return (
      <section id="end-of-day-summary" className="card scroll-mt-6 px-4 py-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">สรุปท้ายวัน</p>
          <button type="button" onClick={() => setExpanded(false)} className="text-xs text-slate-400 hover:text-slate-600">ซ่อน</button>
        </div>
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3">
          {summary?.overallSummary && <p className="text-sm font-bold leading-6 text-[#17201d]">{summary.overallSummary}</p>}
          <SummaryLine label="วันนี้" text={summary?.trainingReview} />
          <SummaryLine label="สิ่งที่ควรระวัง" text={summary?.recoveryReview || summary?.whatToImprove} />
          <SummaryLine label="แผนพรุ่งนี้" text={summary?.tomorrowPlan} />
          {summary?.coachMessage && (
            <p className="rounded-2xl bg-[var(--primary-soft)] px-3 py-2 text-sm font-semibold leading-6 text-[var(--foreground)]">
              {summary.coachMessage}
            </p>
          )}
          <p className="text-[11px] leading-5 text-slate-400">{existingSummaryNote}</p>
        </div>
        {message && <p className="text-xs font-semibold text-green-600">{message}</p>}
        {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
        <LoadingButton type="button" loading={loading} loadingText="กำลังอัปเดตสรุป..." onClick={onGenerate} className="w-full rounded-full bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">
          อัปเดตสรุปท้ายวัน
        </LoadingButton>
      </section>
    );
  }

  // No summary yet
  return (
    <section id="end-of-day-summary" className="card scroll-mt-6 px-4 py-3 space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">สรุปท้ายวัน</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">กดก่อนนอนเพื่อให้ AI สรุปวันนี้และวางแผนพรุ่งนี้จากข้อมูลใน Report</p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">{newSummaryNote}</p>
      </div>
      {message && <p className="text-xs font-semibold text-green-600">{message}</p>}
      {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
      <LoadingButton type="button" loading={loading} loadingText="กำลังสร้างสรุป..." onClick={onGenerate} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
        สร้างสรุปท้ายวัน
      </LoadingButton>
    </section>
  );
}

function SummaryLine({ label, text }: { label: string; text?: string }) {
  if (!text) return null;
  return (
    <div className="text-sm leading-6 text-slate-700">
      <span className="font-bold text-[#17201d]">{label}: </span>
      {text}
    </div>
  );
}

// ─── Utilities ─────────────────────────────────────────────────────────────────

function bangkokDateKey(date = new Date()): string {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function historyItemBangkokDate(item: LocalHistoryItem): string {
  const date = new Date(item.createdAt);
  if (Number.isNaN(date.getTime())) return item.createdAt.slice(0, 10);
  return bangkokDateKey(date);
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
