"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RaceCountdownCard } from "@/components/RaceCountdownCard";
import { RaceGoalForm } from "@/components/RaceGoalForm";
import { TrainingPhaseCard } from "@/components/TrainingPhaseCard";
import { WeeklyPlanCard } from "@/components/WeeklyPlanCard";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { loadRaceResults } from "@/lib/raceResults";
import { deleteRaceGoalAndPlan, loadActiveRaceGoalAndPlan, saveRaceGoalAndPlan } from "@/lib/raceStorage";
import type { RaceGoal, RacePlan, RaceResult, WeekWorkout } from "@/types/race";

export default function RaceGoalPage() {
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);

  useEffect(() => {
    Promise.all([loadActiveRaceGoalAndPlan(), loadRaceResults(10)]).then(([result, completed]) => {
      if (result.ok) {
        setGoal(result.goal);
        setPlan(result.plan);
      }
      if (completed.ok) {
        setRaceResults(completed.results);
        if (process.env.NODE_ENV === "development") {
          console.info("[race-history-debug]", { raceResultsCount: completed.results.length, ids: completed.results.map((r) => r.id) });
        }
      }
      setMounted(true);
    });
  }, []);

  async function refreshPlan() {
    if (!goal) return;
    setRefreshing(true);
    setRefreshError(false);
    try {
      const context = await buildCoachContextFromSupabase();
      const res = await fetch("/api/generate-race-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, context }),
      });
      if (!res.ok) throw new Error("api error");
      const result = (await res.json()) as { data: RacePlan };
      if (!result.data) throw new Error("no data");
      const saveResult = await saveRaceGoalAndPlan(goal, result.data);
      if (!saveResult.ok) throw new Error(saveResult.error);
      invalidateCoachCache();
      setPlan(result.data);
    } catch {
      setRefreshError(true);
    }
    setRefreshing(false);
  }

  async function resetAll() {
    if (goal?.id) await deleteRaceGoalAndPlan(goal.id);
    invalidateCoachCache({ clearChat: true });
    setGoal(null);
    setPlan(null);
  }

  if (!mounted) return null;

  return (
    <AppShell title="Race Goal" subtitle="วางแผนจากวันนี้ไปถึงวันแข่ง">
      {!goal || !plan ? (
        <>
          {raceResults.length > 0 ? <LatestRacePrompt result={raceResults[0]} /> : null}
          <RaceGoalForm onCreated={(nextGoal, nextPlan) => { setGoal(nextGoal); setPlan(nextPlan); }} />
        </>
      ) : (
        <>
          <RaceCountdownCard goal={goal} phase={plan.currentPhase} />
          <PlanAtGlance plan={plan} />
          {plan.todayWorkout ? <TodayWorkoutCard workout={normalizeForDisplay(plan.todayWorkout)} /> : null}
          {plan.weeklyPlan?.length ? <ActionableWeekCard workouts={plan.weeklyPlan.map(normalizeForDisplay)} /> : null}

          <section className="card space-y-3 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold">ภาพรวมแผน</h2>
              <button
                type="button"
                disabled={refreshing}
                onClick={refreshPlan}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-[#42677f] transition-colors hover:bg-slate-100 disabled:opacity-40"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}>
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
                {refreshing ? "กำลัง generate..." : "รีเฟรชแผน"}
              </button>
            </div>
            {refreshError ? <p className="text-xs text-red-500">Generate ไม่สำเร็จ ลองใหม่อีกครั้ง</p> : null}
            <p className="text-sm leading-6 text-slate-600">{sanitizePaceInText(plan.planSummary)}</p>
            {plan.phases?.map((phase) => <TrainingPhaseCard key={phase.name} phase={phase} />)}
          </section>

          {!plan.weeklyPlan?.length && plan.weeks?.[0] ? <WeeklyPlanCard week={plan.weeks[0]} /> : null}
          <button className="btn-secondary w-full" onClick={() => void resetAll()}>
            สร้างแผนใหม่
          </button>
        </>
      )}
      {raceResults.length > 0 ? <CompletedRaceSection results={raceResults} /> : null}
    </AppShell>
  );
}

