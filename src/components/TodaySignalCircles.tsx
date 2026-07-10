"use client";

import type { TodaySignal, SignalTone } from "@/lib/readiness/readinessTypes";

// Status colors aligned with ReadinessGauge palette
const RING_COLOR: Record<SignalTone, string> = {
  good:    "#7aab8f",
  warn:    "#c8922a",
  bad:     "#d25f5f",
  neutral: "#b0b8b0",
};

const TRACK_COLOR: Record<SignalTone, string> = {
  good:    "#d5ede4",
  warn:    "#f5e4c4",
  bad:     "#f5cece",
  neutral: "#e8ebe8",
};

const TEXT_COLOR: Record<SignalTone, string> = {
  good:    "#3d7a59",
  warn:    "#9b6820",
  bad:     "#a83030",
  neutral: "#7a847a",
};

const SMALL_RADIUS = 20;
const SMALL_CENTER = 26;
const SMALL_STROKE = 4;
const SMALL_CIRC = 2 * Math.PI * SMALL_RADIUS;

type SignalCircleProps = {
  icon: string;
  label: string;
  value: string;
  tone: SignalTone;
};

function SignalCircle({ icon, label, value, tone }: SignalCircleProps) {
  const ringColor = RING_COLOR[tone];
  const trackColor = TRACK_COLOR[tone];
  const textColor = TEXT_COLOR[tone];

  // Partial fill based on tone to give a visual hint
  const fillFraction = tone === "good" ? 1 : tone === "warn" ? 0.65 : tone === "bad" ? 0.4 : 0.5;
  const progress = fillFraction * SMALL_CIRC;

  return (
    <div
      className="flex flex-col items-center gap-0.5"
      data-testid="signal-circle"
    >
      {/* Ring with icon overlay */}
      <div className="relative" style={{ width: 52, height: 52 }}>
        <svg viewBox="0 0 52 52" width={52} height={52} aria-hidden="true">
          {/* Track */}
          <circle
            cx={SMALL_CENTER}
            cy={SMALL_CENTER}
            r={SMALL_RADIUS}
            fill="none"
            stroke={trackColor}
            strokeWidth={SMALL_STROKE}
          />
          {/* Arc */}
          <circle
            cx={SMALL_CENTER}
            cy={SMALL_CENTER}
            r={SMALL_RADIUS}
            fill="none"
            stroke={ringColor}
            strokeWidth={SMALL_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${SMALL_CIRC}`}
            style={{
              transformOrigin: `${SMALL_CENTER}px ${SMALL_CENTER}px`,
              transform: "rotate(-90deg)",
            }}
          />
        </svg>
        {/* Icon overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: 18, lineHeight: 1 }}>{icon}</span>
        </div>
      </div>

      {/* Label */}
      <span
        className="text-[9px] font-semibold leading-none text-center"
        style={{ color: textColor }}
      >
        {label}
      </span>

      {/* Value */}
      <span
        className="text-[9px] font-bold leading-none text-center"
        style={{ color: textColor }}
      >
        {value}
      </span>
    </div>
  );
}

export type TodaySignalCirclesProps = {
  signals: TodaySignal[];
  sickHardStop?: boolean;
};

export function TodaySignalCircles({ signals, sickHardStop }: TodaySignalCirclesProps) {
  return (
    <div
      className="flex flex-wrap gap-2"
      data-testid="signal-circles"
    >
      {signals.map((signal) => (
        <SignalCircle
          key={signal.key}
          icon={signal.icon}
          label={signal.label}
          value={signal.value}
          tone={signal.tone}
        />
      ))}

      {sickHardStop && (
        <SignalCircle
          icon="🔴"
          label="ป่วย"
          value="ควรพัก"
          tone="bad"
        />
      )}
    </div>
  );
}
