"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";

export function AIContextCard() {
  const [context, setContext] = useState<CoachContext>(emptyContext);

  useEffect(() => {
    let alive = true;
    async function load() {
      const next = await buildCoachContextFromSupabase();
      if (alive) setContext(next);
    }
    void load();
    window.addEventListener("runmate:cloud-data-updated", load);
    return () => {
      alive = false;
      window.removeEventListener("runmate:cloud-data-updated", load);
    };
  }, []);

  const sleepLatest = context.sleep7d[0];
  const lastWorkout = context.workouts7d[0];
  const runLine = context.lastRun
    ? `${Number(context.lastRun.km).toFixed(2)} กม. เมื่อ ${context.lastRun.date}${context.lastRun.avgHR ? `, HR เฉลี่ย ${context.lastRun.avgHR}` : ""}${context.lastRun.pace ? `, pace ${context.lastRun.pace}` : ""}`
    : "ยังไม่มีวิ่งใน 7 วันล่าสุด";

  const workoutLine = useMemo(() => {
    if (!lastWorkout) return "ยังไม่มี workout ใน 7 วันล่าสุด";
    const parts = [
      ...lastWorkout.runs.map((run) => `วิ่ง ${Number(run.km).toFixed(2)} กม.`),
      ...lastWorkout.walks.map((walk) => `เดิน ${walk.km != null ? `${Number(walk.km).toFixed(2)} กม.` : `${walk.durationMin} นาที`}`),
      ...lastWorkout.other.map((item) => `${item.label} ${item.durationMin} นาที`),
    ];
    return `${lastWorkout.date}: ${parts.join(" · ") || "มี workout"}`;
  }, [lastWorkout]);

  return (
    <details className="group rounded-3xl bg-white/75 px-4 py-3 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#17201d]">
            โค้ชใช้ข้อมูลล่าสุดจากโปรไฟล์และประวัติซ้อม
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {context.raceGoal ? "มี Race Goal active" : `${context.runDays7d} วันวิ่งใน 7 วันล่าสุด`}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#e7efea] px-3 py-1.5 text-xs font-bold text-[#17201d] group-open:hidden">เปิดดู</span>
        <span className="hidden shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500 group-open:inline">ปิด</span>
      </summary>

      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <ContextMetric label="เป้าหมาย" value={context.raceGoal ? String(context.raceGoal.raceName ?? "มีเป้าหมายแข่ง") : "ยังไม่มี"} />
          <ContextMetric label="วิ่ง 7 วัน" value={`${context.totalRunKm} กม.`} sub={`${context.runDays7d} วัน`} />
        </div>

        <ContextBlock title="นอนล่าสุด">
          {sleepLatest
            ? `${sleepLatest.date}: ${sleepLatest.durationH ?? "-"}, sleep score ${sleepLatest.score ?? "-"}, readiness ${sleepLatest.readiness ?? "-"}`
            : "ยังไม่มีข้อมูลการนอนใน 7 วันล่าสุด"}
        </ContextBlock>

        <ContextBlock title="โปรไฟล์">
          {context.profile
            ? profileLine(context.profile)
            : "ยังไม่มีโปรไฟล์นักวิ่ง"}
        </ContextBlock>

        <ContextBlock title="ซ้อมล่าสุด">{workoutLine}</ContextBlock>
        <ContextBlock title="วิ่งล่าสุด">{runLine}</ContextBlock>
        {context.latestCompletedRace ? (
          <ContextBlock title="Race ล่าสุด">
            {`${context.latestCompletedRace.raceName ?? "Race"}: target ${context.latestCompletedRace.targetTime ?? "-"} · actual ${context.latestCompletedRace.actualTime ?? "-"} · ${context.latestCompletedRace.goalResult ?? "completed"}`}
          </ContextBlock>
        ) : null}

        {context.contextNotes.length > 0 && (
          <div className="rounded-2xl bg-amber-50/80 p-3">
            <p className="text-xs font-bold text-amber-700">ข้อควรระวังจากข้อมูล</p>
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
    <div className="rounded-2xl bg-slate-50/80 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#17201d]">{value}</p>
      {sub ? <p className="text-xs text-slate-400">{sub}</p> : null}
    </div>
  );
}

function ContextBlock({ title, children }: { title: string; children: string }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 p-3">
      <p className="text-xs font-bold text-[#6f8fa6]">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{children}</p>
    </div>
  );
}

function profileLine(profile: Record<string, unknown>) {
  const parts = [
    profile.displayName && `ชื่อ ${profile.displayName}`,
    profile.easyPace && `easy pace ${profile.easyPace}`,
    profile.easyHrCap && `คุม HR ${profile.easyHrCap}`,
    profile.mainGoal && `เป้าหมาย ${profile.mainGoal}`,
    profile.injuryNotes && `ข้อควรระวัง ${profile.injuryNotes}`,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "มีโปรไฟล์แล้ว แต่ข้อมูลหลักยังไม่ครบ";
}

const emptyContext: CoachContext = {
  profile: null,
  raceGoal: null,
  racePlan: null,
  activeRaceStatus: "none",
  activeRaceGoal: null,
  raceDate: null,
  raceDistance: null,
  raceName: null,
  daysUntilRace: null,
  isRaceToday: false,
  isRaceTomorrow: false,
  isRaceWeek: false,
  raceGoalType: null,
  targetTime: null,
  sleep7d: [],
  avgReadiness: null,
  workouts7d: [],
  nutritionToday: null,
  nutrition7d: [],
  latestCompletedRace: null,
  recentRaceResults: [],
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
