"use client";

import { useEffect, useRef, useState } from "react";

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
  good:     { ring: "#1f9d55", track: "rgba(26,31,46,0.08)", text: "#1f9d55" },
  fair:     { ring: "#d9a123", track: "rgba(26,31,46,0.08)", text: "#d9a123" },
  caution:  { ring: "#d9a123", track: "rgba(26,31,46,0.08)", text: "#d9a123" },
  recovery: { ring: "#0891b2", track: "rgba(26,31,46,0.08)", text: "#0891b2" },
  risk:     { ring: "#c9384a", track: "rgba(26,31,46,0.08)", text: "#c9384a" },
  unknown:  { ring: "#8b93a0", track: "rgba(26,31,46,0.06)", text: "#5b6570" },
};

const RADIUS = 48;
const CENTER = 60;
const STROKE_WIDTH = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const COUNT_UP_MS = 700;

type CountUpState = { value: number; forTarget: number };

function useCountUp(target: number | null | undefined, active: boolean): number | null {
  const [state, setState] = useState<CountUpState | null>(null);
  const prevTargetRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const prev = prevTargetRef.current;
    prevTargetRef.current = target;

    const reduceMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (!active || target == null || prev === target || reduceMotion) {
      return;
    }

    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / COUNT_UP_MS);
      const eased = 1 - Math.pow(1 - progress, 3);
      setState({ value: Math.round(target * eased), forTarget: target });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active]);

  if (target == null) return null;
  return state && state.forTarget === target ? state.value : target;
}

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
  const displayScore = useCountUp(score, !loading && score != null);
  const progress =
    displayScore != null ? Math.min(1, Math.max(0, displayScore / 100)) * CIRCUMFERENCE : 0;

  return (
    <div className="flex items-center gap-3" data-testid="readiness-gauge">
      {/* SVG Ring with score overlay */}
      <div
        className="relative shrink-0"
        style={{
          width: 80,
          height: 80,
          filter: !loading && score != null ? `drop-shadow(0 0 7px ${colors.ring}55)` : undefined,
        }}
      >
        <svg viewBox="0 0 120 120" width={80} height={80} aria-hidden="true">
          {/* Track ring */}
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={loading ? "rgba(26,31,46,0.06)" : colors.track}
            strokeWidth={STROKE_WIDTH}
          />
          {/* Progress ring or loading dashes */}
          {loading ? (
            <circle
              cx={CENTER}
              cy={CENTER}
              r={RADIUS}
              fill="none"
              stroke="#c3c8cf"
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
            className="font-bold tabular-nums leading-none"
            style={{ fontSize: 22, color: loading ? "#8b93a0" : colors.text, fontFamily: "var(--font-display), var(--font-noto-thai), sans-serif" }}
          >
            {loading || displayScore == null ? "—" : displayScore}
          </span>
          <span
            className="mt-0.5 leading-none text-[var(--color-text-soft)]"
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
            className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ${
              chipClassName ?? "bg-[var(--surface-muted)] text-[var(--color-text-muted)]"
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
