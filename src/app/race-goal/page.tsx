"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { RaceCountdownCard } from "@/components/RaceCountdownCard";
import { RaceGoalForm } from "@/components/RaceGoalForm";
import { LoadingButton } from "@/components/LoadingButton";
import { TrainingPhaseCard } from "@/components/TrainingPhaseCard";
import { WeeklyPlanCard } from "@/components/WeeklyPlanCard";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { formatRaceDisplayName } from "@/lib/date";
import { PAIN_RECOVERY_COPY, type PainRecoveryStatus } from "@/lib/painRecovery";
import { getTodayTrainingGuardrail } from "@/lib/trainingGuardrails";
import { buildDailyReadiness } from "@/lib/readiness/dailyReadiness";
import { buildTrainingPaceBands, getAllowedPaceBandsForReadiness, formatPaceRange } from "@/lib/training/trainingPaceBands";
import { buildHrGuidanceForContext } from "@/lib/hr/buildHrGuidance";
import type { PaceBandKey } from "@/lib/training/trainingPaceTypes";

import { loadHistoryItems } from "@/lib/cloudHistory";
import { suggestStrengthRoutine } from "@/lib/strengthRoutineSelect";
import { invalidateCoachCache } from "@/lib/invalidateCoachCache";
import { loadRaceResults } from "@/lib/raceResults";
import { deleteRaceGoalAndPlan, loadActiveRaceGoalAndPlan, saveRaceGoalAndPlan } from "@/lib/raceStorage";
import type { HistoryType } from "@/lib/localHistory";
import type { RaceGoal, RacePlan, RaceResult, WeekWorkout } from "@/types/race";

const RACE_PLAN_FRESHNESS_TYPES: HistoryType[] = ["sleep", "workout", "pain", "meal", "body", "summary", "strength"];

type PlanFreshness = {
  isStale: boolean;
  planTime: string | null;
  latestReportTime: string | null;
};

