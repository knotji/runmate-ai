"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { loadHistoryItems } from "@/lib/cloudHistory";
import { loadRaceResults } from "@/lib/raceResults";
import { loadProfileFromSupabase } from "@/lib/profileStorage";
import type { LocalHistoryItem } from "@/lib/localHistory";
import type { SleepAnalysis, WorkoutAnalysis, MealAnalysis, DailySummary, BodyCompositionAnalysis } from "@/types/logs";
import type { RaceResult } from "@/types/race";
import type { UserProfile } from "@/types/profile";
import type { PainLog } from "@/types/pain";
import type { StrengthLog } from "@/types/strength";
import {
  formatDistanceKm,
  formatDuration,
  formatPace,
  formatScore,
  formatPercent,
  formatDecimal,
  formatCalories,
  formatMacro,
  formatSummaryText,
} from "@/lib/format";
import { extractMealData, normalizeMealNutrition } from "@/lib/mealMerge";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [items, setItems] = useState<LocalHistoryItem[]>([]);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "run" | "meal" | "strength" | "pain">("all");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [result, raceResult, profileResult] = await Promise.all([
        loadHistoryItems(),
        loadRaceResults(50),
        loadProfileFromSupabase(),
      ]);
      if (!alive) return;
      if (profileResult.ok) setProfile(profileResult.profile ?? null);
      if (result.ok) {
        setItems(result.items);
        if (raceResult.ok) {
          setRaceResults(raceResult.results);
          if (process.env.NODE_ENV === "development") {
            console.info("[report-race-badge-debug]", { raceResultsCount: raceResult.results.length, dates: raceResult.results.map((r) => r.raceDate) });
          }
        }
        setError("");
      } else {
        setError(result.error);
      }
      setLoading(false);
    }
    void load();
    const onFocus = () => void load();
    window.addEventListener("runmate:cloud-data-updated", load);
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.removeEventListener("runmate:cloud-data-updated", load);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const raceResultsByDate = groupRaceResultsByDate(raceResults);
  const days = groupByDay(items);
  const dashboard = buildDashboard(items);
  const pTarget = proteinTargetGrams(profile);

  const filteredDays = days.filter((day) => {
    if (activeFilter === "all") return true;
    if (activeFilter === "run") {
      const workouts = day.items.filter((i) => i.type === "workout");
      return workouts.some((w) => isRun(w));
    }
    if (activeFilter === "meal") {
      return day.items.some((i) => i.type === "meal");
    }
    if (activeFilter === "strength") {
      const strengths = day.items.filter((i) => i.type === "strength");
      const workouts = day.items.filter((i) => i.type === "workout");
      return (
        strengths.length > 0 ||
        workouts.some((w) => !isRun(w) && !isWalk(w) && (w.data as WorkoutAnalysis)?.extracted?.workoutKind === "strength")
      );
    }
    if (activeFilter === "pain") {
      return day.items.some((i) => i.type === "pain");
    }
    return true;
  });

  return (
    <AppShell title="Report" subtitle="บันทึกสะสมรายวัน">
      {loading ? (
        <section className="card p-5 text-sm text-slate-500">กำลังโหลดข้อมูล...</section>
      ) : error ? (
        <section className="card p-5 text-sm text-red-500">{error}</section>
      ) : days.length === 0 ? (
        <section className="card space-y-1 p-5 text-sm text-slate-600">
          <p className="font-bold text-[#17201d]">ยังไม่มีข้อมูลสำหรับสรุปผล</p>
          <p>เริ่มจากอัปโหลดผลนอนหรือผลวิ่งวันนี้</p>
        </section>
      ) : (
        <>
          <WeeklyDashboard dashboard={dashboard} proteinTarget={pTarget} />

          {/* Filter Pills */}
          <div className="flex flex-wrap gap-1.5 my-4">
            {(
              [
                { id: "all", label: "ทั้งหมด" },
                { id: "run", label: "วิ่ง" },
                { id: "meal", label: "อาหาร" },
                { id: "strength", label: "เวท" },
                { id: "pain", label: "เจ็บ" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-all border ${activeFilter === f.id ? "bg-[#17201d] text-white border-[#17201d]" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {activeFilter === "pain" && (
            <div className="mb-4">
              <PainHistoryCompactList items={items} />
            </div>
          )}

          {filteredDays.length === 0 ? (
            <section className="card p-5 text-sm text-slate-500 text-center">ไม่พบรายการที่ตรงกับตัวกรอง</section>
          ) : (
            filteredDays.map((day) => (
              <DayCard key={day.date} day={day} raceResults={raceResultsByDate.get(day.date) ?? []} proteinTarget={pTarget} />
            ))
          )}
        </>
      )}
    </AppShell>
  );
}

function WeeklyDashboard({ dashboard, proteinTarget }: { dashboard: Dashboard; proteinTarget: number }) {
  return (
    <section className="card space-y-4 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">7 Day Overview</p>
        <h2 className="mt-1 text-xl font-bold text-[#17201d]">ภาพรวมสัปดาห์ล่าสุด</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{dashboard.coachNote}</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DashboardMetric label="Run volume" value={dashboard.runKm > 0 ? formatDistanceKm(dashboard.runKm) : "-"} sub={`${dashboard.runSessions} sessions`} />
        <DashboardMetric label="Longest run" value={dashboard.longestRunKm != null ? formatDistanceKm(dashboard.longestRunKm) : "-"} sub="last 7 days" />
        <DashboardMetric label="Readiness avg" value={dashboard.avgReadiness != null ? formatScore(dashboard.avgReadiness) : "-"} sub={dashboard.readinessTrend} />
        <DashboardMetric label="Sleep avg" value={dashboard.avgSleepHours != null ? `${formatDecimal(dashboard.avgSleepHours)} h` : "-"} sub={`${dashboard.sleepCount} nights`} />
        <DashboardMetric label="Meal kcal avg" value={dashboard.avgMealCalories != null ? formatCalories(dashboard.avgMealCalories) : "-"} sub="ประเมินจากรูปอาหาร" />
        <DashboardMetric label="Protein avg / day" value={dashboard.avgMealProtein != null ? formatMacro(dashboard.avgMealProtein) : "-"} sub={`target ${proteinTarget} g`} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <DashboardMetric label="Weight" value={dashboard.latestBody?.weightKg != null ? `${formatDecimal(dashboard.latestBody.weightKg)} kg` : "-"} compact />
        <DashboardMetric label="Body fat" value={formatPercent(dashboard.latestBody?.bodyFatPct)} compact />
        <DashboardMetric label="Muscle" value={dashboard.latestBody?.muscleKg != null ? `${formatDecimal(dashboard.latestBody.muscleKg)} kg` : "-"} compact />
      </div>
    </section>
  );
}

function DashboardMetric({ label, value, sub, compact = false }: { label: string; value: string; sub?: string; compact?: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`${compact ? "text-base" : "text-xl"} mt-1 font-bold text-[#17201d]`}>{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

// ─── Day card ─────────────────────────────────────────────────────────────────

function DayCard({ day, raceResults, proteinTarget }: { day: DayGroup; raceResults: RaceResult[]; proteinTarget: number }) {
  const [expanded, setExpanded] = useState(false);

  const sleeps = day.items.filter((i) => i.type === "sleep");
  const workouts = day.items.filter((i) => i.type === "workout");
  const meals = day.items.filter((i) => i.type === "meal");
  const summaries = day.items.filter((i) => i.type === "summary");
  const bodies = day.items.filter((i) => i.type === "body");
  const pains = day.items.filter((i) => i.type === "pain");
  const strengths = day.items.filter((i) => i.type === "strength");

  const readiness = getReadiness(sleeps);
  const totalKm = getTotalKm(workouts);
  const runKm = getTotalKm(workouts.filter(isRun));
  const walkKm = getTotalKm(workouts.filter(isWalk));
  const mealCount = meals.length;
  const mealNutrition = getMealNutrition(meals);
  const totalMealImages = meals.reduce((sum, item) => {
    const d = extractMealData(item);
    return sum + (d.imageCount ?? d.entries?.length ?? 1);
  }, 0);
  const proteinStatus = mealNutrition.proteinG != null ? calcProteinStatus(mealNutrition.proteinG, proteinTarget) : null;

  return (
    <section className="card overflow-hidden">
      <button
        type="button"
        className="w-full cursor-pointer p-4 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">{day.label}</p>
            <div className="mt-2 space-y-1.5">
              {/* Activity row (Row 1) */}
              <div className="flex flex-wrap gap-1.5">
                {sleeps.length > 0 && <Badge icon="🌙" label="นอน" />}
                {workouts.some((w) => isRun(w)) && <Badge icon="🏃" label={runKm ? formatDistanceKm(runKm) : "วิ่ง"} color="green" />}
                {raceResults.length > 0 && <Badge icon="🏁" label="Race Result" color="green" />}
                {(strengths.length > 0 || workouts.some((w) => !isRun(w) && !isWalk(w) && (w.data as WorkoutAnalysis)?.extracted?.workoutKind === "strength")) && (
                  <Badge icon="🏋️" label="เวท" color="blue" />
                )}
                {pains.length > 0 && (
                  <Badge icon="🩹" label={`เจ็บ ${(pains[0].data as any)?.painLevel ?? (pains[0] as any)?.painLevel}/10`} color="red" />
                )}
                {workouts.some((w) => isWalk(w)) && <Badge icon="🚶" label={walkKm ? formatDistanceKm(walkKm) : "เดิน"} />}
                {bodies.length > 0 && <Badge icon="⚖️" label="ชั่งน้ำหนัก" />}
                {summaries.length > 0 && sleeps.length === 0 && workouts.length === 0 && pains.length === 0 && strengths.length === 0 && (
                  <Badge icon="💬" label="บทสนทนา" />
                )}
              </div>
              {/* Nutrition row (Row 2) */}
              {mealCount > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  <Badge icon="🍽" label={`${mealCount} มื้อ`} color="orange" />
                  {totalMealImages > mealCount && <Badge icon="" label={`${totalMealImages} รูป`} color="orange" />}
                  {mealNutrition.caloriesKcal != null && <Badge icon="🔥" label={formatCalories(mealNutrition.caloriesKcal)} color="orange" />}
                  {mealNutrition.proteinG != null && (
                    <Badge icon="💪" label={`${mealNutrition.proteinG}/${proteinTarget}g`} color="orange" />
                  )}
                  {proteinStatus && mealNutrition.proteinG != null && (
                    <Badge icon="" label={proteinStatus} color="orange" />
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            {readiness !== null && (
              <div>
                <p className={`text-2xl font-bold ${readinessColor(readiness)}`}>{readiness}</p>
                <p className="text-xs text-slate-400">readiness</p>
              </div>
            )}
            {readiness === null && totalKm !== null && (
              <div>
                <p className="text-2xl font-bold text-[#42677f]">{formatDecimal(totalKm)}</p>
                <p className="text-xs text-slate-400">km</p>
              </div>
            )}
            {readiness === null && totalKm === null && mealCount > 0 && (
              <p className="text-sm text-slate-500">{mealCount} มื้อ</p>
            )}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-100 space-y-3 px-4 pb-4 pt-3">
          {sleeps.map((item) => <SleepDetail key={item.id} item={item} />)}
          {pains.map((item) => <PainDetail key={item.id} item={item} />)}
          {strengths.map((item) => <StrengthDetail key={item.id} item={item} />)}
          {raceResults.map((result) => <RaceResultDetail key={result.id ?? `${result.raceDate}-${result.raceName}`} result={result} />)}
          {workouts.map((item) => <WorkoutDetail key={item.id} item={item} />)}
          {mealCount > 0 && <MealNutritionDaySummary summary={mealNutrition} mealCount={mealCount} proteinTarget={proteinTarget} />}
          {meals.map((item) => <MealDetail key={item.id} item={item} />)}
          {bodies.map((item) => <BodyDetail key={item.id} item={item} />)}
          {summaries.length > 0 && (sleeps.length + workouts.length + meals.length + bodies.length + pains.length + strengths.length === 0) &&
            summaries.map((item) => <SummaryDetail key={item.id} item={item} />)}
          {summaries.length > 0 && (sleeps.length + workouts.length + meals.length + bodies.length + pains.length + strengths.length > 0) && (
            <div className="rounded-2xl bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-500 mb-1">บันทึกโค้ช ({summaries.length})</p>
              {summaries.slice(0, 2).map((item) => (
                <p key={item.id} className="text-sm text-slate-700 leading-5 mt-1">
                  {truncate(getSummaryText(item), 120)}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function RaceResultDetail({ result }: { result: RaceResult }) {
  return (
    <div className="rounded-2xl bg-[#e7efea] p-4">
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#2a5a39]">🏁 Race Day</p>
      <p className="font-bold text-[#17201d]">{result.raceName || "Race Result"}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Time" value={result.actualTime ?? "-"} />
        <Metric label="Pace" value={result.actualPace ? `${result.actualPace}/km` : "-"} />
        <Metric label="Result" value={raceResultLabel(result.goalResult)} />
      </div>
      {result.coachSummary ? <p className="mt-3 text-sm leading-6 text-slate-700">{truncate(result.coachSummary, 160)}</p> : null}
    </div>
  );
}

// ─── Detail panels ────────────────────────────────────────────────────────────

function SleepDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as SleepAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};

  return (
    <div className="rounded-2xl bg-[#e7efea] p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#42677f] mb-2">🌙 การนอน</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {coach.readinessScore != null && (
          <Metric label="Readiness" value={formatScore(coach.readinessScore)} sub={coach.readinessLabel} />
        )}
        {ext.sleepScore != null && <Metric label="Sleep score" value={formatScore(ext.sleepScore)} />}
        {ext.sleepDuration && <Metric label="ระยะเวลา" value={formatDuration(ext.sleepDuration)} />}
        {ext.hrv != null && <Metric label="HRV" value={formatScore(ext.hrv)} sub="ms" />}
        {ext.restingHR != null && <Metric label="Resting HR" value={formatScore(ext.restingHR)} sub="bpm" />}
      </div>
      {coach.aiSummary && <p className="text-sm leading-6 text-slate-700">{coach.aiSummary}</p>}
      {coach.todayRecommendation && (
        <p className="mt-2 text-sm font-bold text-[#17201d]">→ {coach.todayRecommendation}</p>
      )}
    </div>
  );
}

function WorkoutDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as WorkoutAnalysis;
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};
  const icon =
    ext.workoutKind === "outdoor_run" || ext.workoutKind === "treadmill" ? "🏃"
    : ext.workoutKind === "walk" ? "🚶"
    : ext.workoutKind === "cycling" ? "🚴"
    : "💪";
  const kindLabel =
    ext.workoutKind === "outdoor_run" ? "วิ่งนอก"
    : ext.workoutKind === "treadmill" ? "วิ่งเครื่อง"
    : ext.workoutKind === "walk" ? "เดิน"
    : ext.workoutKind === "cycling" ? "ปั่นจักรยาน"
    : ext.workoutKind === "strength" ? "เวท"
    : "ออกกำลังกาย";

  const hasAnyMetric = ext.distanceKm != null || ext.duration || ext.avgHR != null || ext.calories != null;

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#42677f] mb-2">{icon} {kindLabel}</p>
      {hasAnyMetric && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {ext.distanceKm != null && <Metric label="ระยะทาง" value={formatDistanceKm(ext.distanceKm)} />}
          {ext.duration && <Metric label="เวลา" value={formatDuration(ext.duration)} />}
          {ext.avgPace && ext.avgPace !== ":" && <Metric label="Pace" value={formatPace(ext.avgPace)} sub="/km" />}
          {ext.avgHR != null && <Metric label="Avg HR" value={formatScore(ext.avgHR)} sub="bpm" />}
          {ext.maxHR != null && <Metric label="Max HR" value={formatScore(ext.maxHR)} sub="bpm" />}
          {ext.calories != null && <Metric label="Calories" value={formatScore(ext.calories)} sub="Cal" />}
          {ext.sweatLossMl != null && <Metric label="เหงื่อ" value={formatScore(ext.sweatLossMl)} sub="ml" />}
        </div>
      )}
      {coach.workoutSummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(formatSummaryText(coach.workoutSummary), 160)}</p>
      )}
    </div>
  );
}

function MealDetail({ item }: { item: LocalHistoryItem }) {
  const d = extractMealData(item);
  const n = normalizeMealNutrition(d as unknown as Record<string, unknown>);
  const foodNames = d.detectedFoods?.map((food) => food.name).filter(Boolean).join(", ") || d?.extracted?.detectedFood || "";
  const note = d.trainingFit?.coachNote ?? d.coachNote ?? d?.coach?.aiSummary ?? d?.coach?.suggestion ?? "";
  const imageCount = d.imageCount ?? d.entries?.length ?? 1;

  return (
    <div className="rounded-2xl bg-orange-50 p-4">
      <div className="flex items-center gap-1.5 mb-1">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-600">🍱 มื้ออาหาร</p>
        {imageCount > 1 && (
          <span className="rounded-full bg-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-700">{imageCount} รูป</span>
        )}
      </div>
      {foodNames && (
        <p className="text-sm font-bold text-[#17201d] mb-2">{truncate(foodNames, 100)}</p>
      )}
      <div className="grid grid-cols-4 gap-2 mb-2">
        <Metric label="kcal" value={formatCalories(n.caloriesKcal)} />
        <Metric label="Protein" value={formatMacro(n.proteinG)} />
        <Metric label="Carbs" value={formatMacro(n.carbsG)} />
        <Metric label="Fat" value={formatMacro(n.fatG)} />
      </div>
      <p className="mb-2 text-xs text-orange-700">ประเมินจากรูปอาหาร</p>
      {note && (
        <p className="text-sm leading-6 text-slate-700">{truncate(note, 140)}</p>
      )}
    </div>
  );
}

function MealNutritionDaySummary({ summary, mealCount, proteinTarget }: { summary: MealNutritionSummary; mealCount: number; proteinTarget: number }) {
  const status = summary.proteinG != null ? calcProteinStatus(summary.proteinG, proteinTarget) : null;
  const coachNote = summary.proteinG != null ? proteinCoachNote(summary.proteinG, proteinTarget) : null;
  const remaining = summary.proteinG != null && summary.proteinG < proteinTarget ? proteinTarget - summary.proteinG : null;

  return (
    <div className="rounded-2xl bg-orange-50 p-4 space-y-3">
      <p className="text-xs font-bold uppercase tracking-wide text-orange-600">Nutrition Summary</p>

      {/* Protein — hero metric */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">💪 Protein</p>
          <p className="text-xl font-bold leading-tight text-[#17201d]">
            {summary.proteinG != null ? `${summary.proteinG} / ${proteinTarget} g` : "-"}
          </p>
          {remaining != null && (
            <p className="mt-0.5 text-xs text-slate-500">ยังขาดอีก {remaining} g</p>
          )}
        </div>
        {status && (
          <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-orange-600">{status}</span>
        )}
      </div>

      {/* Secondary macros */}
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Calories" value={formatCalories(summary.caloriesKcal)} />
        <Metric label="Carbs" value={formatMacro(summary.carbsG)} />
        <Metric label="Fat" value={formatMacro(summary.fatG)} />
      </div>

      <p className="text-xs text-orange-700">{mealCount} มื้อ · ประเมินจากรูปอาหาร</p>
      {coachNote && <p className="text-sm font-semibold text-[#17201d]">{coachNote}</p>}
    </div>
  );
}

function BodyDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as { extracted?: Record<string, unknown>; coach?: Record<string, unknown> };
  const ext = d?.extracted ?? {};
  const coach = d?.coach ?? {};

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#42677f] mb-2">⚖️ ส่วนประกอบร่างกาย</p>
      <div className="grid grid-cols-3 gap-2 mb-2">
        {ext.weightKg != null && <Metric label="น้ำหนัก" value={`${formatDecimal(ext.weightKg)} kg`} />}
        {ext.bodyFatPercent != null && <Metric label="ไขมัน" value={formatPercent(ext.bodyFatPercent)} />}
        {ext.skeletalMuscleKg != null && <Metric label="กล้ามเนื้อ" value={`${formatDecimal(ext.skeletalMuscleKg)} kg`} />}
      </div>
      {typeof coach.bodySummary === "string" && coach.bodySummary && (
        <p className="text-sm leading-6 text-slate-700">{truncate(coach.bodySummary, 140)}</p>
      )}
    </div>
  );
}

function SummaryDetail({ item }: { item: LocalHistoryItem }) {
  const d = item.data as DailySummary & { coachMessage?: string };

  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[#6f8fa6] mb-1">💬 บันทึกโค้ช</p>
      <p className="text-sm leading-6 text-slate-700 whitespace-pre-line">
        {truncate(d?.coachMessage ?? d?.overallSummary ?? "", 240)}
      </p>
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function PainDetail({ item }: { item: LocalHistoryItem }) {
  const painLog = item.data as PainLog;
  if (!painLog) return null;

  const SIDE_LABELS: Record<string, string> = {
    left: "ซ้าย", right: "ขวา", both: "ทั้งสองข้าง", unknown: "ไม่แน่ใจ",
  };
  const STARTED_LABELS: Record<string, string> = {
    before_run: "ก่อนวิ่ง", during_run: "ระหว่างวิ่ง",
    after_run: "หลังวิ่ง", next_morning: "เช้าวันถัดไป", unknown: "ไม่แน่ใจ",
  };
  const PAIN_TYPE_LABELS: Record<string, string> = {
    dull: "ตื้อๆ", sharp: "แหลมคม", tight: "ตึง",
    numb: "ชา", swollen: "บวม", other: "อื่นๆ",
  };
  const PAINFUL_WHEN_LABELS: Record<string, string> = {
    walking: "เดิน", stairs: "ขึ้นลงบันได", running: "วิ่ง",
    weight_bearing: "รับน้ำหนัก", stretching: "ยืด", resting: "นั่งพัก",
  };
  const TRI_LABELS: Record<string, string> = { yes: "ใช่", no: "ไม่มี", unknown: "ไม่แน่ใจ" };
  const BEAR_LABELS: Record<string, string> = { yes: "รับได้ปกติ", no: "รับไม่ได้", unknown: "ไม่แน่ใจ" };

  function riskBadgeClass(risk: string) {
    if (risk === "high")   return "bg-red-100 text-red-700";
    if (risk === "medium") return "bg-amber-100 text-amber-700";
    return "bg-[#e7efea] text-[#2a5a39]";
  }
  function cardClass(risk: string) {
    if (risk === "high")   return "border-red-200 bg-red-50";
    if (risk === "medium") return "border-amber-200 bg-amber-50";
    return "border-[#d9e8df] bg-[#f5faf7]";
  }
  function riskLabel(risk: string) {
    if (risk === "high")   return "ต้องระวังสูง";
    if (risk === "medium") return "ควรระวัง";
    return "ระดับต่ำ";
  }
  function impactLabel(impact: string) {
    if (impact === "seek_professional") return "ปรึกษาผู้เชี่ยวชาญก่อนซ้อม";
    if (impact === "rest")              return "พักทั้งหมด";
    if (impact === "reduce_load")       return "ลดปริมาณซ้อม 24–48 ชม.";
    return "Easy run ได้ถ้าอาการไม่แย่ลง";
  }

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${cardClass(painLog.riskLevel)}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">🩹 อาการเจ็บ</p>
          <h4 className="mt-1 text-sm font-bold text-[#17201d]">
            {painLog.painLocation}
            {painLog.painSide && painLog.painSide !== "unknown" && (
              <span className="ml-1 text-xs font-normal text-slate-500">
                ({SIDE_LABELS[painLog.painSide] ?? painLog.painSide})
              </span>
            )}
          </h4>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-bold ${painLog.riskLevel === "high" ? "text-red-600" : painLog.riskLevel === "medium" ? "text-amber-600" : "text-[#2a5a39]"}`}>
            {painLog.painLevel}<span className="text-xs font-normal">/10</span>
          </p>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${riskBadgeClass(painLog.riskLevel)}`}>
            {riskLabel(painLog.riskLevel)}
          </span>
        </div>
      </div>

      <div className="rounded-xl bg-white/60 px-3 py-2">
        <p className="text-[10px] text-slate-400">ผลกระทบต่อการซ้อม</p>
        <p className="text-xs font-semibold text-[#17201d]">{impactLabel(painLog.trainingImpact)}</p>
      </div>

      {painLog.coachAdvice && (
        <p className="text-xs leading-5 text-slate-700">{painLog.coachAdvice}</p>
      )}

      {Array.isArray(painLog.redFlags) && painLog.redFlags.length > 0 && (
        <div className="rounded-xl bg-red-100/70 px-3 py-2 space-y-0.5">
          <p className="text-[10px] font-bold text-red-700">สัญญาณที่ควรระวัง</p>
          {painLog.redFlags.map((f, i) => (
            <p key={i} className="text-[10px] text-red-600">· {f}</p>
          ))}
        </div>
      )}

      <div className="text-[10px] text-slate-500 space-y-1 pt-1 border-t border-slate-100/50">
        <p>
          <span className="font-semibold">เริ่มเจ็บตอน:</span> {STARTED_LABELS[painLog.startedWhen] ?? painLog.startedWhen} |{" "}
          <span className="font-semibold">บวม/แดง:</span> {TRI_LABELS[painLog.swellingOrRedness] ?? painLog.swellingOrRedness} |{" "}
          <span className="font-semibold">รับน้ำหนัก:</span> {BEAR_LABELS[painLog.canBearWeight] ?? painLog.canBearWeight}
        </p>
        {Array.isArray(painLog.painType) && painLog.painType.length > 0 && (
          <p>
            <span className="font-semibold">ลักษณะ:</span> {painLog.painType.map((t) => PAIN_TYPE_LABELS[t] ?? t).join(", ")}
          </p>
        )}
        {Array.isArray(painLog.painfulWhen) && painLog.painfulWhen.length > 0 && (
          <p>
            <span className="font-semibold">เจ็บเมื่อ:</span> {painLog.painfulWhen.map((w) => PAINFUL_WHEN_LABELS[w] ?? w).join(", ")}
          </p>
        )}
        {painLog.notes && (
          <p>
            <span className="font-semibold">หมายเหตุ:</span> {painLog.notes}
          </p>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <Link
          href={`/pain/${encodeURIComponent(item.id)}`}
          className="text-xs text-[#42677f] font-semibold hover:underline"
        >
          ดูรายละเอียด →
        </Link>
        <span className="text-slate-300">|</span>
        <Link
          href={`/pain?from=${encodeURIComponent(item.id)}`}
          className="text-xs text-[#42677f] font-semibold hover:underline"
        >
          อัปเดตอาการ
        </Link>
      </div>
    </div>
  );
}

function StrengthDetail({ item }: { item: LocalHistoryItem }) {
  const log = item.data as StrengthLog;
  if (!log) return null;

  const INTENSITY_LABELS: Record<string, string> = {
    easy: "เบา (Easy)",
    moderate: "ปานกลาง (Moderate)",
    hard: "หนัก (Hard)"
  };

  const SOURCE_LABELS: Record<string, string> = {
    saved_routine: "เทมเพลตที่บันทึกไว้",
    ai_prescription: "AI ปรับแนะนำประจำวัน",
    custom: "ปรับแต่งเอง"
  };

  return (
    <div className="rounded-2xl bg-blue-50/70 border border-blue-100 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-blue-600">🏋️ เวทเทรนนิ่ง</p>
          <h4 className="mt-1 text-sm font-bold text-[#17201d]">
            {log.routineName}
          </h4>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-bold text-slate-700">{log.durationMin} นาที</p>
          <span className="text-[10px] text-slate-500">{SOURCE_LABELS[log.source] ?? log.source}</span>
        </div>
      </div>

      {log.coachReason && (
        <div className="rounded-xl bg-white/60 p-2 text-xs text-slate-700">
          <p className="font-semibold text-slate-800">คำแนะนำจากโค้ช AI:</p>
          <p>{log.coachReason}</p>
        </div>
      )}

      {Array.isArray(log.exercises) && log.exercises.length > 0 && (
        <div className="space-y-1 bg-white/40 p-2 rounded-xl">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">ท่าที่ฝึกซ้อม</p>
          <div className="divide-y divide-slate-100/50">
            {log.exercises.map((ex, i) => (
              <div key={i} className="flex justify-between py-1 text-xs text-slate-700">
                <span className="font-medium">{ex.name}</span>
                <span className="text-slate-500 shrink-0 ml-2">
                  {ex.sets} เซต × {ex.reps} ครั้ง {ex.durationSec ? `(${ex.durationSec} วิ)` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {log.notes && (
        <p className="text-xs text-slate-600 italic">หมายเหตุ: {log.notes}</p>
      )}

      <div className="text-[10px] text-slate-400">
        ความเหนื่อย: {INTENSITY_LABELS[log.intensity] ?? log.intensity}
      </div>
    </div>
  );
}

function Badge({ icon, label, color }: { icon?: string; label: string; color?: "green" | "blue" | "orange" | "red" }) {
  const bg =
    color === "green" ? "bg-[#e7efea] text-[#2a5a39]"
    : color === "blue" ? "bg-blue-50 text-blue-700"
    : color === "orange" ? "bg-orange-50 text-orange-700"
    : color === "red" ? "bg-red-50 text-red-700"
    : "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${bg}`}>
      {icon ? `${icon} ` : null}{label}
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-white p-2.5 text-center">
      <p className="text-xs text-slate-400 truncate">{label}</p>
      <p className="mt-0.5 text-sm font-bold leading-tight">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

// ─── Data helpers ─────────────────────────────────────────────────────────────

type DayGroup = { date: string; label: string; items: LocalHistoryItem[] };

type Dashboard = {
  runKm: number;
  runSessions: number;
  longestRunKm: number | null;
  avgReadiness: number | null;
  readinessTrend: string;
  avgSleepHours: number | null;
  sleepCount: number;
  latestBody: { weightKg: number | null; bodyFatPct: number | null; muscleKg: number | null } | null;
  avgMealCalories: number | null;
  avgMealProtein: number | null;
  coachNote: string;
};

type MealNutritionSummary = {
  caloriesKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
};

function buildDashboard(items: LocalHistoryItem[]): Dashboard {
  const cutoff = dateKeyBefore(7);
  const recent = items.filter((item) => item.createdAt.slice(0, 10) >= cutoff);
  const runs = recent.filter((item) => item.type === "workout" && isRun(item));
  const sleeps = recent.filter((item) => item.type === "sleep");
  const meals = recent.filter((item) => item.type === "meal");
  const bodies = items.filter((item) => item.type === "body");
  const mealDays = groupByDay(meals);
  const mealSummaries = mealDays.map((day) => getMealNutrition(day.items));
  const calorieDays = mealSummaries.map((summary) => summary.caloriesKcal).filter((value): value is number => value != null);
  const proteinDays = mealSummaries.map((summary) => summary.proteinG).filter((value): value is number => value != null);

  const runKm = getTotalKm(runs) ?? 0;
  const longestRunKm = runs.reduce<number | null>((max, item) => {
    const km = Number((item.data as WorkoutAnalysis)?.extracted?.distanceKm);
    if (!(km > 0)) return max;
    return Math.max(max ?? 0, km);
  }, null);

  const readinessValues = sleeps
    .map((item) => (item.data as SleepAnalysis)?.coach?.readinessScore)
    .filter((score): score is number => score != null && score > 0);
  const avgReadiness = readinessValues.length
    ? Math.round(readinessValues.reduce((sum, score) => sum + score, 0) / readinessValues.length)
    : null;

  const sleepHours = sleeps
    .map((item) => parseSleepHours((item.data as SleepAnalysis)?.extracted?.sleepDuration))
    .filter((hours): hours is number => hours != null);
  const avgSleepHours = sleepHours.length
    ? Math.round((sleepHours.reduce((sum, hours) => sum + hours, 0) / sleepHours.length) * 10) / 10
    : null;

  return {
    runKm: Math.round(runKm * 10) / 10,
    runSessions: runs.length,
    longestRunKm,
    avgReadiness,
    readinessTrend: readinessLabel(readinessValues),
    avgSleepHours,
    sleepCount: sleepHours.length,
    latestBody: bodies[0] ? bodySummary(bodies[0]) : null,
    avgMealCalories: calorieDays.length ? average(calorieDays) : null,
    avgMealProtein: proteinDays.length ? average(proteinDays) : null,
    coachNote: dashboardNote({ runKm, runSessions: runs.length, avgReadiness, avgSleepHours, longestRunKm }),
  };
}

function groupByDay(items: LocalHistoryItem[]): DayGroup[] {
  const map = new Map<string, LocalHistoryItem[]>();
  for (const item of items) {
    const date = item.createdAt.slice(0, 10);
    const list = map.get(date) ?? [];
    list.push(item);
    map.set(date, list);
  }
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayItems]) => ({
      date,
      label: formatDayLabel(date),
      items: dayItems.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    }));
}

function groupRaceResultsByDate(results: RaceResult[]) {
  const map = new Map<string, RaceResult[]>();
  for (const result of results) {
    if (!result.raceDate) continue;
    const list = map.get(result.raceDate) ?? [];
    list.push(result);
    map.set(result.raceDate, list);
  }
  return map;
}

function raceResultLabel(value: RaceResult["goalResult"]) {
  if (value === "achieved") return "Achieved";
  if (value === "missed") return "Missed";
  if (value === "completed") return "Completed";
  return "Race";
}

function formatDayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  return new Intl.DateTimeFormat("th-TH", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(d);
}

function getReadiness(sleeps: LocalHistoryItem[]): number | null {
  for (const item of sleeps) {
    const score = (item.data as SleepAnalysis)?.coach?.readinessScore;
    if (score != null && score > 0) return score;
  }
  return null;
}

function getTotalKm(workouts: LocalHistoryItem[]): number | null {
  let total = 0;
  let found = false;
  for (const item of workouts) {
    const km = Number((item.data as WorkoutAnalysis)?.extracted?.distanceKm);
    if (km > 0) { total += km; found = true; }
  }
  return found ? total : null;
}

function getMealNutrition(meals: LocalHistoryItem[]): MealNutritionSummary {
  const totals = {
    caloriesKcal: sumNutrition(meals, "caloriesKcal"),
    proteinG: sumNutrition(meals, "proteinG"),
    carbsG: sumNutrition(meals, "carbsG"),
    fatG: sumNutrition(meals, "fatG"),
  };
  return totals;
}

function proteinTargetGrams(profile: UserProfile | null): number {
  if (profile?.proteinTargetG && profile.proteinTargetG > 0) return Math.round(profile.proteinTargetG);
  if (profile?.weightKg && profile.weightKg > 0) return Math.round(profile.weightKg * 1.6);
  return 90;
}

function calcProteinStatus(actual: number, target: number): string {
  const pct = actual / target;
  if (pct < 0.7) return "น้อยไป";
  if (pct < 0.9) return "ใกล้ถึง";
  if (pct <= 1.2) return "ดี";
  return "เกินเป้า";
}

function proteinCoachNote(actual: number, target: number): string {
  const remaining = target - actual;
  if (remaining <= 0) return "โปรตีนวันนี้ถึงเป้าแล้ว ช่วยเรื่องฟื้นตัวได้ดี";
  return `วันนี้โปรตีนยังขาดประมาณ ${remaining} g เพิ่มโปรตีนอีกมื้อเล็ก ๆ ได้`;
}

function sumNutrition(meals: LocalHistoryItem[], key: keyof MealAnalysis["nutrition"]): number | null {
  let total = 0;
  let found = false;
  for (const meal of meals) {
    const d = extractMealData(meal);
    const n = normalizeMealNutrition(d as unknown as Record<string, unknown>);
    const value = n[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }
  return found ? Math.round(total) : null;
}

function average(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isRun(item: LocalHistoryItem): boolean {
  const kind = (item.data as WorkoutAnalysis)?.extracted?.workoutKind;
  return kind === "outdoor_run" || kind === "treadmill";
}

function isWalk(item: LocalHistoryItem): boolean {
  const kind = (item.data as WorkoutAnalysis)?.extracted?.workoutKind;
  return kind === "walk";
}

function getSummaryText(item: LocalHistoryItem): string {
  const d = item.data as DailySummary & { coachMessage?: string; overallSummary?: string };
  return d?.coachMessage ?? d?.overallSummary ?? "";
}

function readinessColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 65) return "text-[#42677f]";
  if (score >= 50) return "text-amber-600";
  return "text-red-500";
}

function truncate(text: string, max: number): string {
  if (!text) return "";
  const firstLine = text.split("\n").find((l) => l.trim()) ?? text;
  const clean = firstLine.replace(/\*+/g, "").replace(/^[-•]\s*/, "").trim();
  return clean.length > max ? clean.slice(0, max) + "…" : clean;
}

// ─── Data subscription ────────────────────────────────────────────────────────

function dateKeyBefore(days: number): string {
  const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
  return new Date(Date.now() + TZ_OFFSET_MS - days * 86_400_000).toISOString().slice(0, 10);
}

function parseSleepHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*h/i);
  const minMatch = value.match(/(\d+)\s*m/i);
  if (hourMatch || minMatch) {
    return Number(hourMatch?.[1] ?? 0) + Number(minMatch?.[1] ?? 0) / 60;
  }
  const thaiHour = value.match(/(\d+(?:\.\d+)?)\s*ชม/);
  const thaiMin = value.match(/(\d+)\s*น/);
  if (thaiHour || thaiMin) {
    return Number(thaiHour?.[1] ?? 0) + Number(thaiMin?.[1] ?? 0) / 60;
  }
  return null;
}

function readinessLabel(values: number[]): string {
  if (values.length < 2) return "need more data";
  const latest = values[0];
  const previousAvg = values.slice(1).reduce((sum, score) => sum + score, 0) / (values.length - 1);
  const diff = Math.round(latest - previousAvg);
  if (diff >= 5) return `up ${diff}`;
  if (diff <= -5) return `down ${Math.abs(diff)}`;
  return "stable";
}

function bodySummary(item: LocalHistoryItem): Dashboard["latestBody"] {
  const ext = (item.data as BodyCompositionAnalysis)?.extracted;
  return {
    weightKg: ext?.weightKg ?? null,
    bodyFatPct: ext?.bodyFatPercent ?? null,
    muscleKg: ext?.skeletalMuscleKg ?? null,
  };
}

function dashboardNote(input: {
  runKm: number;
  runSessions: number;
  avgReadiness: number | null;
  avgSleepHours: number | null;
  longestRunKm: number | null;
}): string {
  if (input.runSessions === 0 && input.avgReadiness == null) {
    return "ยังไม่มีข้อมูล 7 วันที่พอสำหรับสรุปแนวโน้ม ลอง import Samsung Health หรือ upload workout/sleep เพิ่มก่อนครับ";
  }
  const parts: string[] = [];
  if (input.runSessions > 0) parts.push(`วิ่ง ${Math.round(input.runKm * 10) / 10} km จาก ${input.runSessions} sessions`);
  if (input.longestRunKm != null) parts.push(`longest ${input.longestRunKm.toFixed(1)} km`);
  if (input.avgReadiness != null) parts.push(`readiness เฉลี่ย ${input.avgReadiness}`);
  if (input.avgSleepHours != null) parts.push(`นอนเฉลี่ย ${input.avgSleepHours.toFixed(1)} ชม.`);
  return parts.join(" · ");
}

function PainHistoryCompactList({ items }: { items: LocalHistoryItem[] }) {
  const painItems = items.filter((i) => i.type === "pain");
  if (painItems.length === 0) {
    return (
      <div className="card p-5 text-sm text-slate-500 text-center">ไม่พบประวัติอาการเจ็บ</div>
    );
  }

  const RISK_LABELS: Record<string, string> = { high: "สูง", medium: "กลาง", low: "ต่ำ" };
  const RISK_COLORS: Record<string, string> = {
    high: "text-red-600 bg-red-50 border-red-100",
    medium: "text-amber-600 bg-amber-50 border-amber-100",
    low: "text-green-600 bg-green-50 border-green-100"
  };

  const IMPACT_LABELS: Record<string, string> = {
    seek_professional: "ปรึกษาผู้เชี่ยวชาญ",
    rest: "พักทั้งหมด",
    reduce_load: "ลดปริมาณซ้อม",
    run_ok_easy: "วิ่งเบาได้"
  };

  return (
    <section className="card p-5 space-y-4 bg-white">
      <div>
        <h3 className="text-base font-bold text-[#17201d]">ประวัติอาการเจ็บ</h3>
        <p className="text-xs text-slate-500 mt-0.5">ประวัติและคำแนะนำผลกระทบการซ้อมสะสม</p>
      </div>
      <div className="overflow-x-auto -mx-5 px-5">
        <table className="w-full text-left border-collapse text-xs min-w-[450px]">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="py-2.5 font-semibold">วันที่</th>
              <th className="py-2.5 font-semibold">ตำแหน่ง</th>
              <th className="py-2.5 font-semibold text-center">ระดับ</th>
              <th className="py-2.5 font-semibold text-center">ความเสี่ยง</th>
              <th className="py-2.5 font-semibold">ผลกระทบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {painItems.map((item) => {
              const p = item.data as PainLog;
              const dateStr = item.createdAt.slice(0, 10);
              const formattedDate = new Date(dateStr).toLocaleDateString("th-TH", {
                day: "numeric", month: "short"
              });
              return (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="py-2.5 font-medium text-slate-500">{formattedDate}</td>
                  <td className="py-2.5 font-bold text-slate-700">🩹 {p.painLocation}</td>
                  <td className="py-2.5 font-bold text-center text-slate-800">{p.painLevel}/10</td>
                  <td className="py-2.5 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${RISK_COLORS[p.riskLevel] || "bg-slate-50 text-slate-500"}`}>
                      {RISK_LABELS[p.riskLevel] || p.riskLevel}
                    </span>
                  </td>
                  <td className="py-2.5 text-slate-600 font-medium">{IMPACT_LABELS[p.trainingImpact] || p.trainingImpact}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
