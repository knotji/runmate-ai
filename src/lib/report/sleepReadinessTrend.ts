/**
 * Pure helper — no React, no "use client".
 * Builds a per-day sleep-hours + readiness series for the Report trend chart.
 * Reuses buildReportDaySummary (the same per-day aggregation the Calendar Week/
 * Month day slots already use) rather than recomputing sleep/readiness logic —
 * Recovery System scoring itself is untouched.
 */

import type { LocalHistoryItem } from "@/lib/localHistory";
import { getHistoryItemDateKey } from "@/lib/date";
import { buildReportDaySummary } from "@/lib/reportDaySummary";

export type TrendDayPoint = {
  dateKey: string;
  sleepHours: number | null;
  readiness: number | null;
};

function daysBeforeDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00+07:00`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Builds `days` consecutive daily points ending at (and including) `todayDateKey`,
 *  oldest first. */
export function buildSleepReadinessTrend(
  items: LocalHistoryItem[],
  days: number,
  todayDateKey: string,
): TrendDayPoint[] {
  const byDate = new Map<string, LocalHistoryItem[]>();
  for (const item of items) {
    const dateKey = getHistoryItemDateKey(item);
    const list = byDate.get(dateKey);
    if (list) list.push(item);
    else byDate.set(dateKey, [item]);
  }

  const points: TrendDayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const dateKey = daysBeforeDateKey(todayDateKey, i);
    const summary = buildReportDaySummary(byDate.get(dateKey) ?? [], dateKey);
    points.push({ dateKey, sleepHours: summary.sleepHours, readiness: summary.readiness });
  }
  return points;
}