export default function RaceGoalPage() {
  const [goal, setGoal] = useState<RaceGoal | null>(null);
  const [plan, setPlan] = useState<RacePlan | null>(null);
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [raceResults, setRaceResults] = useState<RaceResult[]>([]);
  const [planFreshness, setPlanFreshness] = useState<PlanFreshness | null>(null);
  const [coachContext, setCoachContext] = useState<CoachContext | null>(null);

  // Draft/replace mode — existing goal is never touched until user explicitly confirms
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<{ goal: RaceGoal; plan: RacePlan } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState(false);

  useEffect(() => {
    Promise.all([
      loadActiveRaceGoalAndPlan(),
      loadRaceResults(10),
      buildCoachContextFromSupabase()
    ]).then(([result, completed, context]) => {
      setCoachContext(context);
      let loadedPlan: RacePlan | null = null;
      let loadedResults: RaceResult[] = [];
      if (result.ok) {
        setGoal(result.goal);
        setPlan(result.plan);
        loadedPlan = result.plan;
      }
      if (completed.ok) {
        setRaceResults(completed.results);
        loadedResults = completed.results;
        if (process.env.NODE_ENV === "development") {
          console.info("[race-history-debug]", { raceResultsCount: completed.results.length, ids: completed.results.map((r) => r.id) });
        }
      }
      setMounted(true);
      void refreshRacePlanFreshness(loadedPlan, loadedResults);
    });
  }, []);

  useEffect(() => {
    function handleCloudUpdate() {
      void refreshRacePlanFreshness(plan, raceResults);
      void buildCoachContextFromSupabase().then((context) => setCoachContext(context));
    }
    window.addEventListener("runmate:cloud-data-updated", handleCloudUpdate);
    return () => window.removeEventListener("runmate:cloud-data-updated", handleCloudUpdate);
  }, [plan, raceResults]);

  async function refreshRacePlanFreshness(nextPlan: RacePlan | null, nextResults: RaceResult[]) {
    if (!nextPlan) {
      setPlanFreshness(null);
      return;
    }
    const latestReportTime = await loadLatestRelevantReportTime(nextResults);
    const planTime = nextPlan.updatedAt ?? nextPlan.createdAt ?? null;
    setPlanFreshness({
      isStale: Boolean(planTime && latestReportTime && Date.parse(latestReportTime) > Date.parse(planTime)),
      planTime,
      latestReportTime,
    });
  }

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
      const refreshedPlan = { ...result.data, updatedAt: new Date().toISOString() };
      setPlan(refreshedPlan);
      void refreshRacePlanFreshness(refreshedPlan, raceResults);
    } catch {
      setRefreshError(true);
    }
    setRefreshing(false);
  }

  async function handleConfirmReplace() {
    if (!pendingCreate) return;
    setReplacing(true);
    setReplaceError(false);
    try {
      // Save new goal/plan first so data is never lost if delete fails
      const saveResult = await saveRaceGoalAndPlan(pendingCreate.goal, pendingCreate.plan);
      if (!saveResult.ok) { setReplaceError(true); setReplacing(false); return; }
      if (goal?.id) await deleteRaceGoalAndPlan(goal.id);
      invalidateCoachCache({ clearChat: true });
      setGoal(saveResult.goal);
      setPlan(saveResult.plan);
      setPendingCreate(null);
      setIsCreatingDraft(false);
      void refreshRacePlanFreshness(saveResult.plan, raceResults);
    } catch {
      setReplaceError(true);
    }
    setReplacing(false);
  }

  function cancelDraft() {
    setPendingCreate(null);
    setIsCreatingDraft(false);
  }

  if (!mounted) {
    return (
      <AppShell title="แผนแข่ง" subtitle="วางแผนจากวันนี้ไปถึงวันแข่ง">
        <section className="card p-5 text-sm text-[var(--muted-text)]">กำลังโหลดเป้าหมายและแผนซ้อม...</section>
      </AppShell>
    );
  }

  // Display-layer selection: pick today's workout from weeklyPlan by Bangkok date.
  // Do not mutate stored plan data — this is read-only.
  const selectedTodayWorkout = plan ? (selectTodayFromWeeklyPlan(plan) ?? plan.todayWorkout ?? null) : null;

  return (
    <AppShell title="แผนแข่ง" subtitle="วางแผนจากวันนี้ไปถึงวันแข่ง">
      {goal && plan && isCreatingDraft ? (
        /* ── Draft / replace mode: existing plan is safe until user confirms ── */
        <>
          <button
            type="button"
            onClick={cancelDraft}
            className="flex items-center gap-1.5 text-sm font-semibold text-[var(--primary-strong)]"
          >
            ← กลับไปแผนเดิม
          </button>
          <DraftModeHint currentGoal={goal} />
          {pendingCreate ? (
            <ConfirmReplaceSection
              currentGoal={goal}
              newGoal={pendingCreate.goal}
              replacing={replacing}
              replaceError={replaceError}
              onConfirm={() => void handleConfirmReplace()}
              onCancel={() => setPendingCreate(null)}
            />
          ) : (
            <RaceGoalForm onPlanReady={(newGoal, newPlan) => setPendingCreate({ goal: newGoal, plan: newPlan })} />
          )}
        </>
      ) : !goal || !plan ? (
        /* ── Empty state: first-time create (no confirmation needed) ── */
        <>
          {raceResults.length > 0 ? <LatestRacePrompt result={raceResults[0]} /> : null}
          <section className="soft-panel space-y-1.5 px-4 py-3 text-sm leading-6 text-[var(--muted-text)]">
            <p className="font-semibold text-[var(--foreground)]">ยังไม่มีเป้าหมายแข่ง</p>
            <p>สร้างเป้าหมาย 10K / 21K / 42K เพื่อให้ RunMate ช่วยวางแผนซ้อมให้เหมาะกับ recovery และ load ของคุณโดยเฉพาะ</p>
          </section>
          <RaceGoalForm onCreated={(nextGoal, nextPlan) => { setGoal(nextGoal); setPlan(nextPlan); }} />
        </>
      ) : (
        /* ── View mode: existing plan ── */
        <>
          <RaceCountdownCard goal={goal} phase={plan.currentPhase} />
          {coachContext?.sickRiskLevel === "hard_stop" && <SickHardStopRaceAdvisory />}
          {selectedTodayWorkout ? <TodayWorkoutCard workout={normalizeForDisplay(selectedTodayWorkout)} coachContext={coachContext} /> : null}
          {goal ? <PaceBandsCard goal={goal} coachContext={coachContext} /> : null}
          {plan.weeklyPlan?.length ? <ActionableWeekCard workouts={plan.weeklyPlan.map(normalizeForDisplay)} coachContext={coachContext} /> : null}
          <RecoveryGuardrailsCard coachContext={coachContext} />
          <PlanAtGlance plan={plan} freshness={planFreshness} />

          <section className="card p-4">
            <details className="group cursor-pointer">
              <summary className="list-none flex items-center justify-between font-bold text-[var(--foreground)]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--label-color)]">หลักการซ้อม</span>
                  <span className="text-sm font-bold text-[var(--foreground)]">รายละเอียดการซ้อมแต่ละเฟส</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[var(--primary)] font-bold shrink-0">
                  <span className="group-open:hidden">ดูเฟสซ้อม</span>
                  <span className="hidden group-open:inline">ซ่อน</span>
                  <span className="transition-transform group-open:rotate-180">▾</span>
                </div>
              </summary>
              <div className="mt-3 pt-3 border-t border-[var(--color-border-soft)] cursor-default space-y-3">
                <div className="flex justify-between items-center gap-3">
                  <span className="text-xs text-[var(--color-text-soft)] font-semibold">สรุปโครงสร้างแผนซ้อม</span>
                  <LoadingButton
                    type="button"
                    loading={refreshing}
                    loadingText="กำลังอัปเดตแผน..."
                    onClick={refreshPlan}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-[var(--recovery-blue)] transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40"
                  >
                    รีเฟรชแผน
                  </LoadingButton>
                </div>
                {refreshError ? <p className="text-xs text-red-500">อัปเดตแผนไม่สำเร็จ ลองใหม่อีกครั้ง</p> : null}
                <p className="card-soft text-xs leading-relaxed text-[var(--muted-text)] font-medium p-3">{sanitizePaceInText(plan.planSummary)}</p>
                <div className="space-y-2 mt-2">
                  {plan.phases?.map((phase) => <TrainingPhaseCard key={phase.name} phase={phase} />)}
                </div>
              </div>
            </details>
          </section>

          {!plan.weeklyPlan?.length && plan.weeks?.[0] ? <WeeklyPlanCard week={plan.weeks[0]} /> : null}
          <button
            type="button"
            className="w-full py-2 text-center text-xs text-[var(--muted-text)] hover:text-[var(--foreground)] transition-colors"
            onClick={() => setIsCreatingDraft(true)}
          >
            สร้างแผนใหม่ / เปลี่ยนเป้าหมาย
          </button>
        </>
      )}
      {raceResults.length > 0 ? <CompletedRaceSection results={raceResults} /> : null}
    </AppShell>
  );
}