function LatestRacePrompt({ result }: { result: RaceResult }) {
  return (
    <div className="card space-y-2 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">Race completed</p>
      <p className="text-base font-bold text-[#17201d]">{result.raceName ?? "Race"} · {result.raceDistance}</p>
      {result.actualTime ? (
        <p className="text-sm text-slate-500">
          {result.actualTime}{result.actualPace ? ` · ${result.actualPace}/km` : ""} ·{" "}
          <span className="font-semibold text-[#2a5a39]">{resultBadge(result.goalResult)}</span>
        </p>
      ) : null}
      <p className="text-sm text-slate-400">พร้อมตั้ง Race Goal ถัดไปหรือยัง?</p>
    </div>
  );
}

function PlanAtGlance({ plan }: { plan: RacePlan }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Plan at a glance</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <MiniMetric label="เหลือ" value={plan.weeksRemaining != null ? `${plan.weeksRemaining} wk` : `${plan.totalWeeks} wk`} />
        <MiniMetric label="เริ่มแผน" value={formatShortDate(plan.planStartDate)} />
        <MiniMetric label="เฟส" value={plan.currentPhase || "-"} />
      </div>
      {plan.safetyNotes ? <p className="mt-4 text-xs leading-5 text-slate-500">{sanitizePaceInText(plan.safetyNotes)}</p> : null}
    </section>
  );
}

