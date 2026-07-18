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
    <section className="card space-y-2.5 p-4" data-testid="daily-briefing-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--label-color)]">สรุปวันนี้</p>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-base leading-none" aria-hidden="true">📋</span>
        <p className="text-sm leading-6 text-[var(--foreground)]" data-testid="daily-briefing-yesterday">{briefing.yesterdaySummary}</p>
      </div>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-base leading-none" aria-hidden="true">🌙</span>
        <p className="text-sm leading-6 text-[var(--foreground)]" data-testid="daily-briefing-sleep">{briefing.sleepTonightSentence}</p>
      </div>
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-base leading-none" aria-hidden="true">🍱</span>
        <p className="text-sm leading-6 text-[var(--foreground)]" data-testid="daily-briefing-food">{briefing.foodTodaySentence}</p>
      </div>
    </section>
  );
}
