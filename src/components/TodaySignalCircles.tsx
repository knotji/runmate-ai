"use client";

import type { TodaySignal, SignalTone } from "@/lib/readiness/readinessTypes";

// Status colors aligned with ReadinessGauge palette
const CARD_STYLE: Record<SignalTone, { border: string; bg: string; text: string }> = {
  good:    { border: "rgba(122,171,143,0.35)", bg: "rgba(122,171,143,0.08)", text: "#3d7a59" },
  warn:    { border: "rgba(200,146,42,0.35)",   bg: "rgba(200,146,42,0.08)",  text: "#9b6820" },
  bad:     { border: "rgba(210,95,95,0.35)",    bg: "rgba(210,95,95,0.08)",   text: "#a83030" },
  neutral: { border: "rgba(139,147,160,0.30)",  bg: "rgba(139,147,160,0.06)", text: "#7a8296" },
};

// How many of the 5 segments light up per tone. Neutral (no data) stays
// fully empty so "ไม่มีข้อมูล" reads as missing data, not a low score.
const SEGMENTS_ON: Record<SignalTone, number> = {
  good: 5,
  warn: 3,
  bad: 2,
  neutral: 0,
};

const SEGMENT_COUNT = 5;

type SignalGaugePillProps = {
  icon: string;
  label: string;
  value: string;
  tone: SignalTone;
};

function SignalGaugePill({ icon, label, value, tone }: SignalGaugePillProps) {
  const style = CARD_STYLE[tone];
  const segmentsOn = SEGMENTS_ON[tone];

  return (
    <div
      className="flex flex-col gap-1.5 rounded-2xl border px-2.5 py-2"
      style={{ borderColor: style.border, background: style.bg }}
      data-testid="signal-circle"
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="flex items-center gap-1 text-[10.5px] font-bold leading-none" style={{ color: style.text }}>
          <span style={{ fontSize: 13 }} aria-hidden="true">{icon}</span>
          <span>{label}</span>
        </span>
        <span className="text-[10.5px] font-black leading-none whitespace-nowrap" style={{ color: style.text }}>
          {value}
        </span>
      </div>
      <div className="flex gap-[3px]" aria-hidden="true">
        {Array.from({ length: SEGMENT_COUNT }, (_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full"
            style={{ background: i < segmentsOn ? style.text : "var(--surface-muted)" }}
          />
        ))}
      </div>
    </div>
  );
}

export type TodaySignalCirclesProps = {
  signals: TodaySignal[];
  sickHardStop?: boolean;
  hasActivePain?: boolean;
};

export function TodaySignalCircles({ signals, sickHardStop, hasActivePain }: TodaySignalCirclesProps) {
  // When sick hard-stop is active and there's no active pain, replace the pain
  // signal with a sick signal so the circle count stays at 4.
  const displaySignals = (sickHardStop && !hasActivePain)
    ? signals.map((s) =>
        s.key === "pain"
          ? { key: "sick", label: "ป่วย", value: "ควรพัก", icon: "🔴", tone: "bad" as SignalTone }
          : s
      )
    : signals;

  return (
    <div
      className="grid flex-1 grid-cols-2 gap-1.5"
      data-testid="signal-circles"
    >
      {displaySignals.map((signal) => (
        <SignalGaugePill
          key={signal.key}
          icon={signal.icon}
          label={signal.label}
          value={signal.value}
          tone={signal.tone as SignalTone}
        />
      ))}
    </div>
  );
}