function DraftModeHint({ currentGoal }: { currentGoal: RaceGoal }) {
  return (
    <section
      className="rounded-2xl border border-[var(--border-warm)] bg-[var(--surface-muted)]/70 px-4 py-3"
      data-testid="draft-mode-hint"
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">แผนปัจจุบัน</p>
      <p className="mt-1 truncate text-sm font-bold text-[var(--foreground)]">
        {formatRaceDisplayName(currentGoal.raceName)} · {currentGoal.raceDistance}
      </p>
      {currentGoal.raceDate && (
        <p className="text-xs text-[var(--muted-text)]">วันแข่ง {currentGoal.raceDate}</p>
      )}
      <p className="mt-2 text-xs leading-5 text-[var(--color-text-soft)]">
        การสร้างใหม่จะยังไม่แทนที่แผนเดิมจนกว่าจะยืนยัน · แผนเดิมยังปลอดภัย
      </p>
    </section>
  );
}

function ConfirmReplaceSection({
  currentGoal,
  newGoal,
  replacing,
  replaceError,
  onConfirm,
  onCancel,
}: {
  currentGoal: RaceGoal;
  newGoal: RaceGoal;
  replacing: boolean;
  replaceError: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <section className="card space-y-4 p-5" data-testid="confirm-replace-section">
      <div>
        <h2 className="text-lg font-bold text-[var(--foreground)]">สร้างแผนใหม่แทนแผนเดิม?</h2>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-text)]">
          แผนแข่งปัจจุบันจะถูกแทนที่ด้วยเป้าหมายใหม่ แต่ประวัติการซ้อมและ Report จะยังอยู่
        </p>
      </div>
      <div className="rounded-2xl bg-[var(--surface-muted)] px-4 py-3 text-sm">
        <span className="font-semibold text-[var(--foreground)]">{formatRaceDisplayName(currentGoal.raceName)}</span>
        <span className="mx-1.5 text-[var(--label-color)]">→</span>
        <span className="font-semibold text-[var(--foreground)]">{formatRaceDisplayName(newGoal.raceName)}</span>
        {newGoal.raceDistance ? <span className="ml-1 text-[var(--muted-text)]">· {newGoal.raceDistance}</span> : null}
      </div>
      {replaceError && (
        <p className="text-xs text-red-500">สร้างแผนใหม่ไม่สำเร็จ ลองใหม่อีกครั้ง</p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={replacing}
          className="btn-secondary flex-1 py-3"
        >
          ยกเลิก
        </button>
        <LoadingButton
          type="button"
          loading={replacing}
          loadingText="กำลังบันทึก..."
          onClick={onConfirm}
          className="flex-1 rounded-2xl bg-[var(--primary)] py-3 text-sm font-bold text-white disabled:opacity-40"
        >
          ยืนยันสร้างแผนใหม่
        </LoadingButton>
      </div>
    </section>
  );
}

function LatestRacePrompt({ result }: { result: RaceResult }) {
  return (
    <div className="card space-y-2 px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">Race completed</p>
      <p className="truncate text-base font-bold text-[var(--foreground)]">{formatRaceDisplayName(result.raceName) || "Race"} · {result.raceDistance}</p>
      {result.actualTime ? (
        <p className="text-sm text-[var(--muted-text)]">
          {result.actualTime}{result.actualPace ? ` · ${result.actualPace}/กม.` : ""} ·{" "}
          <span className="font-semibold text-[var(--color-success)]">{resultBadge(result.goalResult)}</span>
        </p>
      ) : null}
      <p className="text-sm text-[var(--color-text-soft)]">พร้อมตั้ง Race Goal ถัดไปหรือยัง?</p>
    </div>
  );
}

function PlanAtGlance({ plan, freshness }: { plan: RacePlan; freshness: PlanFreshness | null }) {
  return (
    <section className="card px-5 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">ภาพรวมแผน</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1.5 text-xs font-bold text-[var(--primary-strong)]">
          เหลือ {plan.weeksRemaining != null ? plan.weeksRemaining : plan.totalWeeks} wk
        </span>
        <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]">
          เริ่ม {formatShortDate(plan.planStartDate)}
        </span>
        <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs font-bold text-[var(--foreground)]">
          เฟส {plan.currentPhase || "Base"}
        </span>
      </div>
      <RacePlanFreshnessNote freshness={freshness} />
      {plan.safetyNotes ? <p className="mt-3 text-xs leading-5 text-[var(--muted-text)]">{sanitizePaceInText(plan.safetyNotes)}</p> : null}
    </section>
  );
}

function RacePlanFreshnessNote({ freshness }: { freshness: PlanFreshness | null }) {
  if (!freshness?.planTime) {
    return (
      <p className="mt-4 rounded-2xl bg-[var(--surface-muted)] px-3 py-2 text-xs leading-5 text-[var(--color-text-muted)]">
        กดรีเฟรชแผนเพื่อปรับตามข้อมูลล่าสุดเมื่อพร้อม
      </p>
    );
  }

  if (freshness.isStale) {
    return (
      <div className="mt-4 rounded-2xl border border-[var(--color-info-soft)] bg-[var(--color-info-soft)] px-3 py-2 text-xs leading-5 text-[var(--color-info)]">
        <p className="font-bold">อัปเดตจากข้อมูลล่าสุด</p>
        <p className="mt-0.5 text-[var(--foreground)]/70">แผนวันนี้ปรับตามข้อมูลล่าสุด เช่น sleep / pain / workout เพื่อให้ซ้อมเหมาะกับสภาพร่างกายมากขึ้น</p>
        {freshness.latestReportTime ? <p className="mt-1 text-[var(--color-text-muted)]">อัปเดตล่าสุด: {formatDateTimeThai(freshness.latestReportTime)}</p> : null}
      </div>
    );
  }

  return (
    <p className="mt-4 text-xs leading-5 text-[var(--color-text-soft)]">
      อัปเดตล่าสุด: {formatDateTimeThai(freshness.planTime)}
    </p>
  );
}

