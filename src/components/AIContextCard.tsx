"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import type { UserProfile } from "@/types/profile";

export function AIContextCard() {
  const [context, setContext] = useState<CoachContext>(emptyContext);
  const [checkInTime, setCheckInTime] = useState<string>("");

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

  useEffect(() => {
    const handleInit = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      };
      try {
        const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(now);
        const day = parts.find((p) => p.type === "day")?.value || "";
        const month = parts.find((p) => p.type === "month")?.value || "";
        const year = parts.find((p) => p.type === "year")?.value || "";
        const hour = parts.find((p) => p.type === "hour")?.value || "";
        const minute = parts.find((p) => p.type === "minute")?.value || "";
        setCheckInTime(`${day}/${month}/${year} ${hour}:${minute} (Bangkok UTC+7)`);
      } catch {
        setCheckInTime(now.toLocaleString("th-TH"));
      }
    };
    const timer = setTimeout(handleInit, 0);
    return () => clearTimeout(timer);
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

  const profile = context.profile as UserProfile | null;

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

        <div className="grid grid-cols-2 gap-2">
          <ContextMetric label="บันทึกประวัติ (7 วัน)" value={`${context.sleep7d.length + context.workouts7d.length} รายการ`} sub={`ซ้อม ${context.workouts7d.length} · นอน ${context.sleep7d.length}`} />
          <ContextMetric label="เวลาเช็คอิน" value={checkInTime || "กำลังโหลด..."} />
        </div>

        <ContextBlock title="นอนล่าสุด">
          {sleepLatest
            ? `${sleepLatest.date}: ${sleepLatest.durationH ?? "-"}, sleep score ${sleepLatest.score ?? "-"}, readiness ${sleepLatest.readiness ?? "-"}`
            : "ยังไม่มีข้อมูลการนอนใน 7 วันล่าสุด"}
        </ContextBlock>

        {context.sleep7d.length > 0 ? (
          <ContextBlock title="ค่าเฉลี่ยการนอน (7 วันล่าสุด)">
            {(() => {
              const scores = context.sleep7d.map((s) => s.score).filter((s): s is number => s != null);
              const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
              const durations = context.sleep7d.map((s) => {
                if (!s.durationH) return null;
                const match = s.durationH.match(/(\d+(\.\d+)?)/);
                return match ? parseFloat(match[1]) : null;
              }).filter((n): n is number => n != null);
              const avgDur = durations.length ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : null;
              
              const parts = [
                context.avgReadiness != null && `ความพร้อมเฉลี่ย (Readiness) ${context.avgReadiness}%`,
                avgScore != null && `คะแนนการนอนเฉลี่ย ${avgScore}`,
                avgDur != null && `เวลานอนเฉลี่ย ${avgDur} ชม.`,
              ].filter(Boolean);
              return parts.length ? parts.join(" · ") : "ไม่มีข้อมูลสำหรับคำนวณค่าเฉลี่ย";
            })()}
          </ContextBlock>
        ) : null}

        <ContextBlock title="โปรไฟล์">
          {context.profile
            ? profileLine(context.profile)
            : "ยังไม่มีโปรไฟล์นักวิ่ง"}
        </ContextBlock>

        {profile && (
          Number(profile.proteinTargetG) ||
          Number(profile.carbTargetRestDayG) ||
          Number(profile.carbTargetEasyDayG) ||
          Number(profile.carbTargetHardDayG) ||
          profile.nutritionGoal ||
          profile.nutritionNotes
        ) ? (
          <ContextBlock title="เป้าหมายสารอาหาร">
            <div className="space-y-1">
              {profile.nutritionGoal && (
                <p>เป้าหมายโภชนาการ: <span className="font-semibold">{String(profile.nutritionGoal)}</span></p>
              )}
              {(profile.proteinTargetG || profile.carbTargetRestDayG || profile.carbTargetEasyDayG || profile.carbTargetHardDayG) && (
                <p>
                  {[
                    profile.proteinTargetG && `โปรตีน ${profile.proteinTargetG}g`,
                    profile.carbTargetRestDayG && `คาร์บวันพัก ${profile.carbTargetRestDayG}g`,
                    profile.carbTargetEasyDayG && `คาร์บวันซ้อมเบา ${profile.carbTargetEasyDayG}g`,
                    profile.carbTargetHardDayG && `คาร์บวันซ้อมหนัก ${profile.carbTargetHardDayG}g`,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              {profile.nutritionNotes && (
                <p className="text-xs text-slate-500 mt-1">โน้ต: {String(profile.nutritionNotes)}</p>
              )}
            </div>
          </ContextBlock>
        ) : null}

        <ContextBlock title="ซ้อมล่าสุด">{workoutLine}</ContextBlock>
        <ContextBlock title="วิ่งล่าสุด">{runLine}</ContextBlock>

        {context.recentPainLogs && context.recentPainLogs.length > 0 ? (
          <ContextBlock title="บันทึกอาการเจ็บ (7 วันล่าสุด)">
            <ul className="list-disc pl-4 space-y-1">
              {context.recentPainLogs.map((p) => (
                <li key={p.id}>
                  <strong>{p.date}</strong>: {p.painLocation} เลเวล {p.painLevel}/10
                  <span className="ml-1.5 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600 font-medium">
                    {p.riskLevel === "high" ? "ความเสี่ยงสูง" : p.riskLevel === "medium" ? "ความเสี่ยงปานกลาง" : "ความเสี่ยงต่ำ"}
                  </span>
                  {p.coachAdvice ? ` · ${p.coachAdvice}` : ""}
                </li>
              ))}
            </ul>
          </ContextBlock>
        ) : null}

        {context.recentRaceResults && context.recentRaceResults.length > 0 ? (
          <ContextBlock title="ประวัติการแข่ง (Race Results)">
            <ul className="list-disc pl-4 space-y-1">
              {context.recentRaceResults.map((r) => (
                <li key={r.id}>
                  <strong>{r.raceDate} - {r.raceName || "Race"}</strong>: {r.raceDistance || ""} กม.
                  {r.targetTime ? ` (เป้าหมาย: ${r.targetTime})` : ""} ·
                  จริง: {r.actualTime || "ไม่ระบุ"}
                  {r.goalResult ? ` (${r.goalResult})` : ""}
                </li>
              ))}
            </ul>
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

function ContextBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50/80 p-3">
      <p className="text-xs font-bold text-[#6f8fa6]">{title}</p>
      <div className="mt-1 text-sm leading-6 text-slate-700">{children}</div>
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
  recentPainLogs: [],
};
