"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { RaceGoalForm } from "@/components/RaceGoalForm";
import { RaceCountdownCard } from "@/components/RaceCountdownCard";
import { TrainingPhaseCard } from "@/components/TrainingPhaseCard";
import { WeeklyPlanCard } from "@/components/WeeklyPlanCard";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { buildCoachContextFromSupabase } from "@/lib/buildCoachContext";
import { loadRaceResults } from "@/lib/raceResults";
import { deleteRaceGoalAndPlan, loadActiveRaceGoalAndPlan, saveRaceGoalAndPlan } from "@/lib/raceStorage";
import type { RaceGoal, RacePlan, RaceResult } from "@/types/race";

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
      if (completed.ok) setRaceResults(completed.results);
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
      const result = await res.json() as { data: RacePlan };
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
        <RaceGoalForm onCreated={(nextGoal, nextPlan) => { setGoal(nextGoal); setPlan(nextPlan); }} />
      ) : (
        <>
          <RaceCountdownCard goal={goal} phase={plan.currentPhase} />
          <section className="card space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">ภาพรวมแผน</h2>
              <button
                type="button"
                disabled={refreshing}
                onClick={refreshPlan}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-[#42677f] hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}>
                  <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
                </svg>
                {refreshing ? "กำลัง generate…" : "รีเฟรชแผน"}
              </button>
            </div>
            {refreshError && (
              <p className="text-xs text-red-500">Generate ไม่สำเร็จ ลองใหม่อีกครั้ง</p>
            )}
            <p className="text-sm leading-6 text-slate-600">{plan.planSummary}</p>
            {plan.phases?.map((phase) => <TrainingPhaseCard key={phase.name} phase={phase} />)}
          </section>
          {plan.weeks?.[0] && <WeeklyPlanCard week={plan.weeks[0]} />}
          <button className="btn-secondary w-full" onClick={() => void resetAll()}>
            สร้างแผนใหม่
          </button>
        </>
      )}
      {raceResults.length > 0 ? <CompletedRaceSection results={raceResults} /> : null}
    </AppShell>
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
              <MiniResult label="Time" value={result.actualTime ?? "-"} />
              <MiniResult label="Pace" value={result.actualPace ? `${result.actualPace}/km` : "-"} />
            </div>
            {result.coachSummary ? <p className="mt-3 text-sm leading-6 text-slate-700">{result.coachSummary}</p> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function MiniResult({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-bold text-[#17201d]">{value}</p>
    </div>
  );
}

function resultBadge(value: RaceResult["goalResult"]) {
  if (value === "achieved") return "Achieved";
  if (value === "missed") return "Missed";
  if (value === "completed") return "Completed";
  return "Race Result";
}