function TodayWorkoutCard({ workout }: { workout: WeekWorkout }) {
  return (
    <section className="card border border-[#b7dcc4] bg-[#f4fbf6] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#2a5a39]">วันนี้ซ้อมอะไร</p>
          <h2 className="mt-2 text-2xl font-bold text-[#14211c]">{workout.workoutType}</h2>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-[#2a5a39] shadow-sm">
          {formatWorkoutAmount(workout)}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-slate-700">{workout.description}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <MiniMetric label="Pace" value={safeValue(workout.targetPace)} />
        <MiniMetric label="HR / Effort" value={safeValue(workout.targetHR)} />
      </div>
      {workout.purpose ? <InfoLine label="ทำไปเพื่อ" value={workout.purpose} /> : null}
      {workout.adjustment ? <InfoLine label="ปรับยังไง" value={workout.adjustment} /> : null}
    </section>
  );
}

function ActionableWeekCard({ workouts }: { workouts: WeekWorkout[] }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">This week</p>
      <h2 className="mt-2 text-xl font-bold text-[#17201d]">แผน 7 วันแบบลงมือทำได้</h2>
      <div className="mt-4 space-y-3">
        {workouts.map((workout, index) => (
          <div key={`${workout.day}-${workout.workoutType}-${index}`} className="rounded-2xl bg-white/80 p-4 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#6f8fa6]">{workout.day}</p>
                <p className="mt-1 font-bold text-[#17201d]">{workout.workoutType}</p>
              </div>
              <span className="rounded-full bg-[#eef4ef] px-3 py-1 text-xs font-bold text-[#2a5a39]">
                {formatWorkoutAmount(workout)}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-600">{workout.description}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric label="Pace" value={safeValue(workout.targetPace)} />
              <MiniMetric label="HR / Effort" value={safeValue(workout.targetHR)} />
            </div>
            {workout.purpose ? <InfoLine label="Purpose" value={workout.purpose} /> : null}
            {workout.adjustment ? <InfoLine label="Adjustment" value={workout.adjustment} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CompletedRaceSection({ results }: { results: RaceResult[] }) {
  return (
    <section className="card space-y-3 p-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#6f8fa6]">Race History</p>
        <h2 className="mt-2 text-xl font-bold text-[#17201d]">รายการแข่งที่บันทึกแล้ว</h2>
      </div>
      <div className="space-y-3">
        {results.map((result) => (
          <div key={result.id ?? `${result.raceDate}-${result.raceName}`} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-[#17201d]">{result.raceName || "Race"}</p>
                <p className="text-xs text-slate-500">{result.raceDate} · {result.raceDistance}</p>
              </div>
              <span className="rounded-full bg-[#e7efea] px-3 py-1 text-xs font-bold text-[#2a5a39]">
                {resultBadge(result.goalResult)}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <MiniMetric label="Time" value={result.actualTime ?? "-"} />
              <MiniMetric label="Pace" value={result.actualPace ? `${result.actualPace}/km` : "-"} />
            </div>
            {result.coachSummary ? <p className="mt-3 text-sm leading-6 text-slate-700">{result.coachSummary}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/80 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-bold text-[#17201d]">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-3 text-xs leading-5 text-slate-500">
      <span className="font-bold text-slate-600">{label}: </span>
      {value}
    </p>
  );
}

function formatWorkoutAmount(workout: WeekWorkout) {
  if (workout.distanceKm != null) return `${workout.distanceKm} km`;
  if (workout.durationMin != null) return `${workout.durationMin} min`;
  return "พัก";
}

function safeValue(value: string | null | undefined) {
  if (!value || /n\/a/i.test(value)) return "-";
  return value;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "-";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function resultBadge(value: RaceResult["goalResult"]) {
  if (value === "achieved") return "Achieved";
  if (value === "missed") return "Missed";
  if (value === "completed") return "Completed";
  return "Race Result";
}

// ── Display-layer normalization (applied to stored plans before render) ──────

function normalizeForDisplay(workout: WeekWorkout): WeekWorkout {
  const type = workout.workoutType ?? "";
  const isRestOnly = /^(rest(\s+day)?|พัก)(\s*[\/,+]|$)/i.test(type.trim());
  const isRecovery =
    !isRestOnly &&
    /^(recovery|active\s+recovery|recovery\s+walk|mobility|shakeout|post.?race|walk|ฟื้น)/i.test(type.trim());
  const isStrength = /^(strength|cross.?training|gym|core)/i.test(type.trim());

  let targetPace = workout.targetPace;
  let targetHR = workout.targetHR;

  if (isRestOnly || isStrength) {
    // Always show natural label — never show a running pace or "-"
    targetPace = "ไม่เน้น pace";
    targetHR = "ไม่เน้น HR";
  } else if (isRecovery) {
    // Pace: round to 30 s if numeric; null → natural label
    if (targetPace && /\d+:\d{2}/.test(targetPace)) {
      targetPace = roundPaceRangeDisplay(targetPace, 30);
    } else {
      targetPace = "ไม่เน้น pace";
    }
    // HR: keep AI value if sensible; otherwise default zone
    if (!targetHR || /n\/a/i.test(targetHR)) {
      targetHR = "โซน 1–2 · หายใจสบาย";
    }
  } else if (targetPace && /\d+:\d{2}/.test(targetPace)) {
    // Running workouts: round to nearest 10 s
    targetPace = roundPaceRangeDisplay(targetPace, 10);
  }

  return { ...workout, targetPace, targetHR };
}

// Round a pace range string like "6:57–8:01/km" to nearest toNearest seconds
function roundPaceRangeDisplay(raw: string, toNearest = 10): string {
  const rangeM = raw.match(/(\d+:\d{2})\s*[–\-]\s*(\d+:\d{2})/);
  if (rangeM) {
    return `${roundPaceSecDisplay(rangeM[1], toNearest)}–${roundPaceSecDisplay(rangeM[2], toNearest)}/km`;
  }
  const singleM = raw.match(/(\d+:\d{2})/);
  if (singleM) return `${roundPaceSecDisplay(singleM[1], toNearest)}/km`;
  return raw;
}

function roundPaceSecDisplay(pace: string, toNearest: number): string {
  const m = pace.match(/^(\d+):(\d{2})$/);
  if (!m) return pace;
  const total = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const rounded = Math.round(total / toNearest) * toNearest;
  return `${Math.floor(rounded / 60)}:${(rounded % 60).toString().padStart(2, "0")}`;
}

// Sanitize free-form AI text: round any MM:SS–MM:SS pace ranges to nearest 10 s
function sanitizePaceInText(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(
    /(\d{1,2}:\d{2})\s*[–\-]\s*(\d{1,2}:\d{2})(\/km|\/กม\.?|(?:\s*น\.\/กม\.?))?/g,
    (_full, lo: string, hi: string) => `${roundPaceSecDisplay(lo, 10)}–${roundPaceSecDisplay(hi, 10)}/km`,
  );
}
