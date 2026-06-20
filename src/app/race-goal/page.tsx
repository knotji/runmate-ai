"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { RaceGoalForm } from "@/components/RaceGoalForm";
import { RaceCountdownCard } from "@/components/RaceCountdownCard";
import { TrainingPhaseCard } from "@/components/TrainingPhaseCard";
import { WeeklyPlanCard } from "@/components/WeeklyPlanCard";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import type { RaceGoal, RacePlan } from "@/types/race";

export default function RaceGoalPage() {
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      setGoal(readLocal("runmate.raceGoal"));
      setPlan(readLocal("runmate.racePlan"));
      setMounted(true);
    });
  }, []);

  async function refreshPlan() {
    if (!goal) return;
    setRefreshing(true);
    setRefreshError(false);
    try {
      const { buildCoachContext } = await import("@/lib/buildCoachContext");
      const context = buildCoachContext();
      const res = await fetch("/api/generate-race-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, context }),
      });
      if (!res.ok) throw new Error("api error");
      const result = await res.json() as { data: RacePlan };
      if (!result.data) throw new Error("no data");
      localStorage.setItem("runmate.racePlan", JSON.stringify(result.data));
      invalidateCoachCache();
      setPlan(result.data);
    } catch {
      setRefreshError(true);
    }
    setRefreshing(false);
  }

  function resetAll() {
    localStorage.removeItem("runmate.raceGoal");
    localStorage.removeItem("runmate.racePlan");
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
          <button className="btn-secondary w-full" onClick={resetAll}>
            สร้างแผนใหม่
          </button>
        </>
      )}
    </AppShell>
  );
}

function readLocal<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}
