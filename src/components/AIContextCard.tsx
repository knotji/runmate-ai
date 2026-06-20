"use client";

import { useMemo, useSyncExternalStore } from "react";
import { buildCoachContext, type CoachContext } from "@/lib/buildCoachContext";

let contextCache: { raw: string; value: CoachContext } | null = null;

export function AIContextCard() {
  const context = useCoachContextSnapshot();
  const sleepLatest = context.sleep7d[0];
  const lastWorkout = context.workouts7d[0];
  const runLine = context.lastRun
    ? `${context.lastRun.date}: ${context.lastRun.km.toFixed(2)} km, ${context.lastRun.durationMin} min${context.lastRun.avgHR ? `, HR ${context.lastRun.avgHR}` : ""}${context.lastRun.pace ? `, pace ${context.lastRun.pace}` : ""}`
    : "ยังไม่มี run ใน 7 วันล่าสุด";

  const workoutLine = useMemo(() => {
    if (!lastWorkout) return "ยังไม่มี workout ใน 7 วันล่าสุด";
    const parts = [
      ...lastWorkout.runs.map((run) => `run ${run.km.toFixed(2)} km`),
      ...lastWorkout.walks.map((walk) => `walk ${walk.km ? `${walk.km.toFixed(2)} km` : `${walk.durationMin} min`}`),
      ...lastWorkout.other.map((item) => `${item.label} ${item.durationMin} min`),
    ];
    return `${lastWorkout.date}: ${parts.join(" · ") || "workout"}`;
  }, [lastWorkout]);

  return (
    <details className="card group p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#6f8fa6]">ข้อมูลประวัติซ้อม</p>
          <h2 className="mt-1 text-lg font-bold text-[#17201d]">ข้อมูลที่ใช้ประกอบการวิเคราะห์</h2>
        </div>
        <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500 group-open:hidden">เปิดดู</span>
        <span className="hidden rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500 group-open:inline">ปิด</span>
      </summary>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <ContextMetric label="Race" value={context.raceGoal ? String(context.raceGoal.raceName ?? "Active") : "None"} />
          <ContextMetric label="Race status" value={context.activeRaceStatus} />
          <ContextMetric label="Run 7d" value={`${context.totalRunKm} km`} sub={`${context.runDays7d} run days`} />
          <ContextMetric label="Readiness" value={context.avgReadiness != null ? String(context.avgReadiness) : "-"} sub="7d avg" />
        </div>

        <ContextBlock title="Sleep ล่าสุด">
          {sleepLatest
            ? `${sleepLatest.date}: ${sleepLatest.durationH ?? "-"}, score ${sleepLatest.score ?? "-"}, readiness ${sleepLatest.readiness ?? "-"}`
            : "ยังไม่มี sleep data ใน 7 วันล่าสุด"}
        </ContextBlock>

        <ContextBlock title="Profile">
          {context.profile
            ? profileLine(context.profile)
            : "ยังไม่มี runner profile active"}
        </ContextBlock>

        <ContextBlock title="Workout ล่าสุด">{workoutLine}</ContextBlock>
        <ContextBlock title="Run ล่าสุด">{runLine}</ContextBlock>

        <ContextBlock title="Body ล่าสุด">
          {context.latestBody
            ? `weight ${context.latestBody.weightKg ?? "-"} kg · fat ${context.latestBody.bodyFatPct ?? "-"}% · muscle ${context.latestBody.muscleKg ?? "-"} kg`
            : "ยังไม่มี body composition"}
        </ContextBlock>

        {context.contextNotes.length > 0 && (
          <div className="rounded-2xl bg-amber-50 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Context notes</p>
            <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-700">
              {context.contextNotes.map((note) => (
                <li key={note}>- {note}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

function ContextMetric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#17201d]">{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

function ContextBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-[#6f8fa6]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{children}</p>
    </div>
  );
}

function profileLine(profile: Record<string, unknown>) {
  const parts = [
    profile.displayName && `name ${profile.displayName}`,
    profile.easyPace && `easy ${profile.easyPace}`,
    profile.easyHrCap && `HR cap ${profile.easyHrCap}`,
    profile.maxHr && `maxHR ${profile.maxHr}`,
    profile.mainGoal && `goal ${profile.mainGoal}`,
    profile.injuryNotes && `injury ${profile.injuryNotes}`,
    profile.coachTone && `tone ${profile.coachTone}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : JSON.stringify(profile);
}

function useCoachContextSnapshot() {
  return useSyncExternalStore(
    (onStoreChange) => {
      window.addEventListener("storage", onStoreChange);
      window.addEventListener("runmate:data-updated", onStoreChange);
      return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener("runmate:data-updated", onStoreChange);
      };
    },
    readCoachContext,
    () => emptyContext,
  );
}

function readCoachContext() {
  const raw = [
    "runmate.profile",
    "runmate.raceGoal",
    "runmate.racePlan",
    "runmate.history.sleep",
    "runmate.history.workout",
    "runmate.history.body",
  ].map((key) => localStorage.getItem(key) ?? "").join("|");

  if (contextCache?.raw === raw) return contextCache.value;
  const value = buildCoachContext();
  contextCache = { raw, value };
  return value;
}

const emptyContext: CoachContext = {
  profile: null,
  raceGoal: null,
  racePlan: null,
  activeRaceStatus: "none",
  sleep7d: [],
  avgReadiness: null,
  workouts7d: [],
  totalRunKm: 0,
  totalSessions: 0,
  runDays7d: 0,
  longestRun7dKm: null,
  lastWorkoutDate: null,
  lastRun: null,
  latestBody: null,
  todayDate: "",
  contextNotes: [],
};