function isLongRun(workout: WeekWorkout): boolean {
  const type = (workout.workoutType ?? "").toLowerCase();
  const desc = (workout.description ?? "").toLowerCase();
  const isRun = isRunType(workout.workoutType ?? "");
  const distance = workout.distanceKm ?? 0;
  return isRun && (
    type.includes("long") ||
    type.includes("ยาว") ||
    desc.includes("long run") ||
    desc.includes("วิ่งยาว") ||
    distance >= 10
  );
}

function RecoveryGuardrailsCard({ coachContext }: { coachContext: CoachContext | null }) {
  if (!coachContext) return null;
  const recSys = coachContext.recoverySystem;
  if (!recSys || !recSys.guardrails?.length) return null;

  return (
    <section className="card border border-blue-100 bg-blue-50/20 p-4">
      <details className="group cursor-pointer">
        <summary className="list-none flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#42677f]">ข้อควรระวังวันนี้</p>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-[var(--foreground)] line-clamp-2 group-open:hidden">
              {recSys.guardrails[0]}
            </p>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-[var(--primary)] font-bold shrink-0 mt-0.5">
            <span className="group-open:hidden">ดูทั้งหมด</span>
            <span className="hidden group-open:inline">ซ่อน</span>
            <span className="transition-transform group-open:rotate-180">▾</span>
          </div>
        </summary>
        <div className="mt-3 pt-3 border-t border-blue-100/50 cursor-default">
          <p className="text-xs font-extrabold text-[var(--foreground)] leading-snug">{recSys.headline}</p>
          <ul className="list-disc pl-4 mt-2 space-y-1 text-xs font-semibold text-[var(--muted-text)]">
            {recSys.guardrails.map((g, idx) => (
              <li key={idx}>{g}</li>
            ))}
          </ul>
          {(recSys.coachingState === "easy" || recSys.coachingState === "recover") && (
            <p className="mt-2.5 text-[11px] text-[var(--color-text-soft)] leading-snug" data-testid="race-recovery-reassurance">
              วันนี้เบาไม่ได้ทำให้ fitness หาย — การพักตามแผนช่วยให้ซ้อมต่อเนื่องได้ครับ
            </p>
          )}
        </div>
      </details>
    </section>
  );
}

function isHardWorkoutType(workoutType: string | undefined): boolean {
  if (!workoutType) return false;
  return /tempo|interval|fartlek|progression|race\s*pace/i.test(workoutType);
}

function getAdaptiveLongRunNote(workout: WeekWorkout, context: CoachContext | null, isToday = false): string | null {
  if (!context) return null;
  const recSys = context.recoverySystem;
  if (!recSys) return null;

  const isLong = isLongRun(workout);

  if (isLong) {
    const isLowSleepAvg = recSys.axes.sleep.score < 60;
    const isLowReadiness = recSys.axes.recovery.score < 70;
    const isHighWeeklyLoad = recSys.axes.load.score >= 75;
    const hasPainHistory = context.activePain || context.recentPainHistory;

    const hasCaution = isLowSleepAvg || isLowReadiness || isHighWeeklyLoad || hasPainHistory;
    if (!hasCaution) return null;

    const d = workout.distanceKm;
    const reducedText = d ? ` ลดเหลือ ${Math.round(d * 0.8)}–${Math.round(d * 0.9)} กม.` : " ลดระยะลง 10–20%";
    return `ปรับตามสภาพ: ถ้าฟื้นตัวไม่ดี${reducedText} (ถ้าคืนก่อนนอนน้อยหรือ HR ลอย ให้ลด Long Run ลง 10–20% · เป้าหมายวันนี้คือสะสมเวลา easy ไม่ใช่ฝืนระยะ · ถ้าเจ็บกลับมา ให้หยุดที่เดิน/จ็อกเบา)`;
  }

  if (!isToday && isHardWorkoutType(workout.workoutType)) {
    return "จะยืนยันอีกครั้งตาม recovery วันนั้น — ปรับได้ถ้า sleep หรือ recovery ยังต่ำ";
  }

  return null;
}

function isRunWorkoutType(workoutType: string | undefined): boolean {
  if (!workoutType) return false;
  return /(run|tempo|interval|fartlek|progression|race pace|วิ่ง)/i.test(workoutType);
}

function TodayWorkoutCompletedCard({ workout, completedKm }: { workout: WeekWorkout; completedKm: number }) {
  const planned = workout.distanceKm;
  const exceeded = planned != null && completedKm > planned;
  return (
    <section className="card relative overflow-hidden border border-[#b7dcc4] bg-[#f4fbf6] p-5 pl-7" data-testid="today-workout-completed-card">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--primary)]" aria-hidden="true" />
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary-strong)]">วันนี้ทำแล้ว</p>
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--primary-strong)]">✓ เสร็จแล้ว</span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">{workout.workoutType}</h2>
        <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-sm font-bold text-[var(--primary-strong)] shadow-sm">
          {completedKm.toFixed(1)} กม.{exceeded ? " 🎉" : ""}
        </span>
      </div>
      {planned != null && (
        <p className="mt-1.5 text-xs text-[var(--muted-text)]">
          แผน {planned} กม.{exceeded ? " · เกินแผน!" : ` · ${completedKm.toFixed(1)} กม.`}
        </p>
      )}
      <div className="mt-4 rounded-xl bg-[var(--surface-muted)] px-3 py-2.5 text-xs leading-5 text-[var(--foreground)]">
        วิ่งเสร็จแล้ววันนี้ — เติมน้ำและโปรตีน เน้น recovery และดันการนอนคืนนี้
      </div>
    </section>
  );
}

