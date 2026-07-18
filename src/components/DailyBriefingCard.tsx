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
      className="relative py-1.5 pl-3.5 border-l-2 border-[var(--primary)] select-none"
      data-testid="daily-briefing-card"
    >
      <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--primary)] mb-1.5">สรุปวันนี้</p>
      <div className="space-y-1.5 text-xs text-[var(--color-text-soft)] font-semibold leading-relaxed">
        <p data-testid="daily-briefing-yesterday">{briefing.yesterdaySummary}</p>
        <p data-testid="daily-briefing-sleep">{briefing.sleepTonightSentence}</p>
        <p data-testid="daily-briefing-food">{briefing.foodTodaySentence}</p>
      </div>
    </section>
  );
}
