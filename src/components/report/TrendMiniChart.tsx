"use client";

import { useState } from "react";
import { formatDayLabelShort } from "@/lib/report/reportDisplay";

export type TrendChartPoint = { dateKey: string; value: number | null };

const WIDTH = 300;
const HEIGHT = 96;
const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 8;

/** Compact single-series line trend — sleep hours or readiness over the last N
 *  days. A single series needs no legend box (the title already names it); the
 *  gap between the axis min/max and rendered points keeps flat series legible. */
export function TrendMiniChart({
  title,
  unit,
  points,
  color,
  formatValue,
}: {
  title: string;
  unit?: string;
  points: TrendChartPoint[];
  color: string;
  formatValue: (value: number) => string;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const values = points.map((p) => p.value).filter((v): v is number => v != null);
  if (values.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface)]/70 p-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</p>
        <p className="mt-2 text-xs text-[var(--color-text-soft)]">ยังไม่มีข้อมูลพอสร้างกราฟ</p>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const domainMin = min === max ? min - 1 : min;
  const domainMax = min === max ? max + 1 : max;

  const plotWidth = WIDTH - PAD_X * 2;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const stepX = points.length > 1 ? plotWidth / (points.length - 1) : 0;

  function xFor(index: number): number {
    return PAD_X + index * stepX;
  }
  function yFor(value: number): number {
    const ratio = (value - domainMin) / (domainMax - domainMin);
    return PAD_TOP + (1 - ratio) * plotHeight;
  }

  // Break the line at gaps (null days) instead of bridging across missing data.
  const segments: { dateKey: string; index: number; value: number }[][] = [];
  let current: { dateKey: string; index: number; value: number }[] = [];
  points.forEach((p, index) => {
    if (p.value == null) {
      if (current.length) segments.push(current);
      current = [];
      return;
    }
    current.push({ dateKey: p.dateKey, index, value: p.value });
  });
  if (current.length) segments.push(current);

  const lastPoint = [...points].reverse().find((p) => p.value != null);
  const lastIndex = lastPoint ? points.indexOf(lastPoint) : -1;

  const active = activeIndex != null ? points[activeIndex] : null;

  return (
    <div className="rounded-xl bg-[var(--surface)]/70 p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</p>
        {lastPoint && (
          <p className="text-xs font-bold" style={{ color }}>
            {formatValue(lastPoint.value!)}{unit ? ` ${unit}` : ""}
          </p>
        )}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-1.5 w-full touch-pan-y"
        role="img"
        aria-label={`${title} ย้อนหลัง ${points.length} วัน`}
        data-testid="trend-mini-chart-svg"
      >
        {/* Reference gridlines: min and max */}
        <line x1={PAD_X} x2={WIDTH - PAD_X} y1={yFor(domainMin)} y2={yFor(domainMin)} stroke="var(--color-border-soft)" strokeWidth={1} />
        <line x1={PAD_X} x2={WIDTH - PAD_X} y1={yFor(domainMax)} y2={yFor(domainMax)} stroke="var(--color-border-soft)" strokeWidth={1} />

        {segments.map((segment, segIndex) => {
          const linePath = segment.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.index)} ${yFor(p.value)}`).join(" ");
          return <path key={segIndex} d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />;
        })}

        {/* A dot at every real data point (not just the endpoint) makes gaps in
            gappy real-world logging visually obvious as missing dots, rather than
            an area fill that renders as disconnected wedges across short segments. */}
        {points.map((p, index) => p.value != null && (
          <circle
            key={p.dateKey}
            cx={xFor(index)}
            cy={yFor(p.value)}
            r={index === lastIndex ? 4 : 2.5}
            fill={color}
            stroke="var(--surface)"
            strokeWidth={index === lastIndex ? 2 : 1}
          />
        ))}

        {/* Crosshair on the active (tapped) point */}
        {active && active.value != null && activeIndex != null && (
          <>
            <line x1={xFor(activeIndex)} x2={xFor(activeIndex)} y1={PAD_TOP} y2={HEIGHT - PAD_BOTTOM} stroke={color} strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
            <circle cx={xFor(activeIndex)} cy={yFor(active.value)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </>
        )}

        {/* One full-height, per-day hit target — bigger than the mark, per the
            interaction pattern; touch-friendly (no hover needed on mobile). */}
        {points.map((p, index) => (
          <rect
            key={p.dateKey}
            x={xFor(index) - stepX / 2}
            y={0}
            width={stepX || WIDTH}
            height={HEIGHT}
            fill="transparent"
            data-testid="trend-mini-chart-hit-target"
            onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
          />
        ))}
      </svg>

      {active && (
        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]" data-testid="trend-mini-chart-tooltip">
          {formatDayLabelShort(active.dateKey)}:{" "}
          <span className="font-bold text-[var(--foreground)]">
            {active.value != null ? `${formatValue(active.value)}${unit ? ` ${unit}` : ""}` : "ไม่มีข้อมูล"}
          </span>
        </p>
      )}
    </div>
  );
}