function SickHardStopRaceAdvisory() {
  return (
    <section className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-2" data-testid="sick-hard-stop-race-advisory">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-700">⚠️ วันนี้ไม่ใช้แผนซ้อม</p>
      <p className="text-sm leading-6 text-red-800">
        มีอาการป่วยที่ควรพักก่อน แผนซ้อมจะกลับมาดูอีกครั้งเมื่ออาการดีขึ้น
      </p>
      <Link href="/sick" className="inline-block rounded-xl bg-red-700 px-4 py-1.5 text-xs font-bold text-white">
        ดู/อัปเดตอาการ
      </Link>
    </section>
  );
}

function TodayWorkoutCard({ workout, coachContext }: { workout: WeekWorkout; coachContext: CoachContext | null }) {
  const todayRunKm = (coachContext?.todayWorkouts ?? [])
    .filter(w => w.kind === "run" || w.kind === "race")
    .reduce((sum, w) => sum + (w.distanceKm ?? 0), 0);
  const plannedKm = workout.distanceKm;
  if (isRunWorkoutType(workout.workoutType) && plannedKm != null && plannedKm > 0 && todayRunKm >= plannedKm * 0.8) {
    return <TodayWorkoutCompletedCard workout={workout} completedKm={todayRunKm} />;
  }

  const painStatus = coachContext?.painRecoveryStatus;
  const painBlocked = painStatus && painStatus !== "cleared_normal";
  const recSys = coachContext?.recoverySystem ?? null;
  const guardrail = painBlocked
    ? getTodayTrainingGuardrail(recSys, coachContext?.activePain ?? false, painStatus as PainRecoveryStatus)
    : null;

  const isStrength = isStrengthOrMobilityType(workout.workoutType);
  const adaptiveNote = getAdaptiveLongRunNote(workout, coachContext, true);
  return (
    <section className="card relative overflow-hidden border border-[#b7dcc4] bg-[#f4fbf6] p-5 pl-7">
      <div className="absolute inset-y-0 left-0 w-1.5 bg-[var(--primary)]" aria-hidden="true" />
      <div className="mb-3 flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--primary-strong)]">วันนี้แผนซ้อมปรับตามร่างกาย</p>
        <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--primary-strong)]">ปรับแล้ว</span>
      </div>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">{workout.workoutType}</h2>
        <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-sm font-bold text-[var(--primary-strong)] shadow-sm">
          {formatWorkoutAmount(workout)}
        </span>
      </div>
      <p className="mt-4 text-sm leading-6 text-[var(--foreground)]">{workout.description}</p>
      {renderWorkoutDetails(workout)}
      {isStrength ? (
        <>
          <InfoLine label="Focus / กล้ามเนื้อ" value={workout.purpose || "แกนกลาง & เสริมความแข็งแรง"} />
          {workout.adjustment ? <InfoLine label="Effort / แรงต้าน" value={workout.adjustment} /> : null}
          <InfoLine label="รูทีนแนะนำ" value={suggestStrengthRoutine(workout.workoutType, workout.purpose, workout.adjustment)} />
        </>
      ) : (
        <>
          {workout.purpose ? <InfoLine label="เป้าหมาย" value={workout.purpose} /> : null}
          {workout.adjustment ? <InfoLine label="ปรับตามสภาพ" value={workout.adjustment} /> : null}
        </>
      )}
      {adaptiveNote && (
        <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 font-medium border border-amber-200">
          ⚠️ {adaptiveNote}
        </div>
      )}
      {guardrail && guardrail.canDoHardWorkout === false && (
        <div className="mt-3 rounded-xl bg-[#fff8ed] px-3 py-2.5 text-xs leading-5 text-[#9b742c] font-medium border border-[#f0dab0]" data-testid="pain-recovery-race-banner">
          ⚠️ {guardrail.shortThaiCopy}
        </div>
      )}
      {coachContext?.activeSick && (
        <div
          data-testid="sick-day-race-banner"
          className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 font-medium border ${coachContext.sickRiskLevel === "hard_stop" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
        >
          {coachContext.sickRiskLevel === "hard_stop"
            ? "🔴 วันนี้พักก่อน — อาการป่วยสำคัญกว่าแผนซ้อม พักให้หาย แล้วค่อยกลับมาซ้อม"
            : "🟡 วันนี้ลดความหนักไว้ก่อน — มีอาการไม่สบาย ถ้าจะขยับให้เบามากและฟังร่างกาย"}
        </div>
      )}
      {!painBlocked && coachContext && (() => {
        const dr = buildDailyReadiness(coachContext);
        const isHardWorkout = /interval|tempo|ซ้อมเร็ว|long run|วิ่งยาว|race pace/i.test(workout.workoutType);
        if (dr.band === "red" && isHardWorkout) {
          return (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 border border-slate-200" data-testid="readiness-race-softening">
              💡 ร่างกายฟื้นตัวต่ำวันนี้ — พิจารณาลดเป็น easy run หรือพัก แล้วทำตามแผนพรุ่งนี้แทน
            </div>
          );
        }
        if (dr.band === "pain_risk") {
          return (
            <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700 border border-red-200" data-testid="readiness-race-pain-note">
              🩹 มีอาการเจ็บ — แนะนำงดซ้อมตามแผนนี้ก่อน และประเมินอาการก่อนกลับซ้อม
            </div>
          );
        }
        return null;
      })()}
    </section>
  );
}

