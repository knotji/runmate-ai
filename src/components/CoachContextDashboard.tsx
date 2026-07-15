"use client";

import { useEffect, useState } from "react";
import { buildCoachContextFromSupabase, type CoachContext } from "@/lib/buildCoachContext";
import { getRunMateReadinessLabel } from "@/lib/readinessV2";
import { formatAxisScore, getRecoveryAxisLabel } from "@/lib/recoverySystem";
import type { RunMateRecoverySystem } from "@/lib/recoverySystem";
import { getTodayTrainingGuardrail } from "@/lib/trainingGuardrails";

export function CoachContextDashboard() {
  const [context, setContext] = useState<CoachContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const ctx = await buildCoachContextFromSupabase();
        if (alive) setContext(ctx);
      } finally {
        if (alive) setLoading(false);
      }
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

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center rounded-3xl border border-[var(--border-warm)] bg-[var(--surface-muted)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border-warm)] border-t-[var(--primary)]" />
      </div>
    );
  }

  if (!context) {
    return (
      <section className="card space-y-2 p-4" data-testid="coach-context-dashboard">
        <p className="text-sm font-semibold text-[var(--foreground)]">โค้ชยังไม่มีบริบทวันนี้</p>
        <p className="text-xs leading-5 text-[var(--muted-text)]">
          อัปโหลดผลวิ่ง การนอน หรืออาหารเพื่อให้โค้ชเข้าใจสถานะร่างกายและแนะนำได้ดีขึ้น
        </p>
        <a href="/upload" className="btn-primary block py-2 text-center text-xs font-bold">
          บันทึกข้อมูลแรก
        </a>
      </section>
    );
  }

  const recSys = context.recoverySystem as RunMateRecoverySystem | null;
  const score = recSys?.overallScore ?? null;
  const coachingState = recSys?.coachingState;
  const runmateLabel = score != null
    ? (recSys?.overallDisplayStatus?.displayLabel ?? getRunMateReadinessLabel(score))
    : null;

  const stanceLabel = !coachingState ? "โค้ชพร้อมแนะนำวันนี้"
    : coachingState === "push" ? "ร่างกายพร้อมลุยเต็มที่"
    : coachingState === "maintain" ? "วันนี้ยังไปตามแผนได้"
    : coachingState === "easy" ? "วันนี้โค้ชจะคุมเบาไว้ก่อน"
    : "วันนี้เน้น recovery ก่อน";

  const stanceColor = !coachingState || coachingState === "push" || coachingState === "maintain"
    ? "text-[var(--status-ready)]"
    : coachingState === "easy"
    ? "text-[var(--color-warning)]"
    : "text-[var(--status-rest)]";

  const scoreBg = !coachingState || coachingState === "push" || coachingState === "maintain"
    ? "bg-[var(--primary-soft)]"
    : coachingState === "easy"
    ? "bg-[var(--color-warning-soft)]"
    : "bg-[var(--color-danger-soft)]";

  const scoreTextColor = !coachingState || coachingState === "push" || coachingState === "maintain"
    ? "text-[var(--primary-strong)]"
    : coachingState === "easy"
    ? "text-[var(--color-warning)]"
    : "text-[var(--status-rest)]";

  const scoreRing = !coachingState || coachingState === "push" || coachingState === "maintain"
    ? "border-[var(--color-success)]"
    : coachingState === "easy"
    ? "border-[var(--color-warning)]"
    : "border-[var(--color-danger)]";

  const scoreGlow = !coachingState || coachingState === "push" || coachingState === "maintain"
    ? "rgba(82,209,124,0.35)"
    : coachingState === "easy"
    ? "rgba(255,182,72,0.35)"
    : "rgba(255,107,107,0.35)";

  const guardrail = getTodayTrainingGuardrail(recSys, context.activePain, context.painRecoveryStatus);
  const contextChips = buildContextChips(context, recSys);
  const hasUsefulData = context.sleep7d.length > 0 || context.workouts7d.length > 0 ||
    context.recentPainLogs.length > 0 || Boolean(context.raceGoal);

  const guardrailMsgBg = guardrail.tone === "danger" ? "bg-[var(--color-danger-soft)]"
    : guardrail.tone === "warning" ? "bg-[var(--color-warning-soft)]"
    : guardrail.tone === "caution" ? "bg-[var(--surface-muted)]"
    : guardrail.tone === "success" ? "bg-[var(--primary-soft)]"
    : "bg-[var(--surface-muted)]";

  const guardrailMsgColor = guardrail.tone === "danger" ? "text-[var(--status-rest)]"
    : guardrail.tone === "warning" ? "text-[var(--color-warning)]"
    : guardrail.tone === "caution" ? "text-[var(--muted-text)]"
    : guardrail.tone === "success" ? "text-[var(--primary-strong)]"
    : "text-[var(--muted-text)]";

  return (
    <section className="card p-4" data-testid="coach-context-dashboard">
      {/* Stance + score badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">โค้ชใช้ข้อมูลจาก Report</p>
          <p className={`mt-1 text-base font-extrabold ${stanceColor}`}>{stanceLabel}</p>
        </div>
        {score != null && (
          <div
            data-testid="coach-score-badge"
            className={`shrink-0 flex h-16 w-16 flex-col items-center justify-center rounded-full border-2 ${scoreRing} ${scoreBg}`}
            style={{ boxShadow: `0 0 12px ${scoreGlow}` }}
          >
            <p className={`text-xl font-extrabold leading-none ${scoreTextColor}`}>{score}</p>
            <p className="mt-0.5 text-[9px] text-[var(--muted-text)]">{runmateLabel ?? "Fair"}</p>
          </div>
        )}
      </div>

      {/* Contextual guardrail message */}
      {recSys && guardrail.tone !== "neutral" && (
        <div className={`mt-2 rounded-2xl px-3 py-2 ${guardrailMsgBg}`} data-testid="coach-guardrail-message">
          <p className={`text-[11px] font-semibold leading-snug ${guardrailMsgColor}`}>
            {guardrail.shortThaiCopy}
          </p>
        </div>
      )}

      {/* Mini axis row */}
      {recSys && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-rm-muted">
          <span>ฟื้นตัว {Math.round(recSys.axes.recovery.score)}</span>
          <span className="text-rm-border">·</span>
          <span>โหลด {Math.round(recSys.axes.load.score)}</span>
          <span className="text-rm-border">·</span>
          <span>นอน {Math.round(recSys.axes.sleep.score)}</span>
          <span className="text-rm-border">·</span>
          <span>พลังงาน {Math.round(recSys.axes.fuel.score)}</span>
        </div>
      )}

      {/* Context chips */}
      {contextChips.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {contextChips.map((chip) => (
            <span
              key={chip.label}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                chip.highlight
                  ? "bg-[var(--primary-soft)] text-[var(--primary-strong)]"
                  : "bg-[var(--surface-muted)] text-[var(--foreground)]"
              }`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : !hasUsefulData ? (
        <p className="mt-2.5 text-xs text-[var(--muted-text)]">ยังมีข้อมูลไม่มาก ลองอัปโหลด Report เพิ่ม</p>
      ) : null}

      {/* Details toggle */}
      <details className="group mt-2.5 cursor-pointer">
        <summary className="flex list-none items-center gap-1 text-xs font-bold text-[var(--primary)]">
          <span className="group-open:hidden">ดูบริบท</span>
          <span className="hidden group-open:inline">ซ่อน</span>
          <span className="transition-transform group-open:rotate-180">▾</span>
        </summary>

        <div className="mt-3 cursor-default space-y-2 border-t border-[var(--color-border-soft)] pt-3">
          {/* Source summary */}
          <div className={`rounded-2xl p-3 ${hasUsefulData ? "bg-[var(--primary-soft)]" : "bg-rm-caution-soft"}`}>
            {hasUsefulData ? (
              <>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--primary-strong)]">อ้างอิงจาก</p>
                <p className="mt-1 text-sm leading-6 text-[var(--foreground)]">{buildSourceSummary(context)}</p>
              </>
            ) : (
              <>
                <p className="font-bold text-rm-caution">โค้ชยังมีข้อมูลน้อย</p>
                <p className="text-sm text-rm-caution">ลอง Upload ผลวิ่ง อาหาร หรือ Sleep score เพื่อให้คำแนะนำแม่นขึ้น</p>
              </>
            )}
          </div>

          {/* Recovery axes breakdown */}
          {recSys && (
            <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--label-color)]">Recovery วันนี้</p>
              {recSys.headline ? (
                <p className="mt-1 text-xs font-semibold text-[var(--foreground)]">{recSys.headline}</p>
              ) : null}
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {(["recovery", "sleep", "load", "fuel"] as const).map((axis) => (
                  <div key={axis} className="flex items-center justify-between rounded-xl bg-[var(--surface)]/70 px-2.5 py-1.5">
                    <span className="text-xs text-[var(--muted-text)]">{AXIS_LABELS[axis]}</span>
                    <span className="text-xs font-bold text-[var(--foreground)]">{formatAxisScore(recSys.axes[axis].score)} · {getRecoveryAxisLabel(axis, recSys.axes[axis].score)}</span>
                  </div>
                ))}
              </div>
              {recSys.guardrails?.length > 0 && (
                <ul className="mt-2 list-disc pl-4 space-y-0.5 text-xs text-[var(--muted-text)]">
                  {recSys.guardrails.slice(0, 3).map((g, i) => <li key={i}>{g}</li>)}
                </ul>
              )}
            </div>
          )}

          {/* Sleep details */}
          {context.sleep7d.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--recovery-blue)]">การนอน</p>
              <p className="mt-1 text-xs text-[var(--foreground)]">
                {[
                  context.sleepAvg7dText && `เฉลี่ย ${context.sleepAvg7dText}`,
                  context.avgReadiness != null && `readiness เฉลี่ย ${context.avgReadiness}%`,
                  context.sleepNightCount7d > 0 && `จาก ${context.sleepNightCount7d} คืน`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}

          {/* Race context */}
          {context.raceGoal && (
            <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--recovery-blue)]">เป้าหมายแข่ง</p>
              <p className="mt-1 text-xs text-[var(--foreground)]">
                {[
                  context.raceName,
                  context.raceDistance,
                  context.daysUntilRace != null && `อีก ${context.daysUntilRace} วัน`,
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          )}

          {/* Pain status */}
          {context.recentPainLogs.length > 0 && (
            <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--recovery-blue)]">อาการเจ็บ (7 วัน)</p>
              <p className="mt-1 text-xs text-[var(--foreground)]">
                {context.activePain && context.latestPain
                  ? `เจ็บ${(context.latestPain as { painLocation: string; painLevel: number }).painLocation ?? ""} ${(context.latestPain as { painLevel: number }).painLevel}/10 — ยังมีอาการ`
                  : context.painResolved && context.latestPain
                  ? `เจ็บ${(context.latestPain as { painLocation: string }).painLocation ?? ""}หายแล้ว — แนะนำเริ่มเบาก่อน`
                  : "ไม่มีอาการเจ็บล่าสุด"}
              </p>
            </div>
          )}

          {/* Run summary */}
          {context.runDays7d > 0 && (
            <div className="rounded-2xl border border-[var(--border-warm)]/55 bg-[var(--surface-muted)]/80 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--recovery-blue)]">การวิ่ง 7 วัน</p>
              <p className="mt-1 text-xs text-[var(--foreground)]">
                {context.totalRunKm} กม. · {context.runDays7d} วัน
                {context.lastRun ? ` · ล่าสุด ${context.lastRun.km} กม.` : ""}
              </p>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}

const AXIS_LABELS: Record<"recovery" | "sleep" | "load" | "fuel", string> = {
  recovery: "ฟื้นตัว",
  sleep: "การนอน",
  load: "โหลดซ้อม",
  fuel: "พลังงาน",
};

type ContextChip = { label: string; highlight?: boolean };

function buildContextChips(context: CoachContext, recSys: RunMateRecoverySystem | null): ContextChip[] {
  const chips: ContextChip[] = [];

  if (context.latestSleepDurationText) {
    chips.push({ label: `นอน ${context.latestSleepDurationText}` });
  } else if (context.sleepAvg7dText) {
    chips.push({ label: `นอนล่าสุด ${context.sleepAvg7dText}` });
  }

  const latestPain = context.latestPain as { painLocation: string; painLevel: number } | null;
  if (context.activePain && latestPain) {
    const loc = latestPain.painLocation;
    chips.push({ label: loc && loc !== "ไม่ระบุ" ? `เจ็บ${loc} ${latestPain.painLevel}/10` : `เจ็บ ${latestPain.painLevel}/10` });
  } else if (context.painResolved) {
    chips.push({ label: "เจ็บดีขึ้นแล้ว" });
  }

  if (context.raceGoal && context.daysUntilRace != null) {
    chips.push({ label: `แข่งอีก ${context.daysUntilRace} วัน`, highlight: true });
  }

  if (context.runDays7d > 0) {
    chips.push({ label: `วิ่ง ${context.runDays7d}/7 วัน` });
  }

  if (recSys) {
    if (recSys.axes.load.score >= 75) {
      chips.push({ label: "Load สูง" });
    } else if (recSys.axes.sleep.score < 50) {
      chips.push({ label: "นอนน้อย" });
    }
  }

  return chips.slice(0, 6);
}

function buildSourceSummary(context: CoachContext): string {
  const items: string[] = [];

  if (context.sleepAvg7dText) {
    items.push(`นอนล่าสุด ${context.sleepAvg7dText}`);
  }

  if (context.activePain) {
    const latestPain = (context.latestPain ?? context.recentPainLogs[0]) as { painLocation: string; painLevel: number } | null;
    if (latestPain) {
      items.push(`เจ็บ${latestPain.painLocation} ${latestPain.painLevel}/10`);
    }
  } else if (context.painResolved) {
    const latestPain = (context.latestPain ?? context.recentPainLogs[0]) as { painLocation: string } | null;
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

  return items.slice(0, 4).join(" · ") || "ยังไม่มีข้อมูลพอ";
}
