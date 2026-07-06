"use client";

import Link from "next/link";
import { GOAL_LABEL_TH } from "@/lib/goals/goalTypes";
import { buildGoalAwareRecommendation } from "@/lib/goals/goalAwareRecommendation";
import type { UserGoalProfile } from "@/lib/goals/goalTypes";
import type { ReadinessBand, LoadTarget } from "@/lib/readiness/readinessTypes";

type Props = {
  goalProfile: UserGoalProfile;
  band: ReadinessBand;
  loadTarget: LoadTarget;
  hasPain: boolean;
};

export function GoalAwareTodayStrip({ goalProfile, band, loadTarget, hasPain }: Props) {
  const rec = buildGoalAwareRecommendation({ goalProfile, band, loadTarget, hasPain });

  const primaryLabel = GOAL_LABEL_TH[goalProfile.primaryGoal] ?? goalProfile.primaryGoal;
  const secondaryLabels = goalProfile.secondaryGoals.map((g) => GOAL_LABEL_TH[g] ?? g);

  const hasNotes = rec.secondaryNotes.length > 0 || rec.guardrailNotes.length > 0;

  return (
    <div className="rounded-2xl border border-[var(--border-warm)]/60 bg-[var(--surface-muted)]/80 px-4 py-3 space-y-2.5" data-testid="goal-aware-strip">
      {/* Header: which goals this serves + edit link */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">วันนี้ช่วยเป้าหมาย</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--primary-strong)]">
              {primaryLabel}
            </span>
            {secondaryLabels.map((label) => (
              <span key={label} className="rounded-full bg-[var(--surface-muted)] border border-[var(--border-warm)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--foreground)]">
                {label}
              </span>
            ))}
          </div>
        </div>
        <Link href="/settings?tab=goals" className="shrink-0 text-[10px] font-semibold text-[var(--primary)] hover:underline mt-0.5">
          แก้ไข
        </Link>
      </div>

      {/* Main task for today */}
      <div className="space-y-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--label-color)]">งานหลักวันนี้</p>
        <p className="text-xs font-semibold text-[var(--foreground)]" data-testid="goal-strip-summary">
          {rec.summaryTh}
        </p>
      </div>

      {/* Status badges */}
      {rec.blockedBy && (
        <div>
          {rec.blockedBy === "pain" && (
            <span className="inline-block rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[10px] font-bold text-red-700">
              หยุดพัก — อาการเจ็บ
            </span>
          )}
          {rec.blockedBy === "recovery" && (
            <span className="inline-block rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[10px] font-bold text-orange-700">
              Recovery ต่ำ — ลดโหลด
            </span>
          )}
          {rec.blockedBy === "guardrail" && (
            <span className="inline-block rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
              ปรับตามกันพลาด
            </span>
          )}
        </div>
      )}

      {/* Supplementary notes */}
      {hasNotes && (
        <div className="space-y-1 pt-0.5">
          {rec.guardrailNotes.map((note, i) => (
            <p key={i} className="text-[11px] text-amber-700 leading-snug">⚠️ {note}</p>
          ))}
          {rec.secondaryNotes.slice(0, 1).map((note, i) => (
            <p key={i} className="text-[11px] text-[var(--muted-text)] leading-snug">💡 {note}</p>
          ))}
        </div>
      )}
    </div>
  );
}
