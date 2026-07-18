"use client";

import { buildDailyBriefing } from "@/lib/dailyBriefing";
import type { CoachContext } from "@/lib/buildCoachContext";

/**
 * Three plain-language sentences, nothing to expand, nothing to read past —
 * the first thing on the Today page, above the score/axis breakdown. See
 * src/lib/dailyBriefing.ts for why: the app had plenty of AI-derived data but
 * none of it was phrased as "here's what to do", just scores to interpret.
 */
export function DailyBriefingCard({ coachCtx }: { coachCtx: CoachContext | null }) {
  if (!coachCtx) return null;
  const briefing = buildDailyBriefing(coachCtx);
  if (!briefing.hasEnoughData) return null;

  return (
    <section 
      className="relative overflow-hidden rounded-2xl border border-[var(--color-border-soft)] bg-[var(--surface-muted)]/40 p-4 shadow-sm"
      data-testid="daily-briefing-card"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[var(--primary)] to-[var(--primary-strong)]/60" />
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--label-color)] mb-2.5 pl-1.5">สรุปวันนี้</p>
      <div className="space-y-2.5 pl-1.5">
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 text-sm leading-none pt-0.5" aria-hidden="true">📋</span>
          <p className="text-xs font-semibold leading-relaxed text-[var(--foreground)]" data-testid="daily-briefing-yesterday">{briefing.yesterdaySummary}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 text-sm leading-none pt-0.5" aria-hidden="true">🌙</span>
          <p className="text-xs font-semibold leading-relaxed text-[var(--foreground)]" data-testid="daily-briefing-sleep">{briefing.sleepTonightSentence}</p>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="shrink-0 text-sm leading-none pt-0.5" aria-hidden="true">🍱</span>
          <p className="text-xs font-semibold leading-relaxed text-[var(--foreground)]" data-testid="daily-briefing-food">{briefing.foodTodaySentence}</p>
        </div>
      </div>
    </section>
  );
}
