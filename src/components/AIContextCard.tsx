"use client";

import { useEffect, useMemo, useState } from "react";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { getTodayPlannedWorkout } from "@/lib/todayPlanning";
import type { RunMateRecoverySystem } from "@/lib/recoverySystem";
import type { UserProfile } from "@/types/profile";
import type { RacePlan, WeekWorkout } from "@/types/race";
import { todayBangkokDateKey } from "@/lib/date";

export function AIContextCard() {
  const [context, setContext] = useState<CoachContext>(emptyContext);
  const [checkInTime, setCheckInTime] = useState<string>("");
  // Computed once on mount so useMemo can depend on them without impure Date.now() calls.
  const [todayDateKey] = useState(() => todayBangkokDateKey());

  useEffect(() => {
    let alive = true;
    async function load() {
      const next = await buildCoachContextFromSupabase();
      if (alive) setContext(next);
    }
    void load();
    window.addEventListener("runmate:cloud-data-updated", load);
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("runmate:cloud-data-updated", load);
      window.removeEventListener("focus", load);
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
  const hasUsefulData =
    context.sleep7d.length > 0 ||
    context.workouts7d.length > 0 ||
    context.recentPainLogs.length > 0 ||
    Boolean(context.raceGoal) ||
    Boolean(context.nutritionToday) ||
    Boolean(context.latestBody);
  const sourceSummary = buildSourceSummary(context);
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
  const racePlan = context.racePlan as RacePlan | null;

  const todayRacePlanWorkout = useMemo((): WeekWorkout | null => {
    return getTodayPlannedWorkout(context);
  }, [context]);

  const isPlanStale = useMemo(() => {
    if (!racePlan?.weeklyPlan?.length || !racePlan.planStartDate) return false;
    const startMs = Date.parse(`${racePlan.planStartDate}T12:00:00+07:00`);
    const todayMs = Date.parse(`${todayDateKey}T12:00:00+07:00`);
    if (Number.isNaN(startMs) || Number.isNaN(todayMs)) return false;
    return Math.round((todayMs - startMs) / 86_400_000) >= racePlan.weeklyPlan.length;
  }, [racePlan, todayDateKey]);

  return (
    <details className="group rounded-3xl border border-[var(--border-warm)] bg-[var(--surface)]/75 px-4 py-3 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--foreground)]">
            โค้ชใช้ข้อมูลล่าสุดจาก Report
          </p>
          <p className="mt-0.5 text-xs text-[var(--muted-text)]">
            {sourceSummary}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary-strong)] group-open:hidden">ดูบริบท</span>
        <span className="hidden shrink-0 rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--muted-text)] group-open:inline">ปิด</span>
      </summary>

      <div className="mt-3 space-y-2">
        {!hasUsefulData ? (
          <div className="rounded-2xl bg-amber-50/80 p-3 text-sm leading-6 text-amber-700">
            <p className="font-bold">โค้ชยังมีข้อมูลน้อย</p>
            <p>ลอง Upload ผลวิ่ง อาหาร หรือ Sleep score เพื่อให้คำแนะนำแม่นขึ้น</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--primary-soft)] p-3 text-sm leading-6 text-[var(--foreground)]">
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--primary-strong)]">อ้างอิงจาก</p>
            <p className="mt-1">{sourceSummary}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ContextMetric
            label="เป้าหมายแข่ง"
            value={context.raceName ?? (context.raceGoal ? "มีเป้าหมายแข่ง" : "ยังไม่มี")}
            sub={
              context.raceGoal
                ? [context.raceDistance, context.daysUntilRace != null ? `อีก ${context.daysUntilRace} วัน` : null].filter(Boolean).join(" · ") || undefined
                : undefined
            }
          />
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
              const parts = [
                context.avgReadiness != null && `ความพร้อมเฉลี่ย (Readiness) ${context.avgReadiness}%`,
                avgScore != null && `คะแนนการนอนเฉลี่ย ${avgScore}`,
                context.sleepAvg7dText && `เวลานอนเฉลี่ย ${context.sleepAvg7dText}`,
                context.sleepNightCount7d > 0 && `จาก ${context.sleepNightCount7d} คืน`,
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

        {context.raceGoal && (todayRacePlanWorkout || isPlanStale) && (
          <ContextBlock title="ซ้อมตามแผนวันนี้">
            {isPlanStale ? (
              <p className="font-medium text-amber-600">แผนนี้อาจเกินช่วงซ้อมแล้ว — ไปที่ Race Goal เพื่อรีเฟรชแผน</p>
            ) : todayRacePlanWorkout ? (
              <div className="space-y-0.5">
                <p className="font-semibold">{todayRacePlanWorkout.workoutType}</p>
                {[
                  todayRacePlanWorkout.distanceKm != null && `${todayRacePlanWorkout.distanceKm} กม.`,
                  todayRacePlanWorkout.targetPace && `Pace ${todayRacePlanWorkout.targetPace}`,
                  todayRacePlanWorkout.targetHR && `HR ${todayRacePlanWorkout.targetHR}`,
                ].filter(Boolean).length > 0 && (
                  <p>{[
                    todayRacePlanWorkout.distanceKm != null && `${todayRacePlanWorkout.distanceKm} กม.`,
                    todayRacePlanWorkout.targetPace && `Pace ${todayRacePlanWorkout.targetPace}`,
                    todayRacePlanWorkout.targetHR && `HR ${todayRacePlanWorkout.targetHR}`,
                  ].filter(Boolean).join(" · ")}</p>
                )}
                {todayRacePlanWorkout.description && (
                  <p className="mt-1 text-xs text-slate-500">{todayRacePlanWorkout.description}</p>
                )}
              </div>
            ) : null}
          </ContextBlock>
        )}

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
    <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
      <p className="text-xs text-[var(--muted-text)]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[var(--foreground)]">{value}</p>
      {sub ? <p className="text-xs text-[var(--muted-text)]">{sub}</p> : null}
    </div>
  );
}

function ContextBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
      <p className="text-xs font-bold text-[var(--recovery-blue)]">{title}</p>
      <div className="mt-1 text-sm leading-6 text-[var(--foreground)]">{children}</div>
    </div>
  );
}

function buildSourceSummary(context: CoachContext) {
  const items: string[] = [];

  // Readiness is shown in the full ReadinessCard below — omit it from compact summary.
  if (context.sleepAvg7dText) {
    items.push(`นอนล่าสุด ${context.sleepAvg7dText}`);
  }

  if (context.activePain) {
    const latestPain = context.latestPain ?? context.recentPainLogs[0];
    if (latestPain) {
      items.push(`เจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`);
    }
  } else if (context.painResolved) {
    const latestPain = context.latestPain ?? context.recentPainLogs[0];
    const loc = latestPain?.painLocation;
    items.push(loc && loc !== "ไม่ระบุ" ? `เจ็บ${loc}หายแล้ว` : "หายเจ็บแล้ว");
  }

  if (context.raceGoal && context.daysUntilRace != null) {
    items.push(`แข่งอีก ${context.daysUntilRace} วัน`);
  }

  if (context.runDays7d > 0) {
    items.push(`วิ่ง ${context.runDays7d} วันใน 7 วันล่าสุด`);
  }

  if (context.nutritionToday) {
    items.push(`อาหารวันนี้ ${context.nutritionToday.mealCount} มื้อ`);
  }

  const finalItems = items.slice(0, 4);

  return finalItems.length
    ? finalItems.join(" · ")
    : "โค้ชยังมีข้อมูลน้อย ลอง Upload ผลวิ่ง อาหาร หรือ Sleep score เพื่อให้คำแนะนำแม่นขึ้น";
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
  sleepAvg7dHours: null,
  sleepAvg7dText: null,
  sleepNightCount7d: 0,
  latestSleepDurationText: null,
  latestSleepScore: null,
  latestEnergyScore: null,
  latestSleepDateKey: null,
  workouts7d: [],
  hasWorkoutToday: false,
  todayWorkouts: [],
  todayPrimaryWorkout: null,
  nutritionToday: null,
  nutrition7d: [],
  mealsToday: [],
  latestCompletedRace: null,
  recentRaceResults: [],
  latestHealthCheck: null,
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
  latestPain: null,
  recentMaxPain: null,
  activePain: false,
  recentPainHistory: false,
  painResolved: false,
  nutritionBalanceToday: null,
  readinessV2: null,
  recoverySystem: null as unknown as RunMateRecoverySystem,
};


