"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatThaiDate } from "@/lib/date";
import { buildCoachContextFromSupabase, type CoachContext, type NutritionDaySummary, type PainSummary } from "@/lib/buildCoachContext";
import { createHistoryItem, loadHistoryItems, saveHistoryItems } from "@/lib/cloudHistory";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { DailySummary } from "@/types/logs";
import type { RaceGoal } from "@/types/race";
import type { DailyCoachInsight } from "@/types/ai";

function getRecommendedSubtype(insight: DailyCoachInsight | null, ctx: CoachContext | null): "run" | "strength" | "walk" | "other" {
  if (ctx && (ctx.latestPain || ctx.recentPainLogs?.length)) {
    const p = ctx.latestPain ?? ctx.recentPainLogs[0];
    if (p.riskLevel === "high" || p.riskLevel === "medium") return "walk";
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

export default function TodayPage() {
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [insight, setInsight] = useState<DailyCoachInsight | null>(null);
  const [coachCtx, setCoachCtx] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightError, setInsightError] = useState(false);
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
    setLoading(true);
    setInsightError(false);
    try {
      const ctx = await buildCoachContextFromSupabase();
      setCoachCtx(ctx);
      const hasSomeData = ctx.sleep7d.length > 0 || ctx.workouts7d.length > 0 || ctx.nutrition7d.length > 0 || ctx.latestBody != null || !!ctx.raceGoal;
      setHasHistory(hasSomeData);
      if (!hasSomeData) return;
      const res = await fetch("/api/coach-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ctx),
      });
      if (!res.ok) throw new Error("api error");
      const json = await res.json() as { data: DailyCoachInsight };
      if (!json.data) throw new Error("no data");
      setInsight(json.data);
    } catch (error) {
      if (process.env.NODE_ENV === "development") console.warn("[today-analysis-error]", error);
      setInsightError(true);
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
          <div className="space-y-2 py-1">
            <p className="text-sm font-bold text-[#17201d]">วิเคราะห์ด้วย AI ไม่สำเร็จ</p>
            <button type="button" onClick={() => void generateInsight(true)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
              ลองใหม่
            </button>
          </div>
        )}

        {insight && !loading && (
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
            <button type="button" onClick={() => void generateInsight(true)} className="shrink-0 rounded-full bg-[var(--primary)] px-4 py-1.5 text-xs font-bold text-white">
              วิเคราะห์
            </button>
          </div>
        )}

        <Link href="/upload" className="btn-primary block w-full py-3 text-center text-sm font-bold">
          {hasWorkoutToday ? "อัปเดตข้อมูลวันนี้" : "อัปโหลดผลวันนี้"}
        </Link>
      </section>

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
          <button
            type="button"
            disabled={loading}
            onClick={() => void generateInsight(true)}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-200 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}>
              <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
            </svg>
            วิเคราะห์ใหม่
          </button>
        )}
      </div>

    </AppShell>
  );
}

// ─── Today Snapshot ────────────────────────────────────────────────────────────

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
  const isHighRisk = latest.riskLevel === "high";
  const isMediumRisk = latest.riskLevel === "medium";

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

  const impactNote =
    latest.trainingImpact === "seek_professional" ? "ควรพักและพบผู้เชี่ยวชาญหากบวม/ลงน้ำหนักไม่ได้"
    : latest.trainingImpact === "rest" ? "ควรพักจากการวิ่งก่อน"
    : latest.trainingImpact === "reduce_load" ? "ควรลดโหลดซ้อม 24–48 ชม."
    : "ซ้อมเบา ๆ ได้ถ้าไม่เจ็บเพิ่ม";

  return (
    <section className={`card border px-4 py-3 space-y-2.5 ${borderClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-sm font-bold ${textClass}`}>🩹 {latest.painLocation}</span>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
          {latest.painLevel}/10
        </span>
      </div>
      <p className={`text-xs leading-5 ${textClass}`}>{impactNote}</p>
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
        <div className="flex gap-2">
          <button type="button" onClick={() => setExpanded(true)} className="flex-1 rounded-full bg-slate-100 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
            ดูสรุป
          </button>
          <button type="button" disabled={loading} onClick={onGenerate} className="flex-1 rounded-full bg-slate-100 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">
            {loading ? "กำลังอัปเดต..." : "อัปเดต"}
          </button>
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
        </div>
        {message && <p className="text-xs font-semibold text-green-600">{message}</p>}
        {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
        <button type="button" disabled={loading} onClick={onGenerate} className="w-full rounded-full bg-slate-100 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-50">
          {loading ? "กำลังอัปเดตสรุป..." : "อัปเดตสรุปท้ายวัน"}
        </button>
      </section>
    );
  }

  // No summary yet
  return (
    <section id="end-of-day-summary" className="card scroll-mt-6 px-4 py-3 space-y-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">สรุปท้ายวัน</p>
        <p className="mt-1 text-sm leading-6 text-slate-500">กดก่อนนอนเพื่อให้ AI สรุปวันนี้และวางแผนพรุ่งนี้จากข้อมูลใน Report</p>
      </div>
      {message && <p className="text-xs font-semibold text-green-600">{message}</p>}
      {error && <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-500">{error}</p>}
      <button type="button" disabled={loading} onClick={onGenerate} className="btn-primary w-full py-3 text-sm font-bold disabled:opacity-50">
        {loading ? "กำลังสร้างสรุป..." : "สร้างสรุปท้ายวัน"}
      </button>
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

function findTodaysSummary(items: LocalHistoryItem[]): LocalHistoryItem | null {
  const today = bangkokDateKey();
  return items.find((item) => item.type === "summary" && historyItemBangkokDate(item) === today) ?? null;
}
