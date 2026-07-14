import { cn } from "@/lib/cn";
import { toneClassNames, type RmTone } from "./tone";

export type SoftMetricProps = {
  value?: number | null;
  max?: number;
  label?: string;
  tone?: RmTone;
  caption?: string;
  size?: number;
  className?: string;
};

const RADIUS = 48;
const CENTER = 60;
const STROKE_WIDTH = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Generic glanceable metric ring for non-readiness metrics (weekly km,
 * completion %, etc). For the Today readiness score, keep using
 * ReadinessGauge — its markup is depended on by e2e tests.
 */
export function SoftMetric({
  value,
  max = 100,
  label,
  tone = "neutral",
  caption,
  size = 120,
  className,
}: SoftMetricProps) {
  const toneStyle = toneClassNames[tone];
  const hasValue = typeof value === "number" && Number.isFinite(value);
  const clamped = hasValue ? Math.max(0, Math.min(value as number, max)) : 0;
  const progress = max > 0 ? clamped / max : 0;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" width={size} height={size} className="-rotate-90">
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--rm-border)"
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className={toneStyle.text}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="rm-metric" style={{ fontSize: size * 0.3 }}>
            {hasValue ? Math.round(value as number) : "–"}
          </span>
        </div>
      </div>
      {label ? <span className="rm-card-title">{label}</span> : null}
      {caption ? <span className="rm-caption">{caption}</span> : null}
    </div>
  );
}
