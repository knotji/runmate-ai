"use client";

import type { TodaySignal, SignalTone } from "@/lib/readiness/readinessTypes";

const CARD_CLASS: Record<SignalTone, string> = {
  good: "bg-[var(--color-success)]/10 border-[var(--color-success)]/20 text-[var(--color-success)]",
  warn: "bg-amber-50 border-amber-200/70 text-amber-700",
  bad: "bg-red-50 border-red-200/70 text-red-600",
  neutral: "bg-slate-50/80 border-slate-200/60 text-slate-400",
};

const DOT_CLASS: Record<SignalTone, string> = {
  good: "bg-[var(--color-success)]",
  warn: "bg-amber-400",
  bad: "bg-red-400",
  neutral: "bg-slate-300",
};

export function ReadinessSignalBars({ signals }: { signals: TodaySignal[] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5" data-testid="readiness-signal-bars">
      {signals.map((signal) => (
        <SignalBar key={signal.key} signal={signal} />
      ))}
    </div>
  );
}

function SignalBar({ signal }: { signal: TodaySignal }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-2xl border px-1.5 py-2.5 text-center ${CARD_CLASS[signal.tone]}`}
      data-testid={`signal-bar-${signal.key}`}
    >
      <span className="text-[15px] leading-none">{signal.icon}</span>
      <span className="text-[9px] font-black uppercase tracking-wider leading-none opacity-80">
        {signal.label}
      </span>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${DOT_CLASS[signal.tone]}`} />
        <span className="text-[10px] font-bold leading-tight">{signal.value}</span>
      </div>
    </div>
  );
}
