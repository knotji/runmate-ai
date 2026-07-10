"use client";

export type { GaugeStatus } from "@/lib/readiness/gaugeStatus";
import type { GaugeStatus } from "@/lib/readiness/gaugeStatus";

export type ReadinessGaugeProps = {
  score?: number | null;
  label: string;          // e.g. "Good", "ล่าสุด · Good"
  status: GaugeStatus;
  headlineTh: string;     // e.g. "วันนี้ควรพักก่อน"
  sublineTh?: string;     // one short line
  loading?: boolean;
  chipClassName?: string; // optional override for chip bg
};

const STATUS_COLORS: Record<GaugeStatus, { ring: string; track: string; text: string }> = {
  good:     { ring: "#7aab8f", track: "#d5ede4", text: "#3d7a59" },
  fair:     { ring: "#c8922a", track: "#f5e4c4", text: "#9b6820" },
  caution:  { ring: "#c8922a", track: "#f5e4c4", text: "#9b6820" },
  recovery: { ring: "#c97c3a", track: "#f5dcc8", text: "#a05c28" },
  risk:     { ring: "#d25f5f", track: "#f5cece", text: "#a83030" },
  unknown:  { ring: "#b0b8b0", track: "#e8ebe8", text: "#7a847a" },
};

const RADIUS = 48;
const CENTER = 60;
const STROKE_WIDTH = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ReadinessGauge({
  score,
  label,
  status,
  headlineTh,
  sublineTh,
  loading,
  chipClassName,
}: ReadinessGaugeProps) {
  const colors = STATUS_COLORS[status];
  const progress =
    score != null ? Math.min(1, Math.max(0, score / 100)) * CIRCUMFERENCE : 0;

  return (
    <div className="flex items-center gap-3" data-testid="readiness-gauge">
      {/* SVG Ring with score overlay */}
      <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
        <svg viewBox="0 0 120 120" width={80} height={80} aria-hidden="true">
          {/* Track ring */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={loading ? "#e8ebe8" : colors.track}
            strokeWidth={STROKE_WIDTH}
          />
          {/* Progress ring or loading dashes */}
          {loading ? (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#b0b8b0"
              strokeWidth={STROKE_WIDTH}
              strokeDasharray="8 6"
            />
          ) : score != null ? (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke={colors.ring}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${progress} ${CIRCUMFERENCE}`}
              style={{
                transformOrigin: `${CENTER}px ${CENTER}px`,
                transform: "rotate(-90deg)",
              }}
            />
          ) : null}
        </svg>

        {/* Center text overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="font-black tabular-nums leading-none"
            style={{ fontSize: 22, color: loading ? "#b0b8b0" : colors.text }}
          >
            {loading || score == null ? "—" : score}
          </span>
          <span
            className="mt-0.5 leading-none text-slate-400"
            style={{ fontSize: 8, fontWeight: 600 }}
          >
            Readiness
          </span>
        </div>
      </div>

      {/* Right side: headline + chip + optional subline */}
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[15px] font-black text-[var(--foreground)] leading-snug tracking-[-0.01em]">
          {headlineTh}
        </p>

        {/* Chip — MUST remain visible; E2E tests query .rounded-full with "N Readiness Label" */}
        {!loading && score != null && label && (
          <span
            className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] ${
              chipClassName ?? "bg-slate-100 text-slate-600"
            }`}
          >
            {score} Readiness {label}
          </span>
        )}

        {sublineTh && (
          <p className="text-[11px] font-medium text-[var(--color-text-soft)] leading-tight">
            {sublineTh}
          </p>
        )}
      </div>
    </div>
  );
}