const BAND_LABELS: Record<PaceBandKey, string> = {
  easy: "Easy run",
  long: "Long run",
  tempo: "Tempo",
  interval: "Interval",
};

function PaceBandsCard({ goal, coachContext }: { goal: RaceGoal; coachContext: CoachContext | null }) {
  const bands = buildTrainingPaceBands(goal);
  if (!bands) return null;

  const dr = coachContext ? buildDailyReadiness(coachContext) : null;
  const allowedKeys = dr
    ? getAllowedPaceBandsForReadiness({ bands, dailyReadiness: dr })
    : (["easy", "long", "tempo", "interval"] as PaceBandKey[]);

  const allKeys: PaceBandKey[] = ["easy", "long", "tempo", "interval"];

  const { hrZones, easyCap } = buildHrGuidanceForContext(coachContext);
  const sickHardStop = coachContext?.sickRiskLevel === "hard_stop";
  const hrCapLine = (() => {
    if (!hrZones || sickHardStop) return null;
    return easyCap ? easyCap.displayTh : null;
  })();

  return (
    <section className="rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface)] px-4 py-3" data-testid="pace-bands-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--label-color)]">ช่วงเพซซ้อมของคุณ</p>
      <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">คำนวณจากเป้าหมาย {goal.raceDistance} · {goal.targetTime}</p>
      <div className="mt-2 space-y-1.5">
        {allKeys.map((key) => {
          const range = bands[key];
          const allowed = allowedKeys.includes(key);
          const showHrCap = hrCapLine && (key === "easy" || key === "long");
          return (
            <div key={key} className={`flex items-center justify-between gap-2 rounded-xl px-3 py-1.5 ${allowed ? "bg-[var(--primary-soft)]" : "bg-[var(--surface-muted)] opacity-50"}`}>
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-[var(--foreground)]">{BAND_LABELS[key]}</span>
                  {!allowed && dr && <span className="text-[10px] text-[var(--color-text-muted)]">· ไว้วันพร้อม</span>}
                </span>
                {showHrCap && (
                  <span className="text-[10px] text-[var(--color-text-muted)]" data-testid="race-hr-cap-line">
                    {hrCapLine}
                  </span>
                )}
              </span>
              <span className="text-[11px] font-bold text-[var(--primary-strong)] tabular-nums">{formatPaceRange(range)}</span>
            </div>
          );
        })}
      </div>
      {coachContext?.hasWorkoutToday && (
        <p className="mt-2 text-[10px] font-semibold text-[var(--color-text-muted)] leading-snug">
          ✅ วันนี้ซ้อมจบแล้ว — ตารางนี้ใช้เป็น reference สำหรับวันถัดไป
        </p>
      )}
      {!coachContext?.hasWorkoutToday && dr && allowedKeys.length < 4 && (
        <p className="mt-2 text-[10px] text-[var(--color-text-muted)] leading-snug">
          💡 วันนี้เหมาะกับ {allowedKeys.map((k) => BAND_LABELS[k]).join(" · ")} เท่านั้น ตามสภาพร่างกาย
        </p>
      )}
      {coachContext?.sickRiskLevel === "hard_stop" && (
        <p className="mt-2 text-[10px] font-semibold text-red-600 leading-snug" data-testid="pace-bands-sick-note">
          🔴 วันนี้ยังไม่แนะนำให้ซ้อม — ดูเพซนี้เป็นข้อมูลอ้างอิงเมื่ออาการดีขึ้น
        </p>
      )}
      <p className="mt-2 text-[10px] text-[var(--color-text-muted)] leading-snug" data-testid="pace-bands-reference-note">
        ใช้ช่วงเพซด้านบนเป็น reference — ให้ readiness, HR/RPE, ความล้า และอาการเจ็บนำเสมอ
      </p>
    </section>
  );
}

function isTodayWorkout(dayStr: string): boolean {
  if (/today/i.test(dayStr)) return true;

  const bangkokDayName = (() => {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat("th-TH", {
        timeZone: "Asia/Bangkok",
        weekday: "long",
      });
      return formatter.format(now); // e.g. "วันจันทร์", "วันอังคาร"
    } catch {
      return "";
    }
  })();

  const cleanDayStr = dayStr.trim();

  if (bangkokDayName.includes(cleanDayStr) || cleanDayStr.includes(bangkokDayName)) {
    return true;
  }

  const shortDaysMap: Record<string, string> = {
    "อา.": "วันอาทิตย์", "จ.": "วันจันทร์", "อ.": "วันอังคาร", "พ.": "วันพุธ",
    "พฤ.": "วันพฤหัสบดี", "ศ.": "วันศุกร์", "ส.": "วันเสาร์",
    "อาทิตย์": "วันอาทิตย์", "จันทร์": "วันจันทร์", "อังคาร": "วันอังคาร", "พุธ": "วันพุธ",
    "พฤหัสบดี": "วันพฤหัสบดี", "ศุกร์": "วันศุกร์", "เสาร์": "วันเสาร์"
  };

  const mapped = shortDaysMap[cleanDayStr];
  if (mapped && bangkokDayName === mapped) {
    return true;
  }

  return false;
}

