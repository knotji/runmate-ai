"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { formatThaiDate } from "@/lib/date";
import { buildCoachContextFromSupabase, type CoachContext, type NutritionDaySummary, type PainSummary } from "@/lib/buildCoachContext";
import { loadActiveRaceGoalAndPlan } from "@/lib/raceStorage";
import type { RaceGoal } from "@/types/race";
import type { DailyCoachInsight } from "@/types/ai";

const QUICK_ACTIONS = [
  { href: "/upload?type=sleep",   icon: "🌙", label: "นอน" },
  { href: "/upload?type=meal",    icon: "🍱", label: "อาหาร" },
  { href: "/upload?type=workout", icon: "🏃", label: "วิ่ง" },
  { href: "/summary",             icon: "📋", label: "สรุปวัน" },
  { href: "/pain",                icon: "🩹", label: "เจ็บ" },
] as const;

export default function TodayPage() {
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [insight, setInsight] = useState<DailyCoachInsight | null>(null);
  const [coachCtx, setCoachCtx] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [insightError, setInsightError] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);

  const generateInsight = useCallback(async (force = false) => {
    void force;

    setLoading(true);
    setInsightError(false);
    try {
      const ctx = await buildCoachContextFromSupabase();
      setCoachCtx(ctx);
      const hasSomeData = ctx.sleep7d.length > 0 || ctx.workouts7d.length > 0 || ctx.latestBody != null || !!ctx.raceGoal;
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
      if (process.env.NODE_ENV === "development") {
        console.warn("[today-analysis-error]", error);
      }
      setInsightError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActiveRaceGoalAndPlan().then((result) => {
      if (result.ok) setGoal(result.goal);
    });
    queueMicrotask(() => void generateInsight());
  }, [generateInsight]);

  useEffect(() => {
    const onDataUpdated = () => { setInsight(null); void generateInsight(true); };
    window.addEventListener("runmate:cloud-data-updated", onDataUpdated);
    return () => window.removeEventListener("runmate:cloud-data-updated", onDataUpdated);
  }, [generateInsight]);

  const hasPace = !!(insight?.workoutTarget && insight.workoutTarget !== "-");
  const readinessScore = insight?.todayReadiness != null ? Math.round(insight.todayReadiness) : null;

  return (
    <AppShell title="โค้ชข้างทาง" subtitle={formatThaiDate()}>

      {/* ── Hero: Today recommendation ─────────────────────────── */}
      <section className="card p-5 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">วันนี้ควรทำอะไร</p>

        {loading && (
          <div className="flex items-center gap-3 py-2">
            <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-200 border-t-[#42677f]" />
            <p className="text-sm text-slate-400">กำลังวิเคราะห์ข้อมูล…</p>
          </div>
        )}

        {insightError && !loading && (
          <div className="space-y-2 py-1">
            <div>
              <p className="text-sm font-bold text-[#17201d]">วันนี้ยังวิเคราะห์ด้วย AI ไม่สำเร็จ</p>
              <p className="text-xs text-slate-500">ลองอัปโหลดข้อมูลล่าสุดหรือลองใหม่อีกครั้ง</p>
            </div>
            <button
              type="button"
              onClick={() => void generateInsight(true)}
              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"
            >
              ลองใหม่
            </button>
          </div>
        )}

        {insight && !loading && (
          <>
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
            </div>

            {insight.coachMessage && (
              <p className="rounded-2xl bg-[#e7efea] px-4 py-3 text-sm font-medium leading-relaxed text-[#17201d]">
                {insight.coachMessage}
              </p>
            )}
          </>
        )}

        {!insight && !loading && !insightError && !hasHistory && (
          <div className="py-2">
            <p className="text-base font-semibold text-[#17201d]">ยังไม่มีข้อมูลการซ้อม</p>
            <p className="mt-1 text-sm text-slate-500">Import ข้อมูลจาก Samsung Health หรืออัปโหลดสกรีนช็อตเพื่อเริ่มต้น</p>
          </div>
        )}

        {!insight && !loading && !insightError && hasHistory && (
          <div className="flex items-center justify-between gap-3 py-1">
            <p className="text-sm text-slate-500">มีข้อมูลพร้อมแล้ว</p>
            <button
              type="button"
              onClick={() => void generateInsight(true)}
              className="shrink-0 rounded-full bg-[#42677f] px-4 py-1.5 text-xs font-bold text-white"
            >
              วิเคราะห์
            </button>
          </div>
        )}

        <Link href="/upload" className="btn-primary block w-full py-3 text-center text-sm font-bold">
          อัปโหลดผลวันนี้
        </Link>
      </section>

      {/* ── Compact readiness strip ───────────────────────────── */}
      {insight && readinessScore != null && (
        <section className="card flex items-center gap-4 px-5 py-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${readinessBg(readinessScore)}`}>
            {readinessScore}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-400">ความพร้อมวันนี้</p>
            <p className={`text-sm font-bold ${readinessText(readinessScore)}`}>{insight.readinessLabel}</p>
          </div>
          {insight.readinessNote && (
            <p className="line-clamp-2 text-right text-xs text-slate-400">{insight.readinessNote}</p>
          )}
        </section>
      )}

      {/* ── Pain warning (medium / high risk today or yesterday) ─ */}
      {coachCtx?.recentPainLogs && coachCtx.recentPainLogs.some((p) => p.riskLevel === "high" || p.riskLevel === "medium") && (
        <RecentPainCard pains={coachCtx.recentPainLogs.filter((p) => p.riskLevel === "high" || p.riskLevel === "medium")} />
      )}

      {/* ── Today nutrition mini-card ─────────────────────────── */}
      {coachCtx?.nutritionToday && (
        <TodayNutritionCard nutrition={coachCtx.nutritionToday} profile={coachCtx.profile} />
      )}

      {/* ── Quick actions ─────────────────────────────────────── */}
      <section className="card p-4">
        <div className="grid grid-cols-5 gap-1">
          {QUICK_ACTIONS.map(({ href, icon, label }) => (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center gap-1.5 rounded-2xl py-3 transition-colors hover:bg-slate-50 active:scale-95"
            >
              <span className="text-2xl">{icon}</span>
              <span className="text-xs font-medium text-slate-500">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Race goal hint (subtle) ───────────────────────────── */}
      {!goal && (
        <div className="text-center">
          <Link href="/race-goal" className="text-xs text-slate-400 hover:text-slate-600">
            ยังไม่มี Race Goal · <span className="underline underline-offset-2">ตั้งเป้าหมาย</span>
          </Link>
        </div>
      )}

      {/* ── Refresh insight button (quiet) ────────────────────── */}
      {insight && (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => void generateInsight(true)}
            className="flex items-center gap-1.5 rounded-full bg-slate-100 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}>
              <path fillRule="evenodd" d="M13.836 2.477a.75.75 0 0 1 .75.75v3.182a.75.75 0 0 1-.75.75h-3.182a.75.75 0 0 1 0-1.5h1.37l-.84-.841a4.5 4.5 0 0 0-7.08.932.75.75 0 0 1-1.3-.75 6 6 0 0 1 9.44-1.242l.842.84V3.227a.75.75 0 0 1 .75-.75Zm-.911 7.5A.75.75 0 0 1 13.199 11a6 6 0 0 1-9.44 1.241l-.84-.84v1.371a.75.75 0 0 1-1.5 0V9.591a.75.75 0 0 1 .75-.75H5.35a.75.75 0 0 1 0 1.5H3.98l.841.841a4.5 4.5 0 0 0 7.08-.932.75.75 0 0 1 1.024-.273Z" clipRule="evenodd" />
            </svg>
            วิเคราะห์ใหม่
          </button>
        </div>
      )}

    </AppShell>
  );
}

function readinessBg(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 65) return "bg-[#42677f]";
  if (score >= 50) return "bg-amber-400";
  return "bg-red-400";
}

function readinessText(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 65) return "text-[#42677f]";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function todayProteinTarget(profile: Record<string, unknown> | null): number {
  const pt = Number(profile?.proteinTargetG);
  if (Number.isFinite(pt) && pt > 0) return Math.round(pt);
  const wt = Number(profile?.weightKg);
  if (Number.isFinite(wt) && wt > 0) return Math.round(wt * 1.6);
  return 90;
}

function RecentPainCard({ pains }: { pains: PainSummary[] }) {
  const latest = pains[0];
  const isHighRisk = latest.riskLevel === "high";
  return (
    <section className={`card px-5 py-4 space-y-2 border ${isHighRisk ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs font-bold uppercase tracking-[0.15em] ${isHighRisk ? "text-red-600" : "text-amber-600"}`}>
          🩹 มีอาการเจ็บ — {latest.painLocation}
        </p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${isHighRisk ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
          {latest.painLevel}/10
        </span>
      </div>
      <p className={`text-sm font-semibold ${isHighRisk ? "text-red-700" : "text-amber-700"}`}>
        {isHighRisk ? "ควรพักและปรึกษาผู้เชี่ยวชาญก่อนซ้อม" : "แนะนำลดปริมาณซ้อม หลีกเลี่ยง speed work"}
      </p>
      <Link href="/pain" className={`block text-center rounded-full py-1.5 text-xs font-bold ${isHighRisk ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-amber-100 text-amber-700 hover:bg-amber-200"}`}>
        แจ้งอาการใหม่ / ดูรายละเอียด
      </Link>
    </section>
  );
}

function TodayNutritionCard({ nutrition, profile }: { nutrition: NutritionDaySummary; profile: Record<string, unknown> | null }) {
  const target = todayProteinTarget(profile);
  const actual = nutrition.proteinG;
  const remaining = actual != null ? target - actual : null;
  const status =
    actual == null ? null
    : actual / target < 0.7 ? "น้อยไป"
    : actual / target < 0.9 ? "ใกล้ถึง"
    : actual / target <= 1.2 ? "ดี"
    : "เกินเป้า";

  return (
    <section className="card px-5 py-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">โภชนาการวันนี้</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#17201d]">
          💪 Protein {actual ?? "-"} / {target} g
        </span>
        {status && (
          <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-orange-700">{status}</span>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
        {nutrition.carbsG != null && <span>Carbs {nutrition.carbsG} g</span>}
        {nutrition.caloriesKcal != null && <span>{nutrition.caloriesKcal} kcal</span>}
        <span>{nutrition.mealCount} มื้อ</span>
      </div>
      {remaining != null && (
        <p className="text-xs text-slate-500">
          {remaining > 0 ? `โปรตีนยังขาดอีกประมาณ ${remaining} g` : "ถึงเป้าโปรตีนแล้ว"}
        </p>
      )}
    </section>
  );
}
