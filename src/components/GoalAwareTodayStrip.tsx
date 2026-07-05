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

  const hasNotes = rec.secondaryNotes.length > 0 || rec.guardrailNotes.length > 0;

  return (
    <div className="rounded-2xl border border-[var(--border-warm)]/60 bg-[var(--surface-muted)]/80 px-4 py-3 space-y-2" data-testid="goal-aware-strip">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">เป้าหมาย</span>
          <span className="rounded-full bg-[var(--primary-soft)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--primary-strong)]">
            {GOAL_LABEL_TH[goalProfile.primaryGoal] ?? goalProfile.primaryGoal}
          </span>
          {rec.blockedBy === "guardrail" && (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              ปรับลดโหลดตามเป้าหมาย
            </span>
          )}
          {rec.blockedBy === "pain" && (
            <span className="rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-bold text-red-700">
              หยุดพัก — อาการเจ็บ
            </span>
          )}
          {rec.blockedBy === "recovery" && (
            <span className="rounded-full bg-orange-50 border border-orange-200 px-2 py-0.5 text-[10px] font-bold text-orange-700">
              Recovery ต่ำ
            </span>
          )}
        </div>
        <Link href="/settings?tab=goals" className="shrink-0 text-[10px] font-semibold text-[var(--primary)] hover:underline">
          แก้ไข
        </Link>
      </div>

      <p className="text-xs font-semibold text-[var(--foreground)]">
        {rec.summaryTh}
      </p>

      {hasNotes && (
        <div className="space-y-1">
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