function ActionableWeekCard({ workouts, coachContext }: { workouts: WeekWorkout[]; coachContext: CoachContext | null }) {
  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 px-5 py-4">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-[var(--label-color)]">แผน 7 วัน</p>
        <p className="text-[10px] text-[var(--muted-text)]">แตะเพื่อดูรายละเอียด</p>
      </div>
      <div className="border-t border-[var(--color-border-soft)]">
        {workouts.map((workout, index) => {
          const isStrength = isStrengthOrMobilityType(workout.workoutType);
          const isToday = isTodayWorkout(workout.day);
          const adaptiveNote = getAdaptiveLongRunNote(workout, coachContext, isToday);
          const showRecoveryBadge = !isToday && isHardWorkoutType(workout.workoutType);
          return (
            <details
              key={`${workout.day}-${workout.workoutType}-${index}`}
              className="group cursor-pointer border-b border-[var(--color-border-soft)] last:border-b-0 [&[open]]:bg-[var(--primary-soft)]/20"
            >
              <summary className="list-none flex items-center justify-between gap-3 px-5 py-3 font-semibold">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-xs font-bold text-[var(--label-color)] flex items-center gap-1.5">
                    {workout.day}
                    {isToday && (
                      <span className="rounded bg-[var(--primary)] px-1.5 py-0.5 text-[9px] font-bold text-white">
                        วันนี้
                      </span>
                    )}
                    {showRecoveryBadge && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700" data-testid="recovery-check-badge">
                        รอเช็ก recovery
                      </span>
                    )}
                  </span>
                  <span className="font-bold text-[var(--foreground)] truncate">{workout.workoutType}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--primary-strong)]">
                    {formatWorkoutAmount(workout)}
                  </span>
                  <span className="text-xs text-[var(--color-text-soft)] group-open:rotate-180 transition-transform">▾</span>
                </div>
              </summary>
              <div className="border-t border-[var(--color-border-soft)] px-5 py-4 cursor-default text-xs space-y-2">
                <p className="text-sm leading-relaxed text-[var(--muted-text)] font-medium">{workout.description}</p>
                {renderWorkoutDetails(workout)}
                {isStrength ? (
                  <>
                    <InfoLine label="Focus / กล้ามเนื้อ" value={workout.purpose || "แกนกลาง & เสริมความแข็งแรง"} />
                    {workout.adjustment ? <InfoLine label="Effort / แรงต้าน" value={workout.adjustment} /> : null}
                    <InfoLine label="รูทีนแนะนำ" value={suggestStrengthRoutine(workout.workoutType, workout.purpose, workout.adjustment)} />
                  </>
                ) : (
                  <>
                    {workout.purpose ? <InfoLine label="เป้าหมาย" value={workout.purpose} /> : null}
                    {workout.adjustment ? <InfoLine label="ปรับตามสภาพ" value={workout.adjustment} /> : null}
                  </>
                )}
                {adaptiveNote && (
                  <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 font-semibold border border-amber-200">
                    ⚠️ {adaptiveNote}
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function CompletedRaceSection({ results }: { results: RaceResult[] }) {
  return (
    <section className="card overflow-hidden p-0">
      <details className="group cursor-pointer">
        <summary className="list-none flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">ประวัติการแข่งขัน</p>
            <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">{results.length} รายการที่บันทึกแล้ว</p>
          </div>
          <div className="flex items-center gap-1 text-xs text-[var(--primary)] font-bold shrink-0">
            <span className="group-open:hidden">ดูประวัติ</span>
            <span className="hidden group-open:inline">ซ่อน</span>
            <span className="transition-transform group-open:rotate-180">▾</span>
          </div>
        </summary>
        <div className="cursor-default space-y-3 border-t border-[var(--color-border-soft)] px-5 pb-5 pt-4">
          {results.map((result) => (
            <div key={result.id ?? `${result.raceDate}-${result.raceName}`} className="card-soft p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="truncate font-bold text-[var(--foreground)]">{formatRaceDisplayName(result.raceName) || "Race"}</p>
                  <p className="text-xs text-[var(--color-text-soft)]">{result.raceDate} · {result.raceDistance}</p>
                </div>
                <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-bold text-[var(--primary-strong)]">
                  {resultBadge(result.goalResult)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <MiniMetric label="เวลา" value={result.actualTime ?? "-"} />
                <MiniMetric label="Pace" value={result.actualPace ? `${result.actualPace}/km` : "-"} />
              </div>
              {result.coachSummary ? <p className="mt-3 text-sm leading-6 text-[var(--foreground)]">{result.coachSummary}</p> : null}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card-soft p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-soft)]">{label}</p>
      <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="mt-3 text-xs leading-5 text-[var(--muted-text)]">
      <span className="font-bold text-[var(--foreground)]">{label}: </span>
      {value}
    </p>
  );
}

function isRunType(workoutType: string): boolean {
  return !/^(rest|strength|gym|cross.?training|core|mobility|shakeout|post.?race|recovery|walk|ฟื้น|พัก)/i.test(workoutType.trim());
}



function isStrengthOrMobilityType(workoutType: string): boolean {
  return /^(strength|recovery\s+strength|mobility|core|gym|cross.?training|เวท|ยืด|กายภาพ)/i.test(workoutType.trim());
}

function isRestType(workoutType: string): boolean {
  return /^(rest(\s+day)?|พัก|งด)/i.test(workoutType.trim());
}

function renderWorkoutDetails(workout: WeekWorkout) {
  const type = workout.workoutType ?? "";
  const isStrength = isStrengthOrMobilityType(type);
  const isRest = isRestType(type);

  if (isRest) return null;

  if (isStrength) {
    const hasHR = workout.targetHR && !/n\/a|ไม่เน้น|ไม่มี|none|-/i.test(workout.targetHR);
    return (
      <div className="mt-4 grid grid-cols-2 gap-2">
        {workout.durationMin != null && (
          <MiniMetric label="Duration / เวลา" value={`${workout.durationMin} นาที`} />
        )}
        {hasHR && (
          <MiniMetric label="HR / ความหนัก" value={workout.targetHR!} />
        )}
      </div>
    );
  }

  // Running / general card
  return (
    <div className="mt-4 grid grid-cols-2 gap-2">
      <MiniMetric label="Pace" value={safeValue(workout.targetPace)} />
      <MiniMetric label="HR / ความหนัก" value={safeValue(workout.targetHR)} />
    </div>
  );
}

function formatWorkoutAmount(workout: WeekWorkout) {
  if (isRunType(workout.workoutType ?? "") && workout.distanceKm != null) return `${workout.distanceKm} กม.`;
  if (workout.durationMin != null) return `${workout.durationMin} นาที`;
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

function formatDateTimeThai(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

async function loadLatestRelevantReportTime(raceResults: RaceResult[]) {
  const reportResult = await loadHistoryItems(RACE_PLAN_FRESHNESS_TYPES);
  const historyLatest = reportResult.ok
    ? reportResult.items
        .map((item) => item.createdAt)
        .filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value))))
        .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null
    : null;
  const raceLatest = raceResults
    .map((result) => result.updatedAt ?? result.createdAt ?? null)
    .filter((value): value is string => Boolean(value && !Number.isNaN(Date.parse(value))))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;

  if (!historyLatest) return raceLatest;
  if (!raceLatest) return historyLatest;
  return Date.parse(historyLatest) >= Date.parse(raceLatest) ? historyLatest : raceLatest;
}

function resultBadge(value: RaceResult["goalResult"]) {
  if (value === "achieved") return "บรรลุเป้า";
  if (value === "missed") return "ไม่ถึงเป้า";
  if (value === "completed") return "เสร็จสมบูรณ์";
  return "ผลแข่ง";
}

// ── Today workout selection (display-layer, does not mutate stored plan) ─────

function bangkokTodayDateKey(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function bangkokTodayWeekdayIndex(): number {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).getUTCDay();
}

// Returns 0=Sun … 6=Sat for Thai and English day labels.
// "อา." (Sunday) is checked before "อ." (Tuesday) to resolve the shared prefix.
function normalizeWeekdayLabel(day: string): number | null {
  if (!day) return null;
  const d = day.trim();
  if (/^(อา\.|อาทิตย์|วันอาทิตย์|Sun)/i.test(d)) return 0;
  if (/^(จ\.|จันทร์|วันจันทร์|Mon)/i.test(d)) return 1;
  if (/^(อ\.|อังคาร|วันอังคาร|Tue)/i.test(d)) return 2;
  if (/^(พ\.|พุธ|วันพุธ|Wed)/i.test(d)) return 3;
  if (/^(พฤ\.|พฤหัส|วันพฤหัส|Thu)/i.test(d)) return 4;
  if (/^(ศ\.|ศุกร์|วันศุกร์|Fri)/i.test(d)) return 5;
  if (/^(ส\.|เสาร์|วันเสาร์|Sat)/i.test(d)) return 6;
  return null;
}

// Returns the WeekWorkout from weeklyPlan that best matches today (Bangkok time).
// Priority:
//  1. Exact date field on the workout item (e.g. workout.date === "2026-06-23")
//  2. Weekday label match (Thai or English) — wins over planStartDate arithmetic
//  3. planStartDate offset — fallback for label-free plans
function selectTodayFromWeeklyPlan(plan: RacePlan): WeekWorkout | null {
  const weeklyPlan = plan.weeklyPlan;
  if (!weeklyPlan?.length) return null;

  const todayDate = bangkokTodayDateKey();
  const todayWeekday = bangkokTodayWeekdayIndex();

  // 1. Exact date match — AI may include date/dateKey/dayDate on workout items.
  for (const workout of weeklyPlan) {
    const w = workout as Record<string, unknown>;
    const d = w.date ?? w.dateKey ?? w.dayDate;
    if (typeof d === "string" && d.slice(0, 10) === todayDate) return workout;
  }

  // 2. Weekday label match — checked before offset so day labels win.
  for (const workout of weeklyPlan) {
    const wd = normalizeWeekdayLabel(workout.day ?? "");
    if (wd !== null && wd === todayWeekday) return workout;
  }

  // 3. planStartDate offset — fallback when no labels/dates are present.
  if (plan.planStartDate) {
    const startMs = Date.parse(`${plan.planStartDate}T12:00:00+07:00`);
    const todayMs = Date.parse(`${todayDate}T12:00:00+07:00`);
    if (!Number.isNaN(startMs) && !Number.isNaN(todayMs)) {
      const offsetDays = Math.round((todayMs - startMs) / 86_400_000);
      if (offsetDays >= 0 && offsetDays < weeklyPlan.length) {
        if (process.env.NODE_ENV === "development") {
          console.debug("[race] today workout fallback used", { reason: "planStartDate offset", offsetDays });
        }
        return weeklyPlan[offsetDays];
      }
    }
  }

  if (process.env.NODE_ENV === "development") {
    console.debug("[race] today workout fallback used", { reason: "no match found" });
  }
  return null;
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

  // Clear distance and ensure duration for non-run types (handles old saved data)
  const nonRun = isRestOnly || isStrength || isRecovery;
  const distanceKm = nonRun ? null : workout.distanceKm;
  const durationMin = workout.durationMin ?? (isStrength ? 25 : nonRun ? 20 : null);

  return { ...workout, targetPace, targetHR, distanceKm, durationMin };
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
